/* ============================================================
   YAPSAK BENCE — app.js
   Features: CRUD, Kanban, Search, Filter, Tags, Subtasks,
             Notes, Deadline, Reminder, Drag&Drop, Theme, Notifications
   ============================================================ */

const STORAGE_KEY = 'yapsak-bence-v2';
const THEME_KEY   = 'yapsak-bence-theme';

// ---- State ----
let tasks        = [];
let filter       = 'all';
let view         = 'list';
let searchQ      = '';
let editingId    = null;  // modal open for this task id
let dragSrcId    = null;
let dragSrcList  = null;

// ---- Selectors ----
const $ = id => document.getElementById(id);
const addForm         = $('add-form');
const taskInput       = $('task-input');
const prioritySelect  = $('priority-select');
const categorySelect  = $('category-select');
const deadlineInput   = $('deadline-input');
const taskList        = $('task-list');
const emptyState      = $('empty-state');
const bottomActions   = $('bottom-actions');
const searchInput     = $('search-input');
const searchClear     = $('search-clear');
const progressFill    = $('progress-fill');
const progressText    = $('progress-text');
const statTotal       = $('stat-total');
const statDone        = $('stat-done');
const statOverdue     = $('stat-overdue');
const overduePill     = $('overdue-pill');
const themeBtn        = $('theme-btn');
const notifBtn        = $('notif-btn');
const listView        = $('list-view');
const kanbanView      = $('kanban-view');
const modalOverlay    = $('modal-overlay');

// ---- Storage ----
function loadTasks() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function migrate(arr) {
  return arr.map(t => ({
    id:        t.id        || Date.now().toString(),
    text:      t.text      || '',
    notes:     t.notes     || '',
    priority:  t.priority  || 'normal',
    category:  t.category  || 'genel',
    status:    t.status    || (t.done ? 'done' : 'todo'),
    deadline:  t.deadline  || null,
    reminder:  t.reminder  || null,
    tags:      t.tags      || [],
    subtasks:  t.subtasks  || [],
    createdAt: t.createdAt || new Date().toISOString(),
    order:     t.order     ?? 0,
  }));
}

// ---- Helpers ----
function isDone(t)    { return t.status === 'done'; }
function isOverdue(t) {
  if (!t.deadline || isDone(t)) return false;
  return new Date(t.deadline) < new Date(new Date().toDateString());
}
function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('tr-TR', { day:'numeric', month:'short' });
}
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

// ---- Filtering ----
function filteredTasks() {
  let list = [...tasks];
  if (searchQ) {
    const q = searchQ.toLowerCase();
    list = list.filter(t =>
      t.text.toLowerCase().includes(q) ||
      t.tags.some(tag => tag.toLowerCase().includes(q)) ||
      t.category.toLowerCase().includes(q)
    );
  }
  if (filter === 'todo')       list = list.filter(t => t.status === 'todo');
  else if (filter === 'inprogress') list = list.filter(t => t.status === 'inprogress');
  else if (filter === 'done')  list = list.filter(t => isDone(t));
  else if (filter === 'overdue') list = list.filter(t => isOverdue(t));
  return list;
}

// ---- CRUD ----
function addTask(text, priority, category, deadline) {
  const task = {
    id: genId(), text: text.trim(), notes: '',
    priority, category, status: 'todo',
    deadline: deadline || null, reminder: null,
    tags: [], subtasks: [],
    createdAt: new Date().toISOString(),
    order: tasks.length,
  };
  tasks.unshift(task);
  saveTasks();
  render();
}

function updateTask(id, updates) {
  const t = tasks.find(t => t.id === id);
  if (!t) return;
  Object.assign(t, updates);
  saveTasks();
  render();
}

function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  saveTasks();
  if (editingId === id) closeModal();
  render();
}

function toggleTask(id) {
  const t = tasks.find(t => t.id === id);
  if (!t) return;
  t.status = isDone(t) ? 'todo' : 'done';
  saveTasks();
  render();
}

