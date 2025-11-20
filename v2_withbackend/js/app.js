/**
 * Core application functionality
 */
class AppCore {
  constructor() {
    this.data = null;
    this.currentPage = this._getCurrentPage();
    this.init();
    if (!document.getElementById('toast-root')) {
      const t = document.createElement('div'); t.id = 'toast-root'; t.className = 'toast-container'; document.body.appendChild(t);
    }
  }

  /**
   * Initialize the application
   */
  async init() {
    await this.loadData();
    this.setupThemeToggle();
    this.setupSidebar();
    this.setupNotifications();
    this.renderUserProfile();
    
    // Initialize page-specific functionality
    this.initPageSpecific();
    this.updateTasksStatusWidget();
  }

  /**
   * Load application data from JSON
   */
  async loadData() {
    try {
      const response = await fetch('/data/app-data.json');
      if (!response.ok) {
        throw new Error('Failed to load data');
      }
      this.data = await response.json();
      await this.loadTasksFromAPI();
      // Load authenticated user details
      try {
        const token = localStorage.getItem('token') || '';
        if (token) {
          const base = (window.location.origin && window.location.origin.startsWith('http')) ? '' : 'http://localhost:3000';
          const meRes = await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
          if (meRes.ok) {
            const me = await meRes.json();
            this.data.user = { name: me.name, email: me.email, avatar: (me.name || 'U').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() };
          }
        }
      } catch (_) {}
      console.log('Data loaded successfully');
    } catch (error) {
      console.error('Error loading data:', error);
      // Fallback to empty data structure
      this.data = { user: {}, notifications: [], projects: [], roadmap: {}, tasks: [] };
    }
  }

