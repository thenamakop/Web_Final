import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient, ObjectId } from 'mongodb';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.DB_NAME || 'taskmaster';

let client;
let db;

app.use(express.json());

// Basic CORS to support file:// previews or different origins
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Protect HTML pages; allow login/signup pages
app.use(async (req, res, next) => {
  try {
    const isHtml = (req.method === 'GET' || req.method === 'HEAD') && (req.path === '/' || req.path.endsWith('.html'));
    const allowed = ['/login.html', '/signup.html'];
    if (isHtml && !allowed.includes(req.path)) {
      const h = req.headers['authorization'] || '';
      const tokenHeader = h.startsWith('Bearer ') ? h.slice(7) : '';
      const cookie = req.headers['cookie'] || '';
      const tokenCookie = (cookie.match(/(?:^|;\s*)token=([^;]+)/) || [])[1];
      const token = tokenHeader || tokenCookie || '';
      const s = token ? await db.collection('sessions').findOne({ token }) : null;
      if (!s) {
        return res.redirect('/login.html');
      }
    }
  } catch (_) {}
  next();
});

app.use(express.static(__dirname, { index: false }));

async function connectMongo() {
  client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  db = client.db(DB_NAME);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = (stored || '').split(':');
  if (!salt || !hash) return false;
  const calc = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(calc, 'hex'));
}
async function createSession(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  const expiresAt = now + 1000 * 60 * 60 * 24 * 7;
  await db.collection('sessions').insertOne({ token, userId, createdAt: now, expiresAt });
  return token;
}
async function getSession(token) {
  if (!token) return null;
  const s = await db.collection('sessions').findOne({ token });
  if (!s || (s.expiresAt && s.expiresAt < Date.now())) return null;
  return s;
}
async function authRequired(req, res, next) {
  try {
    const h = req.headers['authorization'] || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    const session = await getSession(token);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    req.userId = session.userId;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
    const existing = await db.collection('users').findOne({ email });
    if (existing) return res.status(409).json({ error: 'Email already registered' });
    const passwordHash = hashPassword(password);
    const result = await db.collection('users').insertOne({ name, email, passwordHash, createdAt: Date.now() });
    const token = await createSession(result.insertedId);
    res.status(201).json({ token, user: { id: result.insertedId, name, email } });
  } catch (e) {
    res.status(500).json({ error: 'Signup failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
    const user = await db.collection('users').findOne({ email });
    if (!user || !verifyPassword(password, user.passwordHash)) return res.status(401).json({ error: 'Invalid credentials' });
    const token = await createSession(user._id);
    res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (e) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/auth/me', authRequired, async (req, res) => {
  const user = await db.collection('users').findOne({ _id: new ObjectId(req.userId) }, { projection: { name: 1, email: 1 } });
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({ id: user._id, name: user.name, email: user.email });
});

app.post('/api/auth/logout', authRequired, async (req, res) => {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  await db.collection('sessions').deleteOne({ token });
  res.json({ ok: true });
});
app.get('/api/tasks', authRequired, async (req, res) => {
  try {
    const tasks = await db.collection('tasks').find({ userId: new ObjectId(req.userId) }).sort({ _id: -1 }).toArray();
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

app.post('/api/tasks', authRequired, async (req, res) => {
  try {
    const { title, priority = 'Medium', status = 'backlog', assignee = '', starred = false, deadline } = req.body;
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'Title is required' });
    }
    const now = new Date();
    const doc = {
      title,
      priority,
      status,
      assignee,
      starred: Boolean(starred),
      createdAt: Date.now(),
      assignedAt: now.toISOString(),
      assignedAtIST: now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true }),
      userId: new ObjectId(req.userId)
    };
    if (deadline) {
      // Accept both "YYYY-MM-DDTHH:MM" from datetime-local and ISO strings
      try {
        doc.deadline = new Date(String(deadline).replace(' ', 'T')).toISOString();
      } catch (_) { doc.deadline = null; }
    } else {
      doc.deadline = null;
    }
    const result = await db.collection('tasks').insertOne(doc);
    res.status(201).json({ _id: result.insertedId, ...doc });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create task' });
  }
});

app.patch('/api/tasks/:id', authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const update = {};
    ['title','priority','status','assignee','starred','deadline'].forEach(k => {
      if (req.body[k] !== undefined) update[k] = req.body[k];
    });
    if (update.deadline) {
      try {
        let dstr = String(update.deadline).replace(' ', 'T');
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dstr)) dstr += ':00';
        update.deadline = new Date(dstr).toISOString();
      } catch (_) { delete update.deadline; }
    }
    // If moving to done, stamp completedAt
    if (update.status === 'done') {
      const now = new Date();
      update.completedAt = now.toISOString();
      update.completedAtIST = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true });
    }
    const result = await db.collection('tasks').findOneAndUpdate(
      { _id: new ObjectId(id), userId: new ObjectId(req.userId) },
      { $set: update },
      { returnDocument: 'after' }
    );
    if (!result.value) return res.status(404).json({ error: 'Not found' });
    res.json(result.value);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update task' });
  }
});

app.delete('/api/tasks/:id', authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.collection('tasks').deleteOne({ _id: new ObjectId(id), userId: new ObjectId(req.userId) });
    if (!result.deletedCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

connectMongo()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}/`);
    });
  })
  .catch(err => {
    console.error('MongoDB connection error', err);
    process.exit(1);
  });
async function sessionFromRequest(req) {
  const h = req.headers['authorization'] || '';
  const tokenHeader = h.startsWith('Bearer ') ? h.slice(7) : '';
  const cookie = req.headers['cookie'] || '';
  const tokenCookie = (cookie.match(/(?:^|;\s*)token=([^;]+)/) || [])[1];
  const token = tokenHeader || tokenCookie || '';
  return token ? await db.collection('sessions').findOne({ token }) : null;
}

function sendFile(res, file) {
  res.sendFile(path.join(__dirname, file));
}

app.get('/', async (req, res) => {
  const s = await sessionFromRequest(req);
  if (!s) return res.redirect('/login.html');
  sendFile(res, 'index.html');
});

['/index.html','/tasks.html','/inbox.html','/analytics.html'].forEach(route => {
  app.get(route, async (req, res) => {
    const s = await sessionFromRequest(req);
    if (!s) return res.redirect('/login.html');
    sendFile(res, route.slice(1));
  });
});