// ---- Stats ----
function updateStats() {
  const total   = tasks.length;
  const done    = tasks.filter(isDone).length;
  const overdue = tasks.filter(isOverdue).length;
  const pct     = total ? Math.round(done / total * 100) : 0;

  statTotal.textContent   = total;
  statDone.textContent    = done;
  statOverdue.textContent = overdue;
  progressFill.style.width = pct + '%';
  progressText.textContent = pct + '%';
  overduePill.style.display = overdue > 0 ? '' : 'none';

  const hasDone = tasks.some(isDone);
  bottomActions.classList.toggle('show', hasDone);
}

// ---- Render ----
function render() {
  updateStats();
  if (view === 'list') renderList();
  else renderKanban();
}

function renderList() {
  const list = filteredTasks();
  taskList.innerHTML = '';
  emptyState.classList.toggle('show', list.length === 0);
  list.forEach(task => taskList.appendChild(makeTaskItem(task)));
  initListDrag();
}

function makeTaskItem(task) {
  const li = document.createElement('li');
  li.className = 'task-item' + (isDone(task) ? ' done' : '') + (isOverdue(task) ? ' overdue' : '');
  li.dataset.id       = task.id;
  li.dataset.priority = task.priority;
  li.draggable        = true;

  // Checkbox
  const chk = document.createElement('div');
  chk.className = 'task-check' + (isDone(task) ? ' checked' : '');
  chk.addEventListener('click', e => { e.stopPropagation(); toggleTask(task.id); });

  // Content
  const content = document.createElement('div');
  content.className = 'task-content';
  content.style.cursor = 'pointer';
  content.addEventListener('click', () => openModal(task.id));

  const textEl = document.createElement('span');
  textEl.className = 'task-text';
  textEl.textContent = task.text;

  const meta = document.createElement('div');
  meta.className = 'task-meta';

  // Category
  const catTag = mkTag(task.category, 'tag-cat');
  meta.appendChild(catTag);

  // Priority
  if (task.priority === 'high') meta.appendChild(mkTag('Yüksek', 'tag-pri-high'));
  if (task.priority === 'low')  meta.appendChild(mkTag('Düşük',  'tag-pri-low'));

  // Status badge
  if (task.status === 'inprogress') meta.appendChild(mkTag('Devam', 'tag-inprogress'));

  // Custom tags
  task.tags.slice(0, 3).forEach(tag => meta.appendChild(mkTag(tag, 'tag-custom')));

  // Deadline
  if (task.deadline) {
    const dl = document.createElement('span');
    dl.className = 'task-deadline' + (isOverdue(task) ? ' overdue' : '');
    dl.textContent = '📅 ' + fmtDate(task.deadline);
    meta.appendChild(dl);
  }

  // Subtasks mini bar
  if (task.subtasks.length > 0) {
    const doneSubs = task.subtasks.filter(s => s.done).length;
    const pct = Math.round(doneSubs / task.subtasks.length * 100);
    const barWrap = document.createElement('div');
    barWrap.className = 'task-subtask-bar';
    barWrap.innerHTML = `
      <div class="mini-bar"><div class="mini-bar-fill" style="width:${pct}%"></div></div>
      <span class="mini-bar-text">${doneSubs}/${task.subtasks.length}</span>
    `;
    meta.appendChild(barWrap);
  }

  content.append(textEl, meta);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'task-actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'task-btn';
  editBtn.title = 'Düzenle';
  editBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
  editBtn.addEventListener('click', e => { e.stopPropagation(); openModal(task.id); });

  const delBtn = document.createElement('button');
  delBtn.className = 'task-btn delete-btn';
  delBtn.title = 'Sil';
  delBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>';
  delBtn.addEventListener('click', e => { e.stopPropagation(); deleteTask(task.id); });

  actions.append(editBtn, delBtn);
  li.append(chk, content, actions);
  return li;
}

function mkTag(text, cls) {
  const s = document.createElement('span');
  s.className = 'tag ' + cls;
  s.textContent = text;
  return s;
}