  async loadTasksFromAPI() {
    try {
      const base = (window.location.origin && window.location.origin.startsWith('http')) ? '' : 'http://localhost:3000';
      const token = localStorage.getItem('token') || '';
      const res = await fetch(`${base}/api/tasks`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error('Failed tasks');
      const tasks = await res.json();
      this.data.tasks = tasks.map(t => ({
        id: t._id || t.id,
        title: t.title,
        priority: t.priority || 'Medium',
        status: t.status || 'backlog',
        assignee: t.assignee || '',
        userId: t.userId,
        starred: Boolean(t.starred),
        createdAt: t.createdAt || Date.now()
      }));
    } catch (e) {
      if (!this.data.tasks) this.data.tasks = [];
    }
  }

  /**
   * Set up theme toggle functionality
   */
  setupThemeToggle() {
    const themeToggle = document.getElementById('theme-toggle');
    if (!themeToggle) return;

    // Check for saved theme preference or system preference
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldDark = savedTheme ? savedTheme === 'dark' : prefersDark;
    document.documentElement.classList.toggle('dark-theme', shouldDark);
    document.body.classList.toggle('dark-theme', shouldDark);
    themeToggle.checked = shouldDark;

    // Handle theme toggle
    themeToggle.addEventListener('change', () => {
      const enable = themeToggle.checked;
      document.documentElement.classList.toggle('dark-theme', enable);
      document.body.classList.toggle('dark-theme', enable);
      localStorage.setItem('theme', enable ? 'dark' : 'light');
    });
  }

  /**
   * Set up sidebar functionality
   */
  setupSidebar() {
    // Highlight active nav link
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('.nav-link, .section-link');
    
    navLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href && (currentPath.endsWith(href) || (currentPath === '/' && href === 'index.html'))) {
        link.classList.add('active');
      }
    });

    const newTaskButtons = Array.from(document.querySelectorAll('.button.button-primary'))
      .filter(b => b.textContent.trim() === '+ New Task');
    newTaskButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.currentPage === 'tasks') {
          this.openTaskModal();
        } else {
          window.location.href = 'tasks.html#new';
        }
      });
    });

    // Logout action
    const profileRow = document.getElementById('profile-row');
    const profileMenu = document.getElementById('profile-menu');
    const logoutAction = document.getElementById('logout-action');
    if (profileRow && profileMenu) {
      profileRow.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = profileMenu.style.display === 'block';
        profileMenu.style.display = open ? 'none' : 'block';
      });
      document.addEventListener('click', () => { profileMenu.style.display = 'none'; });
    }
    logoutAction?.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const base = (window.location.origin && window.location.origin.startsWith('http')) ? '' : 'http://localhost:3000';
        const token = localStorage.getItem('token') || '';
        if (token) await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      } catch (_) {}
      localStorage.removeItem('token');
      document.cookie = 'token=; Path=/; Max-Age=0';
      window.location.href = 'login.html';
    });
  }

  /**
   * Set up notifications functionality
   */
  setupNotifications() {
    const notificationButton = document.querySelector('button[aria-label="Notifications"]');
    if (!notificationButton) return;
    
    // Update notification count
    const unreadCount = this.data?.notifications?.filter(n => !n.isRead).length || 0;
    
    if (unreadCount > 0) {
      // Create or update notification badge
      let badge = notificationButton.querySelector('.notification-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'notification-badge';
        notificationButton.appendChild(badge);
      }
      badge.textContent = unreadCount;
    }
    
    // Add click handler to navigate to inbox
    notificationButton.addEventListener('click', () => {
      window.location.href = 'inbox.html';
    });
  }

  /**
   * Render user profile information
   */
  renderUserProfile() {
    if (!this.data?.user) return;
    
    const profileNameElements = document.querySelectorAll('.profile-name');
    const profileEmailElements = document.querySelectorAll('.profile-email');
    const avatarElements = document.querySelectorAll('.avatar');
    
    profileNameElements.forEach(el => {
      el.textContent = this.data.user.name;
    });
    
    profileEmailElements.forEach(el => {
      el.textContent = this.data.user.email;
    });
    
    avatarElements.forEach(el => {
      el.textContent = this.data.user.avatar;
    });
  }

  /**
   * Initialize page-specific functionality
   */
  initPageSpecific() {
    switch (this.currentPage) {
      case 'index':
        this.initIndexTasks();
        break;
      case 'inbox':
        this.initInboxPage();
        break;
      case 'tasks':
        this.initTasksPage();
        this.updateTasksStatusWidget();
        break;
      case 'roadmap':
        this.initRoadmapPage();
        break;
      case 'projects':
        this.initProjectsPage();
        break;
      // Add other pages as needed
    }
  }

  showToast(message, type='success') {
    let root = document.getElementById('toast-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'toast-root';
      root.className = 'toast-container';
      document.body.appendChild(root);
    }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    root.appendChild(el);
    setTimeout(()=>{ el.remove(); }, 2000);
  }

  initIndexTasks() {
    const board = document.querySelector('.tasks-board');
    if (board) this._renderBoard(board);
    this.updateTasksStatusWidget();
    this.renderRecentActivity();
    this.setupQuickAdd();
    this.renderPinnedTasks();
    this.setupScratchpad();
  }

  /**
   * Initialize inbox page functionality
   */
  initInboxPage() {
    if (this.currentPage !== 'inbox') return;
    
    // Render notifications
    this.renderNotifications();
    
    // Set up tab switching
    const tabs = document.querySelectorAll('.inbox-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        // Remove active class from all tabs
        tabs.forEach(t => t.classList.remove('active'));
        // Add active class to clicked tab
        tab.classList.add('active');
        
        // Filter notifications based on tab
        const filter = tab.textContent.trim().toLowerCase();
        this.filterNotifications(filter);
      });
    });
    
    // Set up mark all as read functionality
    const markAllReadButton = document.querySelector('.mark-all-read');
    if (markAllReadButton) {
      markAllReadButton.addEventListener('click', (e) => {
        e.preventDefault();
        this.markAllNotificationsAsRead();
      });
    }
  }

  /**
   * Render notifications on the inbox page
   */
  renderNotifications() {
    const notificationsList = document.querySelector('.notifications-list');
    if (!notificationsList || !this.data?.notifications) return;
    
    // Clear existing notifications
    notificationsList.innerHTML = '';
    
    if (this.data.notifications.length === 0) {
      // Show empty state
      const emptyState = document.createElement('div');
      emptyState.className = 'empty-state';
      emptyState.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8l8 5 8-5v10zm-8-7L4 6h16l-8 5z" fill="currentColor"></path>
        </svg>
        <h3>No notifications</h3>
        <p>You're all caught up!</p>
      `;
      notificationsList.appendChild(emptyState);
      return;
    }
    
    // Render each notification
    this.data.notifications.forEach(notification => {
      const notificationItem = document.createElement('div');
      notificationItem.className = `notification-item${notification.isRead ? '' : ' unread'}`;
      notificationItem.dataset.id = notification.id;
      notificationItem.dataset.type = notification.type;
      
      notificationItem.innerHTML = `
        <div class="notification-avatar">${notification.sender.avatar}</div>
        <div class="notification-content">
          <div class="notification-header">
            <span class="notification-sender">${notification.sender.name}</span>
            <span class="notification-action">${notification.action}</span>
            ${notification.type ? `<span class="notification-badge">${notification.type}</span>` : ''}
          </div>
          <div class="notification-message">
            ${notification.message}
          </div>
          <div class="notification-meta">
            <div class="notification-info">
              <span class="notification-time">${notification.time}</span>
              <span class="notification-project">${notification.project}</span>
            </div>
            <div class="notification-actions">
              <button title="Mark as read">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20,6 9,17 4,12"></polyline>
                </svg>
              </button>
              <button title="Delete">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3,6 5,6 21,6"></polyline>
                  <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>
      `;
      
      // Add event listeners for notification actions
      const readButton = notificationItem.querySelector('button[title="Mark as read"]');
      if (readButton) {
        readButton.addEventListener('click', () => {
          this.markNotificationAsRead(notification.id);
        });
      }
      
      const deleteButton = notificationItem.querySelector('button[title="Delete"]');
      if (deleteButton) {
        deleteButton.addEventListener('click', () => {
          this.deleteNotification(notification.id);
        });
      }
      
      notificationsList.appendChild(notificationItem);
    });
  }

  /**
   * Filter notifications based on tab selection
   */
  filterNotifications(filter) {
    const notificationItems = document.querySelectorAll('.notification-item');
    
    notificationItems.forEach(item => {
      if (filter === 'all') {
        item.style.display = '';
      } else if (filter === 'unread') {
        item.style.display = item.classList.contains('unread') ? '' : 'none';
      } else if (filter === 'mentions') {
        item.style.display = item.dataset.type === 'mention' ? '' : 'none';
      } else if (filter === 'assigned') {
        item.style.display = item.dataset.type === 'assigned' ? '' : 'none';
      }
    });
  }

  /**
   * Mark a notification as read
   */
  markNotificationAsRead(id) {
    // Update data model
    const notification = this.data.notifications.find(n => n.id === id);
    if (notification) {
      notification.isRead = true;
    }
    
    // Update UI
    const notificationItem = document.querySelector(`.notification-item[data-id="${id}"]`);
    if (notificationItem) {
      notificationItem.classList.remove('unread');
    }
    
    // Update notification count
    this.setupNotifications();
  }

  /**
   * Delete a notification
   */
  deleteNotification(id) {
    // Update data model
    this.data.notifications = this.data.notifications.filter(n => n.id !== id);
    
    // Update UI
    const notificationItem = document.querySelector(`.notification-item[data-id="${id}"]`);
    if (notificationItem) {
      notificationItem.remove();
    }
    
    // Check if we need to show empty state
    if (this.data.notifications.length === 0) {
      this.renderNotifications();
    }
    
    // Update notification count
    this.setupNotifications();
  }

  /**
   * Mark all notifications as read
   */
  markAllNotificationsAsRead() {
    // Update data model
    this.data.notifications.forEach(notification => {
      notification.isRead = true;
    });
    
    // Update UI
    const unreadItems = document.querySelectorAll('.notification-item.unread');
    unreadItems.forEach(item => {
      item.classList.remove('unread');
    });
    
    // Update notification count
    this.setupNotifications();
  }

  /**
   * Initialize roadmap page functionality
   */
  initRoadmapPage() {
    if (this.currentPage !== 'roadmap' || !this.data?.roadmap) return;
    
    // Render roadmap data
    Object.entries(this.data.roadmap).forEach(([quarter, data]) => {
      const quarterElement = document.querySelector(`.quarter[data-quarter="${quarter}"]`);
      if (!quarterElement) return;
      
      // Update progress bar
      const progressBar = quarterElement.querySelector('.progress-bar span');
      if (progressBar) {
        progressBar.style.width = `${data.completion}%`;
      }
      
      // Update progress label
      const progressLabel = quarterElement.querySelector('.progress-label');
      if (progressLabel) {
        progressLabel.textContent = `${data.completion}% Complete`;
      }
      
      // Render initiatives
      const quarterBody = quarterElement.querySelector('.quarter-body');
      if (quarterBody && data.initiatives) {
        data.initiatives.forEach(initiative => {
          const card = document.createElement('div');
          card.className = 'roadmap-card';
          card.dataset.id = initiative.id;
          
          card.innerHTML = `
            <div class="card-top">
              <div class="card-top-left">
                <div class="roadmap-icon">${initiative.id.charAt(0).toUpperCase()}</div>
                <div>
                  <div class="card-title">${initiative.title}</div>
                </div>
              </div>
              <div class="status-pill ${initiative.status}">${initiative.status}</div>
            </div>
          `;
          
          quarterBody.appendChild(card);
        });
      }
    });
  }

  /**
   * Initialize projects page functionality
   */
  initProjectsPage() {
    if (this.currentPage !== 'projects' || !this.data?.projects) return;
    
    // Render projects data
    const projectsList = document.querySelector('.projects-list');
    if (!projectsList) return;
    
    this.data.projects.forEach(project => {
      const projectCard = document.createElement('div');
      projectCard.className = 'project-card';
      projectCard.dataset.id = project.id;
      
      projectCard.innerHTML = `
        <div class="project-header">
          <h3 class="project-title">${project.name}</h3>
          <div class="project-status">${project.status}</div>
        </div>
        <p class="project-description">${project.description}</p>
        <div class="project-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${project.completion}%"></div>
          </div>
          <div class="progress-text">${project.completion}%</div>
        </div>
      `;
      
      projectsList.appendChild(projectCard);
    });
  }

  /**
   * Initialize tasks page functionality
   */
  initTasksPage() {
    if (this.currentPage !== 'tasks') return;
    if (!this.data?.tasks) this.data.tasks = [];

    const board = document.querySelector('.tasks-board');
    if (!board) return;
    this._renderBoard(board);

    const modal = document.getElementById('task-modal');
    const form = document.getElementById('task-form');
    const cancel = document.getElementById('task-cancel');
    const openFromHash = () => {
      if (window.location.hash === '#new') this.openTaskModal();
    };
    openFromHash();
    window.addEventListener('hashchange', openFromHash);

    cancel?.addEventListener('click', () => {
      this.closeTaskModal();
    });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('task-title').value.trim();
      const priority = document.getElementById('task-priority').value;
      const status = document.getElementById('task-status').value;
      const assignee = document.getElementById('task-assignee').value.trim();
      const deadlineInput = document.getElementById('task-deadline').value;
      if (!title) return;
      try {
        const tokenCreate = localStorage.getItem('token') || '';
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(tokenCreate ? { Authorization: `Bearer ${tokenCreate}` } : {}) },
          body: JSON.stringify({ title, priority, status, assignee, deadline: deadlineInput ? `${deadlineInput}:00` : undefined })
        });
        if (!res.ok) throw new Error('Failed to create');
        const created = await res.json();
        const createdAt = created.createdAt || Date.now();
        this.data.tasks.push({
          id: created._id || created.id,
          title: created.title,
          priority: created.priority,
          status: created.status,
          assignee: created.assignee,
          starred: Boolean(created.starred),
          createdAt,
          assignedAt: created.assignedAt,
          assignedAtIST: created.assignedAtIST,
          deadline: created.deadline,
          completedAt: created.completedAt,
          completedAtIST: created.completedAtIST
        });
        this.closeTaskModal();
        const board = document.querySelector('.tasks-board');
        if (board) this._renderBoard(board);
        this.updateTasksStatusWidget();
        this.renderRecentActivity();
      } catch (err) {
      }
    });

    this.updateTasksStatusWidget();
  }

  _renderBoard(board) {
    const columns = board.querySelectorAll('.kanban-column');
    const byStatus = { 'backlog': [], 'in-progress': [], 'review': [], 'done': [] };
    (this.data?.tasks || []).forEach(task => {
      const card = document.createElement('div');
      card.className = 'kanban-card';
      card.dataset.id = task.id;
      card.draggable = true;
      card.innerHTML = `
        <div class="card-title">${task.title}</div>
        <div class="card-meta">Priority • ${task.priority}${task.assignee ? ` • ${task.assignee}` : ''}</div>
        <div class="card-footer">
          <span>Assigned • ${task.assignedAtIST || new Date(task.createdAt||Date.now()).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
          ${task.deadline ? `<span class="badge ${Date.now()>Date.parse(task.deadline)?'overdue':'near-due'}">${Date.now()>Date.parse(task.deadline)?'Overdue':'Due ' + new Date(task.deadline).toLocaleDateString('en-IN')}</span>` : ''}
        </div>
        <div class="card-actions">
          <button class="task-action" data-action="edit" title="Edit">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z" fill="currentColor"></path></svg>
          </button>
          <button class="task-action" data-action="delete" title="Delete">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12v2H6zm2 3h8v9a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-9zm3-6h2l1 2H8l1-2z" fill="currentColor"></path></svg>
          </button>
          <button class="star-button${task.starred ? ' active' : ''}" title="Pin"></button>
        </div>
      `;
      const starBtn = card.querySelector('.star-button');
      starBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const next = !task.starred;
        task.starred = next;
        starBtn.classList.toggle('active', next);
        this.renderPinnedTasks();
        try {
          const base = (window.location.origin && window.location.origin.startsWith('http')) ? '' : 'http://localhost:3000';
          const tokenStar = localStorage.getItem('token') || '';
          await fetch(`${base}/api/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(tokenStar ? { Authorization: `Bearer ${tokenStar}` } : {}) }, body: JSON.stringify({ starred: next }) });
        } catch (_) {}
      });
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', String(task.id));
        requestAnimationFrame(() => card.classList.add('dragging'));
      });
      card.addEventListener('dragend', () => { card.classList.remove('dragging'); });
      const group = byStatus[task.status] || byStatus['backlog'];
      group.push(card);
    });
    columns.forEach(col => {
      const status = col.getAttribute('data-status');
      const body = col.querySelector('.column-body');
      const countEl = col.querySelector('.count');
      const cards = byStatus[status] || [];
      body.innerHTML = '';
      col.addEventListener('dragover', (e) => {
        e.preventDefault();
        col.classList.add('drop-highlight');
        body.classList.add('drop-target');
        this.updateTasksStatusWidget();
      });
      col.addEventListener('dragleave', () => {
        col.classList.remove('drop-highlight');
        body.classList.remove('drop-target');
      });
      col.addEventListener('drop', async (e) => {
        e.preventDefault();
        col.classList.remove('drop-highlight');
        body.classList.remove('drop-target');
        const id = e.dataTransfer.getData('text/plain');
        const task = (this.data?.tasks || []).find(t => String(t.id) === String(id));
        if (!task || task.status === status) return;
        const prev = task.status;
        task.status = status;
        const cardEl = board.querySelector(`.kanban-card[data-id="${CSS.escape(String(id))}"]`);
        if (cardEl) { cardEl.classList.add('card-in'); body.appendChild(cardEl); }
        this._updateColumnCounts(board);
        this.updateTasksStatusWidget();
        try {
          const base = (window.location.origin && window.location.origin.startsWith('http')) ? '' : 'http://localhost:3000';
          const tokenMove = localStorage.getItem('token') || '';
          await fetch(`${base}/api/tasks/${id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(tokenMove ? { Authorization: `Bearer ${tokenMove}` } : {}) }, body: JSON.stringify({ status })
          });
        } catch (err) {
          task.status = prev;
          const prevCol = board.querySelector(`.kanban-column[data-status="${prev}"] .column-body`);
          const cardEl2 = board.querySelector(`.kanban-card[data-id="${CSS.escape(String(id))}"]`);
          if (prevCol && cardEl2) prevCol.appendChild(cardEl2);
          this._updateColumnCounts(board);
          this.updateTasksStatusWidget();
        }
      });
      cards.forEach(c => { c.classList.add('card-in'); body.appendChild(c); });
      if (countEl) countEl.textContent = String(cards.length);

      // Wire edit/delete for cards in this column after injection
      const wireActions = () => {
        body.querySelectorAll('.kanban-card').forEach(cardEl => {
          const id = cardEl.dataset.id;
          const actions = cardEl.querySelector('.card-actions');
          const del = actions?.querySelector('[data-action="delete"]');
          const edit = actions?.querySelector('[data-action="edit"]');
          del && del.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
              const base = (window.location.origin && window.location.origin.startsWith('http')) ? '' : 'http://localhost:3000';
              const tokenDel = localStorage.getItem('token') || '';
              const res = await fetch(`${base}/api/tasks/${id}`, { method: 'DELETE', headers: tokenDel ? { Authorization: `Bearer ${tokenDel}` } : {} });
              if (!res.ok) throw new Error('Delete failed');
              this.data.tasks = (this.data.tasks || []).filter(x => String(x.id) !== String(id));
              this._renderBoard(board);
              this.updateTasksStatusWidget();
              this.renderPinnedTasks();
            } catch (_) {}
          });
          edit && edit.addEventListener('click', async (e) => {
            e.stopPropagation();
            const task = (this.data?.tasks || []).find(t => String(t.id) === String(id));
            if (!task) return;
            // Build an edit dialog dynamically
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.style.display = 'flex';
            modal.innerHTML = `
              <div class="modal-content">
                <h3>Edit Task</h3>
                <form id="edit-task-form">
                  <div class="form-field"><label>Title</label><input class="input" id="edit-title" value="${task.title}"></div>
                  <div class="form-row">
                    <div class="form-field"><label>Priority</label>
                      <select class="select" id="edit-priority">
                        <option ${task.priority==='High'?'selected':''}>High</option>
                        <option ${task.priority==='Medium'?'selected':''}>Medium</option>
                        <option ${task.priority==='Low'?'selected':''}>Low</option>
                      </select>
                    </div>
                    <div class="form-field"><label>Status</label>
                      <select class="select" id="edit-status">
                        <option value="backlog" ${task.status==='backlog'?'selected':''}>Backlog</option>
                        <option value="in-progress" ${task.status==='in-progress'?'selected':''}>In Progress</option>
                        <option value="review" ${task.status==='review'?'selected':''}>Review</option>
                        <option value="done" ${task.status==='done'?'selected':''}>Done</option>
                      </select>
                    </div>
                  </div>
                  <div class="form-row">
                    <div class="form-field"><label>Assignee</label><input class="input" id="edit-assignee" value="${task.assignee||''}"></div>
                    <div class="form-field"><label>Deadline</label><input class="input" type="datetime-local" id="edit-deadline" value="${task.deadline? new Date(task.deadline).toISOString().slice(0,16):''}"></div>
                  </div>
                  <div class="modal-actions"><button type="button" class="button" id="edit-cancel">Cancel</button><button type="submit" class="button button-primary">Save</button></div>
                </form>
              </div>`;
            document.body.appendChild(modal);
            const close = ()=>{ modal.remove(); };
            modal.querySelector('#edit-cancel').addEventListener('click', close);
            document.addEventListener('keydown', function onKey(e){ if(e.key==='Escape'){ close(); document.removeEventListener('keydown', onKey);} });
            const formEl = modal.querySelector('#edit-task-form');
            formEl.addEventListener('submit', async (ev)=>{
              ev.preventDefault();
              const next = {
                title: modal.querySelector('#edit-title').value.trim(),
                priority: modal.querySelector('#edit-priority').value,
                status: modal.querySelector('#edit-status').value,
                assignee: modal.querySelector('#edit-assignee').value.trim(),
                deadline: (function(){ const v = modal.querySelector('#edit-deadline').value; return v ? `${v}:00` : undefined; })()
              };
              let ok = false, updated = null;
              try {
                const base = (window.location.origin && window.location.origin.startsWith('http')) ? '' : 'http://localhost:3000';
                const tokenEdit = localStorage.getItem('token') || '';
                const res = await fetch(`${base}/api/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(tokenEdit ? { Authorization: `Bearer ${tokenEdit}` } : {}) }, body: JSON.stringify(next) });
                ok = res.ok;
                try { updated = await res.json(); } catch (_) { updated = null; }
              } catch (_) { ok = false; }
              if (ok) {
                this.showToast('Task updated', 'success');
                if (updated) Object.assign(task, updated);
                try {
                  this._renderBoard(board);
                  this.updateTasksStatusWidget();
                } catch (_) {}
                close();
              } else {
                this.showToast('Save failed', 'error');
              }
            });
            // Ensure clicking inside modal does not close it due to global handlers
            modal.querySelector('.modal-content').addEventListener('click', (e)=> e.stopPropagation());
          });
        });
      };
      wireActions();
    });
  }

  setupQuickAdd() {
    const input = document.getElementById('quick-add-title');
    const prioritySel = document.getElementById('quick-add-priority');
    const btn = document.getElementById('quick-add-button');
    if (!input || !btn) return;
    const submit = async () => {
      const title = input.value.trim();
      const priority = prioritySel?.value || 'Medium';
      if (!title) return;
      try {
        const base = (window.location.origin && window.location.origin.startsWith('http')) ? '' : 'http://localhost:3000';
        const tokenQuick = localStorage.getItem('token') || '';
        const res = await fetch(`${base}/api/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(tokenQuick ? { Authorization: `Bearer ${tokenQuick}` } : {}) }, body: JSON.stringify({ title, priority, status: 'backlog' }) });
        if (!res.ok) return;
        const created = await res.json();
        this.data.tasks.push({ id: created._id || created.id, title: created.title, priority: created.priority, status: created.status, assignee: created.assignee || '', starred: created.starred || false, createdAt: created.createdAt || Date.now(), assignedAt: created.assignedAt, assignedAtIST: created.assignedAtIST, deadline: created.deadline });
        input.value = '';
        const board = document.querySelector('.tasks-board');
        if (board) this._renderBoard(board);
        this.updateTasksStatusWidget();
        this.renderRecentActivity();
        this.renderPinnedTasks();
      } catch (_) {}
    };
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  }

  renderPinnedTasks() {
    const container = document.getElementById('pinned-list');
    const widget = document.getElementById('pinned-widget');
    if (!container) return;
    const items = (this.data?.tasks || []).filter(t => t.starred).slice(0,6);
    container.innerHTML = '';
    if (widget) widget.style.display = items.length ? '' : 'none';
    items.forEach(t => {
      const div = document.createElement('div');
      div.className = 'pinned-card';
      div.innerHTML = `<div class="title">${t.title}</div><div class="meta">Priority • ${t.priority}${t.assignee ? ` • ${t.assignee}` : ''}</div>`;
      const actions = document.createElement('div');
      actions.className = 'pinned-actions';
      const unpin = document.createElement('button');
      unpin.className = 'task-action';
      unpin.title = 'Unpin';
      unpin.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4l5 5-2 2-2-2-6 6-3 1 1-3 6-6-2-2 2-2z" fill="currentColor"></path></svg>';
      unpin.addEventListener('click', async () => {
        t.starred = false;
        try {
          const base = (window.location.origin && window.location.origin.startsWith('http')) ? '' : 'http://localhost:3000';
          const tokenUnpin = localStorage.getItem('token') || '';
          await fetch(`${base}/api/tasks/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(tokenUnpin ? { Authorization: `Bearer ${tokenUnpin}` } : {}) }, body: JSON.stringify({ starred: false }) });
        } catch (_) {}
        this.renderPinnedTasks();
      });
      actions.appendChild(unpin);
      div.appendChild(actions);
      container.appendChild(div);
    });
  }

  setupScratchpad() {
    const ta = document.getElementById('scratchpad');
    const status = document.getElementById('scratchpad-status');
    if (!ta) return;
    const key = 'scratchpad';
    ta.value = localStorage.getItem(key) || '';
    const save = () => {
      localStorage.setItem(key, ta.value);
      if (status) status.textContent = 'Saved';
      setTimeout(() => { if (status) status.textContent = ''; }, 1000);
    };
    ta.addEventListener('input', () => { save(); });
  }

  renderRecentActivity() {
    const list = document.querySelector('.activity-list');
    if (!list) return;
    const items = (this.data?.tasks || []).slice().sort((a,b) => (b.createdAt||0) - (a.createdAt||0)).slice(0,5);
    list.innerHTML = '';
    items.forEach(t => {
      const li = document.createElement('li');
      li.className = 'activity-item';
      li.innerHTML = `
        <span class="bullet"></span>
        <div class="activity-content">
          <div class="title">Added: ${t.title}</div>
          <div class="meta">${this._timeAgo(t.createdAt)} • ${t.assignee || 'Unassigned'}</div>
        </div>
      `;
      list.appendChild(li);
    });
  }

  _timeAgo(ts) {
    const d = typeof ts === 'number' ? ts : Date.parse(ts);
    const diff = Math.max(0, Date.now() - (d||Date.now()));
    const m = Math.floor(diff/60000), h = Math.floor(m/60), d2 = Math.floor(h/24);
    if (d2 > 0) return `${d2}d ago`;
    if (h > 0) return `${h}h ago`;
    if (m > 0) return `${m}m ago`;
    return 'just now';
  }

  updateTasksStatusWidget() {
    const stacks = document.querySelectorAll('.chart.stacked .stack');
    if (!stacks.length) return;
    let count;
    const board = document.querySelector('.tasks-board');
    if (board) {
      // Prefer live DOM counts when tasks board is present
      count = {
        backlog: board.querySelectorAll('.kanban-column[data-status="backlog"] .kanban-card').length,
        progress: board.querySelectorAll('.kanban-column[data-status="in-progress"] .kanban-card').length,
        review: board.querySelectorAll('.kanban-column[data-status="review"] .kanban-card').length,
        done: board.querySelectorAll('.kanban-column[data-status="done"] .kanban-card').length,
      };
    } else {
      // Fallback to data model counts
      if (!this.data?.tasks) return;
      count = {
        backlog: this.data.tasks.filter(t => t.status === 'backlog').length,
        progress: this.data.tasks.filter(t => t.status === 'in-progress').length,
        review: this.data.tasks.filter(t => t.status === 'review').length,
        done: this.data.tasks.filter(t => t.status === 'done').length,
      };
    }
    const total = Math.max(1, (count.backlog + count.progress + count.review + count.done));
    stacks.forEach(chart => {
      const segBacklog = chart.querySelector('.stack-segment.backlog');
      const segProgress = chart.querySelector('.stack-segment.in-progress') || chart.querySelector('.stack-segment.progress');
      const segReview = chart.querySelector('.stack-segment.review');
      const segDone = chart.querySelector('.stack-segment.done');
      const pct = s => (s/total)*100;
      const widths = {
        backlog: pct(count.backlog),
        progress: pct(count.progress),
        review: pct(count.review),
        done: pct(count.done)
      };
      // Avoid integer rounding until assigning flex-basis; fix residual after rounding
      const round = v => Math.max(0, Math.round(v));
      let rb = round(widths.backlog), rp = round(widths.progress), rr = round(widths.review), rd = round(widths.done);
      let sum = rb + rp + rr + rd;
      if (sum === 0) { rd = 100; sum = 100; }
      if (sum !== 100) {
        const diff = 100 - sum;
        // put residual on 'done' for visual stability
        rd = Math.max(0, rd + diff);
      }
      // Account for container padding and gap by using flex-basis
      const setBasis = (el, pct) => { if (el) el.style.flexBasis = `${pct}%`; };
      setBasis(segBacklog, rb);
      setBasis(segProgress, rp);
      setBasis(segReview, rr);
      setBasis(segDone, rd);
      // Handle edge case: when one segment is 100%, ensure it still displays with its color
      [
        [segBacklog, 'backlog'],
        [segProgress, 'progress'],
        [segReview, 'review'],
        [segDone, 'done']
      ].forEach(([el, key]) => {
        if (!el) return;
        const w = { backlog: rb, progress: rp, review: rr, done: rd }[key];
        el.style.display = w === 0 ? 'none' : 'block';
        el.style.minWidth = w > 0 ? '2px' : '';
      });
    });
    const legend = document.querySelector('.chart.stacked .legend');
    if (legend) {
      const setCount = (cls, val) => {
        const el = legend.querySelector(`.legend-count.${cls}`) || (cls === 'progress' ? legend.querySelector('.legend-count.in-progress') : null);
        if (el) el.textContent = `(${val})`;
      };
      setCount('backlog', count.backlog);
      setCount('progress', count.progress);
      setCount('review', count.review);
      setCount('done', count.done);
    }
  }

  _updateColumnCounts(board) {
    const cols = board.querySelectorAll('.kanban-column');
    cols.forEach(c => {
      const countEl = c.querySelector('.count');
      const num = c.querySelectorAll('.column-body .kanban-card').length;
      if (countEl) countEl.textContent = String(num);
    });
  }

  openTaskModal() {
    const modal = document.getElementById('task-modal');
    if (modal) modal.style.display = 'flex';
  }

  closeTaskModal() {
    const modal = document.getElementById('task-modal');
    if (modal) modal.style.display = 'none';
    const form = document.getElementById('task-form');
    form?.reset();
    history.replaceState(null, '', 'tasks.html');
  }

  /**
   * Get current page name from URL
   */
  _getCurrentPage() {
    const path = window.location.pathname;
    const filename = path.split('/').pop();
    
    if (!filename || filename === '' || filename === '/') {
      return 'index';
    }
    
    return filename.replace('.html', '');
  }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new AppCore();
});
      const actions = card.querySelector('.card-actions');
      actions.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          const base = (window.location.origin && window.location.origin.startsWith('http')) ? '' : 'http://localhost:3000';
          const tokenDel = localStorage.getItem('token') || '';
          const res = await fetch(`${base}/api/tasks/${task.id}`, { method: 'DELETE', headers: tokenDel ? { Authorization: `Bearer ${tokenDel}` } : {} });
          if (!res.ok) throw new Error('Delete failed');
          this.data.tasks = (this.data.tasks || []).filter(x => String(x.id) !== String(task.id));
          this._renderBoard(board);
          this.updateTasksStatusWidget();
          this.renderPinnedTasks();
        } catch (_) {}
      });
      actions.querySelector('[data-action="edit"]').addEventListener('click', async (e) => {
        e.stopPropagation();
        const title = prompt('Edit title', task.title);
        if (!title || title.trim() === task.title) return;
        const next = { title: title.trim() };
        try {
          const base = (window.location.origin && window.location.origin.startsWith('http')) ? '' : 'http://localhost:3000';
        const tokenEdit = localStorage.getItem('token') || '';
        const res = await fetch(`${base}/api/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(tokenEdit ? { Authorization: `Bearer ${tokenEdit}` } : {}) }, body: JSON.stringify(next) });
          if (!res.ok) throw new Error('Edit failed');
          task.title = next.title;
          const titleEl = card.querySelector('.card-title');
          if (titleEl) titleEl.textContent = next.title;
        } catch (_) {}
      });