// Analytics page interactivity: build KPIs, bars, and donut from tasks
(function(){
  async function fetchTasks(){
    try{
      const base = (window.location.origin && window.location.origin.startsWith('http')) ? '' : 'http://localhost:3000'
      const token = localStorage.getItem('token') || ''
      const res = await fetch(`${base}/api/tasks`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      if(!res.ok) throw new Error('fail')
      return await res.json()
    }catch(e){
      return (window.app && window.app.data && window.app.data.tasks) ? window.app.data.tasks : []
    }
  }

  function setKPI(sel,value,trend){
    const el = document.querySelector(`[data-kpi="${sel}"]`)
    if(el) el.textContent = value
    const tr = document.querySelector(`[data-kpi="trend-${sel}"]`)
    if(tr) tr.textContent = trend || ''
  }

  function unique(arr){ return Array.from(new Set(arr)) }

  function renderBars(container,labelEl,data){
    container.innerHTML = ''
    labelEl.innerHTML = ''
    const weeks = data.labels
    weeks.forEach((w,i)=>{
      const pair = document.createElement('div')
      pair.className = 'bar-pair'
      const created = document.createElement('div')
      created.className = 'bar created'
      created.style.height = `${Math.min(100, Math.round((data.created[i]||0)*100))}%`
      const completed = document.createElement('div')
      completed.className = 'bar completed'
      completed.style.height = `${Math.min(100, Math.round((data.completed[i]||0)*100))}%`
      pair.appendChild(created)
      pair.appendChild(completed)
      container.appendChild(pair)
      const lab = document.createElement('span')
      lab.textContent = w
      labelEl.appendChild(lab)
    })
  }

  function renderDonut(el,legend,segments){
    const total = segments.reduce((a,b)=>a+b.value,0) || 1
    const stops = []
    let acc = 0
    segments.forEach(s=>{
      const next = acc + (s.value/total)*100
      stops.push(`${s.color} ${acc}% ${next}%`)
      acc = next
    })
    el.innerHTML = ''
    el.style.background = `conic-gradient(${stops.join(',')})`
    const center = document.createElement('div')
    center.className = 'donut-center'
    center.textContent = String(total)
    el.appendChild(center)
    legend.innerHTML = ''
    segments.forEach(s=>{
      const li = document.createElement('li')
      li.innerHTML = `<span class="dot" style="background:${s.color}"></span> ${s.label} <span class="legend-value">${s.value} (${Math.round((s.value/total)*100)}%)</span>`
      legend.appendChild(li)
    })
  }

  function groupBy(arr,key){
    const map = new Map()
    arr.forEach(t=>{
      const k = (typeof key === 'function') ? key(t) : t[key]
      map.set(k,(map.get(k)||0)+1)
    })
    return Array.from(map.entries()).map(([label,value])=>({label,value}))
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    const tasks = await fetchTasks()
    const total = tasks.length
    const done = tasks.filter(t=>t.status==='done').length
    const assignees = unique(tasks.map(t=>t.assignee).filter(Boolean)).length
    setKPI('total', total, '')
    setKPI('completed', done, '')
    // Compute average completion time from assignedAt -> completedAt
    const durations = tasks
      .filter(t=>t.status==='done' && t.assignedAt && t.completedAt)
      .map(t=> (Date.parse(t.completedAt) - Date.parse(t.assignedAt)) / (1000*60*60*24))
    const avgDays = durations.length ? (durations.reduce((a,b)=>a+b,0)/durations.length) : null
    setKPI('avg-time', avgDays ? `${avgDays.toFixed(1)} days` : '—', '')
    setKPI('active-members', assignees, '')

    // Replace bars with deadline breakdown list
    const list = document.getElementById('deadline-list')
    const overdueEl = document.getElementById('deadline-overdue-count')
    const nearEl = document.getElementById('deadline-neardue-count')
    const upEl = document.getElementById('deadline-upcoming-count')
    const now = Date.now()
    const nearMs = 1000*60*60*48 // 48 hours
    let overdue=0, near=0, upcoming=0
    const items = tasks
      .filter(t=>t.deadline)
      .map(t=>({
        title: t.title,
        whenIST: t.assignedAtIST || new Date(t.assignedAt||t.createdAt||now).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}),
        deadline: new Date(t.deadline),
        ms: Date.parse(t.deadline),
        status: t.status
      }))
      .sort((a,b)=>a.ms-b.ms)
    list.innerHTML = ''
    items.forEach(i=>{
      const li = document.createElement('li')
      const isOverdue = now > i.ms && i.status!=='done'
      const isNear = !isOverdue && (i.ms - now) <= nearMs
      if(isOverdue) overdue++
      else if(isNear) near++
      else upcoming++
      li.innerHTML = `<div class="view-card" style="display:flex;justify-content:space-between;align-items:center;padding:10px">
        <div>
          <div class="title">${i.title}</div>
          <div class="card-meta">Assigned • ${i.whenIST}</div>
        </div>
        <div>
          <span class="badge ${isOverdue?'overdue':(isNear?'near-due':'')}">${isOverdue?'Overdue':(isNear?'Due Soon':'Due ' + i.deadline.toLocaleDateString('en-IN'))}</span>
        </div>
      </div>`
      list.appendChild(li)
    })
    overdueEl.textContent = String(overdue)
    nearEl.textContent = String(near)
    upEl.textContent = String(upcoming)

    // Donut modes
    const donut = document.getElementById('donut')
    const legend = document.getElementById('donut-legend')
    const modeButtons = document.querySelectorAll('.segmented .segment')
    const colors = {
      backlog: getComputedStyle(document.documentElement).getPropertyValue('--status-backlog')||'#EF4444',
      progress: getComputedStyle(document.documentElement).getPropertyValue('--status-progress')||'#60A5FA',
      review: getComputedStyle(document.documentElement).getPropertyValue('--status-review')||'#A78BFA',
      done: getComputedStyle(document.documentElement).getPropertyValue('--status-done')||'#22C55E'
    }
    const renderMode = (mode)=>{
      let segs
      if(mode==='status'){
        const groups = [
          {label:'Backlog', value: tasks.filter(t=>t.status==='backlog').length, color: colors.backlog},
          {label:'In Progress', value: tasks.filter(t=>t.status==='in-progress').length, color: colors.progress},
          {label:'Review', value: tasks.filter(t=>t.status==='review').length, color: colors.review},
          {label:'Done', value: tasks.filter(t=>t.status==='done').length, color: colors.done}
        ]
        segs = groups
      }else if(mode==='priority'){
        const palette = ['#EF4444','#F59E0B','#10B981']
        const groups = groupBy(tasks,'priority').map((g,i)=>({ label:g.label, value:g.value, color: palette[i%palette.length] }))
        segs = groups
      }else{
        const palette = ['#6366F1','#06B6D4','#F43F5E','#84CC16']
        const groups = groupBy(tasks,t=>t.assignee||'Unassigned').map((g,i)=>({ label:g.label, value:g.value, color: palette[i%palette.length] }))
        segs = groups
      }
      renderDonut(donut, legend, segs)
    }
    modeButtons.forEach(btn=>{
      btn.addEventListener('click', ()=>{
        modeButtons.forEach(b=>b.classList.remove('active'))
        btn.classList.add('active')
        renderMode(btn.getAttribute('data-mode'))
      })
    })
    renderMode('status')
  })
})()