// ---- Kanban ----
function renderKanban() {
  const cols = { todo: $('kanban-todo'), inprogress: $('kanban-inprogress'), done: $('kanban-done') };
  Object.values(cols).forEach(c => c.innerHTML = '');

  let shown = { todo: 0, inprogress: 0, done: 0 };
  const list = searchQ ? filteredTasks() : tasks;

  list.forEach(task => {
    const status = task.status || 'todo';
    if (!cols[status]) return;
    cols[status].appendChild(makeKanbanCard(task));
    shown[status]++;
  });

  $('count-todo').textContent       = shown.todo;
  $('count-inprogress').textContent = shown.inprogress;
  $('count-done').textContent       = shown.done;

  initKanbanDrag();
}

function makeKanbanCard(task) {
  const li = document.createElement('li');
  li.className = 'kanban-card' + (isDone(task) ? ' done' : '');
  li.dataset.id       = task.id;
  li.dataset.priority = task.priority;
  li.draggable        = true;

  const textEl = document.createElement('div');
  textEl.className = 'kanban-card-text';
  textEl.textContent = task.text;

  const meta = document.createElement('div');
  meta.className = 'kanban-card-meta';
  if (task.priority === 'high') meta.appendChild(mkTag('Yüksek', 'tag-pri-high'));
  if (task.priority === 'low')  meta.appendChild(mkTag('Düşük',  'tag-pri-low'));
  if (task.deadline) {
    const dl = document.createElement('span');
    dl.className = 'task-deadline' + (isOverdue(task) ? ' overdue' : '');
    dl.style.fontSize = '0.68rem';
    dl.textContent = '📅 ' + fmtDate(task.deadline);
    meta.appendChild(dl);
  }
  task.tags.slice(0, 2).forEach(tag => meta.appendChild(mkTag(tag, 'tag-custom')));

  const cardActions = document.createElement('div');
  cardActions.className = 'kanban-card-actions';

  const editKBtn = document.createElement('button');
  editKBtn.className = 'kbtn';
  editKBtn.textContent = 'Düzenle';
  editKBtn.addEventListener('click', e => { e.stopPropagation(); openModal(task.id); });

  const delKBtn = document.createElement('button');
  delKBtn.className = 'kbtn del';
  delKBtn.textContent = 'Sil';
  delKBtn.addEventListener('click', e => { e.stopPropagation(); deleteTask(task.id); });

  cardActions.append(editKBtn, delKBtn);
  li.append(textEl, meta, cardActions);
  li.addEventListener('click', () => openModal(task.id));
  return li;
}

// ---- Modal ----
function openModal(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  editingId = id;

  $('modal-title').value    = task.text;
  $('modal-notes').value    = task.notes || '';
  $('modal-deadline').value = task.deadline || '';
  $('modal-reminder').value = task.reminder || '';
  $('modal-priority').value = task.priority;
  $('modal-category').value = task.category;
  $('modal-status').value   = task.status;

  renderModalTags(task.tags);
  renderModalSubtasks(task.subtasks);

  modalOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  editingId = null;
  modalOverlay.classList.remove('open');
  document.body.style.overflow = '';
}

function saveModal() {
  if (!editingId) return;
  const task = tasks.find(t => t.id === editingId);
  if (!task) return;

  task.text     = $('modal-title').value.trim() || task.text;
  task.notes    = $('modal-notes').value;
  task.deadline = $('modal-deadline').value || null;
  task.reminder = $('modal-reminder').value || null;
  task.priority = $('modal-priority').value;
  task.category = $('modal-category').value;
  task.status   = $('modal-status').value;

  saveTasks();
  scheduleReminders();
  render();
  closeModal();
}

// ---- Modal Tags ----
let modalTags = [];

function renderModalTags(tags) {
  modalTags = [...tags];
  const container = $('tags-container');
  const input     = $('tag-input');
  container.innerHTML = '';

  modalTags.forEach((tag, i) => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.innerHTML = `${tag} <button class="tag-pill-remove" data-i="${i}">×</button>`;
    pill.querySelector('.tag-pill-remove').addEventListener('click', () => {
      modalTags.splice(i, 1);
      renderModalTags(modalTags);
    });
    container.appendChild(pill);
  });

  container.appendChild(input);
  input.focus();

  input.onkeydown = e => {
    if ((e.key === 'Enter' || e.key === ',') && input.value.trim()) {
      e.preventDefault();
      const val = input.value.trim().replace(',', '');
      if (val && !modalTags.includes(val) && modalTags.length < 10) {
        modalTags.push(val);
        // Sync to task immediately
        const task = tasks.find(t => t.id === editingId);
        if (task) task.tags = [...modalTags];
        renderModalTags(modalTags);
      }
      input.value = '';
    }
  };
  container.addEventListener('click', () => input.focus());
}

// ---- Modal Subtasks ----
function renderModalSubtasks(subtasks) {
  const list = $('subtasks-list');
  list.innerHTML = '';
  const total = subtasks.length;
  const done  = subtasks.filter(s => s.done).length;
  const pct   = total ? Math.round(done / total * 100) : 0;

  $('subtask-progress-text').textContent = total ? `${done}/${total}` : '';
  $('subtask-progress-fill').style.width = pct + '%';

  subtasks.forEach((sub, i) => {
    const li = document.createElement('li');
    li.className = 'subtask-item' + (sub.done ? ' done-sub' : '');

    const chk = document.createElement('div');
    chk.className = 'sub-check' + (sub.done ? ' checked' : '');
    chk.addEventListener('click', () => {
      sub.done = !sub.done;
      const task = tasks.find(t => t.id === editingId);
      if (task) saveTasks();
      renderModalSubtasks(subtasks);
    });

    const span = document.createElement('span');
    span.className = 'subtask-text';
    span.textContent = sub.text;

    const del = document.createElement('button');
    del.className = 'sub-del';
    del.textContent = '×';
    del.addEventListener('click', () => {
      subtasks.splice(i, 1);
      const task = tasks.find(t => t.id === editingId);
      if (task) { task.subtasks = subtasks; saveTasks(); }
      renderModalSubtasks(subtasks);
    });

    li.append(chk, span, del);
    list.appendChild(li);
  });
}

function addSubtask() {
  const input = $('subtask-input');
  const text = input.value.trim();
  if (!text) return;
  const task = tasks.find(t => t.id === editingId);
  if (!task) return;
  task.subtasks.push({ id: genId(), text, done: false });
  saveTasks();
  renderModalSubtasks(task.subtasks);
  input.value = '';
  input.focus();
}

// ---- Drag & Drop — List ----
function initListDrag() {
  const items = taskList.querySelectorAll('.task-item');
  items.forEach(item => {
    item.addEventListener('dragstart', e => {
      dragSrcId   = item.dataset.id;
      dragSrcList = 'list';
      setTimeout(() => item.classList.add('dragging'), 0);
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragend', () => item.classList.remove('dragging'));
    item.addEventListener('dragover', e => { e.preventDefault(); item.classList.add('drag-over'); });
    item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
    item.addEventListener('drop', e => {
      e.preventDefault();
      item.classList.remove('drag-over');
      if (!dragSrcId || dragSrcId === item.dataset.id || dragSrcList !== 'list') return;
      const srcIdx  = tasks.findIndex(t => t.id === dragSrcId);
      const destIdx = tasks.findIndex(t => t.id === item.dataset.id);
      if (srcIdx === -1 || destIdx === -1) return;
      const [moved] = tasks.splice(srcIdx, 1);
      tasks.splice(destIdx, 0, moved);
      saveTasks();
      renderList();
    });
  });
}

// ---- Drag & Drop — Kanban ----
function initKanbanDrag() {
  const cards = document.querySelectorAll('.kanban-card');
  const cols  = document.querySelectorAll('.kanban-col');

  cards.forEach(card => {
    card.addEventListener('dragstart', e => {
      dragSrcId   = card.dataset.id;
      dragSrcList = 'kanban';
      setTimeout(() => card.classList.add('dragging'), 0);
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.addEventListener('dragover', e => { e.preventDefault(); card.classList.add('drag-over'); });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', e => {
      e.preventDefault();
      card.classList.remove('drag-over');
      if (!dragSrcId || dragSrcId === card.dataset.id) return;
      // reorder within same list
      const srcIdx  = tasks.findIndex(t => t.id === dragSrcId);
      const destIdx = tasks.findIndex(t => t.id === card.dataset.id);
      if (srcIdx !== -1 && destIdx !== -1) {
        const destStatus = tasks[destIdx].status;
        const [moved] = tasks.splice(srcIdx, 1);
        moved.status = destStatus;
        tasks.splice(destIdx, 0, moved);
        saveTasks();
        renderKanban();
      }
    });
  });

  cols.forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drag-over'); });
    col.addEventListener('dragleave', e => {
      if (!col.contains(e.relatedTarget)) col.classList.remove('drag-over');
    });
    col.addEventListener('drop', e => {
      e.preventDefault();
      col.classList.remove('drag-over');
      if (!dragSrcId || dragSrcList !== 'kanban') return;
      const newStatus = col.dataset.status;
      const task = tasks.find(t => t.id === dragSrcId);
      if (task && task.status !== newStatus) {
        task.status = newStatus;
        saveTasks();
        renderKanban();
        updateStats();
      }
    });
  });
}

// ---- Theme ----
function loadTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'dark';
  document.documentElement.dataset.theme = saved;
  updateThemeIcon(saved);
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme;
  const next    = current === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem(THEME_KEY, next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  $('theme-icon-dark').style.display  = theme === 'dark'  ? '' : 'none';
  $('theme-icon-light').style.display = theme === 'light' ? '' : 'none';
}

// ---- Notifications ----
function requestNotifPermission() {
  if (!('Notification' in window)) return;
  Notification.requestPermission().then(p => {
    if (p === 'granted') {
      notifBtn.style.color = 'var(--low)';
      scheduleReminders();
    }
  });
}

function scheduleReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  tasks.forEach(task => {
    if (!task.reminder || isDone(task)) return;
    const reminderTime = new Date(task.reminder).getTime();
    const now          = Date.now();
    const delay        = reminderTime - now;
    if (delay > 0 && delay < 24 * 60 * 60 * 1000) {
      setTimeout(() => {
        new Notification('Yapsak Bence ⏰', {
          body: task.text,
          icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">✅</text></svg>'
        });
      }, delay);
    }
  });
}

// Check reminders past due on load
function checkPastReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const now = Date.now();
  tasks.forEach(task => {
    if (!task.reminder || isDone(task)) return;
    const t = new Date(task.reminder).getTime();
    if (t <= now && t > now - 60000) {
      new Notification('Yapsak Bence ⏰', { body: task.text });
    }
  });
}

// ---- View switch ----
function switchView(v) {
  view = v;
  document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  const isKanban = v === 'kanban';
  listView.classList.toggle('hidden', isKanban);
  kanbanView.classList.toggle('hidden', !isKanban);
  $('filters').classList.toggle('hidden', isKanban);
  render();
}

// ---- Event Listeners ----
addForm.addEventListener('submit', e => {
  e.preventDefault();
  const text = taskInput.value.trim();
  if (!text) {
    taskInput.classList.add('shake');
    setTimeout(() => taskInput.classList.remove('shake'), 300);
    taskInput.focus();
    return;
  }
  addTask(text, prioritySelect.value, categorySelect.value, deadlineInput.value);
  taskInput.value    = '';
  deadlineInput.value = '';
  taskInput.focus();
});

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filter = btn.dataset.filter;
    render();
  });
});

document.querySelectorAll('.view-btn').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

searchInput.addEventListener('input', () => {
  searchQ = searchInput.value.trim();
  searchClear.style.display = searchQ ? '' : 'none';
  render();
});
searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchQ = '';
  searchClear.style.display = 'none';
  render();
  searchInput.focus();
});

themeBtn.addEventListener('click', toggleTheme);
notifBtn.addEventListener('click', requestNotifPermission);

$('clear-done').addEventListener('click', () => {
  tasks = tasks.filter(t => !isDone(t));
  saveTasks();
  render();
});

// Modal events
$('modal-close').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
$('modal-save').addEventListener('click', saveModal);
$('modal-delete').addEventListener('click', () => { if (editingId) deleteTask(editingId); });

$('subtask-add-btn').addEventListener('click', addSubtask);
$('subtask-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); addSubtask(); }
});

// Close modal on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && editingId) closeModal();
});

// ---- Init ----
tasks = migrate(loadTasks());
loadTheme();
scheduleReminders();
checkPastReminders();
setInterval(checkPastReminders, 30000);
render();
