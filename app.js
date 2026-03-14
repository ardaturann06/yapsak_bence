/* ============================================================
   YAPSAK BENCE — app.js
   Features: Auth (Firebase/Guest), Kanban, Search, Filter,
             Tags, Subtasks, Notes, Deadline, Reminder,
             Drag&Drop, Theme, Notifications
   ============================================================ */

const STORAGE_KEY = 'yapsak-bence-v2';
const THEME_KEY   = 'yapsak-bence-theme';

// ---- Firebase ----
let firebaseReady = false;
let auth          = null;
let db            = null;
let currentUser   = null;
let guestMode     = false;
let fsListener    = null;

function initFirebase() {
  try {
    if (!firebaseConfig || firebaseConfig.apiKey === 'BURAYA_API_KEY') return false;
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db   = firebase.firestore();
    firebaseReady = true;
    return true;
  } catch (e) {
    console.warn('Firebase başlatılamadı:', e.message);
    return false;
  }
}

// ---- State ----
let tasks    = [];
let filter   = 'all';
let view     = 'list';
let searchQ  = '';
let editingId   = null;
let dragSrcId   = null;
let dragSrcList = null;

// ---- Selectors ----
const $ = id => document.getElementById(id);

const addForm        = $('add-form');
const taskInput      = $('task-input');
const prioritySelect = $('priority-select');
const categorySelect = $('category-select');
const deadlineInput  = $('deadline-input');
const taskList       = $('task-list');
const emptyState     = $('empty-state');
const bottomActions  = $('bottom-actions');
const searchInput    = $('search-input');
const searchClear    = $('search-clear');
const progressFill   = $('progress-fill');
const progressText   = $('progress-text');
const statTotal      = $('stat-total');
const statDone       = $('stat-done');
const statOverdue    = $('stat-overdue');
const overduePill    = $('overdue-pill');
const themeBtn       = $('theme-btn');
const notifBtn       = $('notif-btn');
const listView       = $('list-view');
const kanbanView     = $('kanban-view');
const modalOverlay   = $('modal-overlay');
const authOverlay    = $('auth-overlay');
const userBtn        = $('user-btn');

// ---- Storage (hybrid: Firebase or localStorage) ----
function loadLocalTasks() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function saveLocalTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

async function saveTaskToFirestore(task) {
  if (!db || !currentUser) return;
  await db.collection('users').doc(currentUser.uid)
    .collection('tasks').doc(task.id).set(task);
}

async function deleteTaskFromFirestore(id) {
  if (!db || !currentUser) return;
  await db.collection('users').doc(currentUser.uid)
    .collection('tasks').doc(id).delete();
}

function subscribeFirestore() {
  if (fsListener) fsListener();
  let firstSnap = true;
  fsListener = db.collection('users').doc(currentUser.uid)
    .collection('tasks').onSnapshot(snap => {
      tasks = migrate(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      render();
      if (firstSnap) { firstSnap = false; checkMissedReminders(); }
    });
}

function saveTasks() {
  if (guestMode || !currentUser) {
    saveLocalTasks();
  }
  // Firestore saves happen individually via saveTaskToFirestore
}

// ---- Helpers ----
function migrate(arr) {
  return arr.map(t => ({
    id:          t.id          || genId(),
    text:        t.text        || '',
    notes:       t.notes       || '',
    priority:    t.priority    || 'normal',
    category:    t.category    || 'genel',
    status:      t.status      || (t.done ? 'done' : 'todo'),
    deadline:    t.deadline    || null,
    reminder:       t.reminder       || null,
    reminderRepeat: t.reminderRepeat || 'none',
    reminderEnd:    t.reminderEnd    || null,
    tags:           t.tags           || [],
    subtasks:    t.subtasks    || [],
    attachments: t.attachments || [],
    createdAt:   t.createdAt   || new Date().toISOString(),
    order:       t.order       ?? 0,
  }));
}

function isDone(t)    { return t.status === 'done'; }
function isOverdue(t) {
  if (!t.deadline || isDone(t)) return false;
  return new Date(t.deadline) < new Date(new Date().toDateString());
}
function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

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
async function addTask(text, priority, category, deadline, extras = {}) {
  const task = {
    id: genId(), text: text.trim(),
    notes:       extras.notes    || '',
    priority, category,
    status:      extras.status   || 'todo',
    deadline:    deadline        || null,
    reminder:       extras.reminder       || null,
    reminderRepeat: extras.reminderRepeat || 'none',
    reminderEnd:    extras.reminderEnd    || null,
    tags:           extras.tags           || [],
    subtasks:    [],
    attachments: [],
    createdAt: new Date().toISOString(),
    order: tasks.length,
  };
  if (currentUser && db) {
    await saveTaskToFirestore(task);
    // Firestore onSnapshot will re-render
  } else {
    tasks.unshift(task);
    saveLocalTasks();
    render();
  }
}

async function updateTask(id, updates) {
  const t = tasks.find(t => t.id === id);
  if (!t) return;
  Object.assign(t, updates);
  if (currentUser && db) {
    await saveTaskToFirestore(t);
  } else {
    saveLocalTasks();
    render();
  }
}

async function deleteTask(id) {
  await deleteAllTaskAttachments(id).catch(() => {});
  if (currentUser && db) {
    await deleteTaskFromFirestore(id);
    // onSnapshot handles re-render
  } else {
    tasks = tasks.filter(t => t.id !== id);
    saveLocalTasks();
    if (editingId === id) closeModal();
    render();
  }
  if (editingId === id) closeModal();
}

async function toggleTask(id) {
  const t = tasks.find(t => t.id === id);
  if (!t) return;
  const becomingDone = !isDone(t);
  t.status = becomingDone ? 'done' : 'todo';

  // Recurring task: advance dates and reset to todo
  if (becomingDone && t.reminderRepeat && t.reminderRepeat !== 'none' && t.reminder) {
    const end         = t.reminderEnd ? new Date(t.reminderEnd + 'T23:59:59') : null;
    const nextReminder = advanceByRepeat(t.reminder, t.reminderRepeat);
    if (!end || new Date(nextReminder) <= end) {
      t.status   = 'todo';
      t.reminder = nextReminder;
      if (t.deadline) t.deadline = advanceByRepeat(t.deadline, t.reminderRepeat, true);
    }
  }

  if (currentUser && db) {
    await saveTaskToFirestore(t);
  } else {
    saveLocalTasks();
    render();
  }
}

// ---- Stats ----
function updateStats() {
  const total   = tasks.length;
  const done    = tasks.filter(isDone).length;
  const overdue = tasks.filter(isOverdue).length;
  const pct     = total ? Math.round(done / total * 100) : 0;

  statTotal.textContent    = total;
  statDone.textContent     = done;
  statOverdue.textContent  = overdue;
  progressFill.style.width = pct + '%';
  progressText.textContent = pct + '%';
  overduePill.style.display = overdue > 0 ? '' : 'none';

  bottomActions.classList.toggle('show', tasks.some(isDone));
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

  const active = list.filter(t => !isDone(t));
  const done   = list.filter(t => isDone(t));

  active.forEach(task => taskList.appendChild(makeTaskItem(task)));

  if (done.length > 0) {
    const sep = document.createElement('li');
    sep.className = 'done-section-header';
    sep.textContent = `Tamamlandı (${done.length})`;
    taskList.appendChild(sep);
    done.forEach(task => taskList.appendChild(makeTaskItem(task)));
  }

  initListDrag();
}

function makeTaskItem(task) {
  const li = document.createElement('li');
  li.className = 'task-item' + (isDone(task) ? ' done' : '') + (isOverdue(task) ? ' overdue' : '');
  li.dataset.id       = task.id;
  li.dataset.priority = task.priority;
  li.draggable        = true;

  const chk = document.createElement('div');
  chk.className = 'task-check' + (isDone(task) ? ' checked' : '');
  chk.addEventListener('click', e => { e.stopPropagation(); toggleTask(task.id); });

  const content = document.createElement('div');
  content.className = 'task-content';
  content.style.cursor = 'pointer';
  content.addEventListener('click', () => openModal(task.id));

  const textEl = document.createElement('span');
  textEl.className = 'task-text';
  textEl.textContent = task.text;

  const meta = document.createElement('div');
  meta.className = 'task-meta';

  meta.appendChild(mkTag(task.category, 'tag-cat'));
  if (task.priority === 'high') meta.appendChild(mkTag('Yüksek', 'tag-pri-high'));
  if (task.priority === 'low')  meta.appendChild(mkTag('Düşük',  'tag-pri-low'));
  if (task.status === 'inprogress') meta.appendChild(mkTag('Devam', 'tag-inprogress'));
  task.tags.slice(0, 3).forEach(tag => meta.appendChild(mkTag(tag, 'tag-custom')));

  if (task.deadline) {
    const dl = document.createElement('span');
    dl.className = 'task-deadline' + (isOverdue(task) ? ' overdue' : '');
    dl.textContent = '📅 ' + fmtDate(task.deadline);
    meta.appendChild(dl);
  }

  if (task.subtasks.length > 0) {
    const doneSubs = task.subtasks.filter(s => s.done).length;
    const pct = Math.round(doneSubs / task.subtasks.length * 100);
    const barWrap = document.createElement('div');
    barWrap.className = 'task-subtask-bar';
    barWrap.innerHTML = `<div class="mini-bar"><div class="mini-bar-fill" style="width:${pct}%"></div></div><span class="mini-bar-text">${doneSubs}/${task.subtasks.length}</span>`;
    meta.appendChild(barWrap);
  }

  if (task.attachments && task.attachments.length > 0) {
    const badge = document.createElement('span');
    badge.className = 'task-attachment-badge';
    badge.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>${task.attachments.length}`;
    meta.appendChild(badge);
  }

  if (task.reminderRepeat && task.reminderRepeat !== 'none') {
    const repeatLabels = { daily: 'Günlük', weekly: 'Haftalık', monthly: 'Aylık' };
    const rb = document.createElement('span');
    rb.className = 'tag tag-repeat';
    rb.title = repeatLabels[task.reminderRepeat] || '';
    rb.textContent = '↻ ' + (repeatLabels[task.reminderRepeat] || '');
    meta.appendChild(rb);
  }

  content.append(textEl, meta);

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
  const shown = { todo: 0, inprogress: 0, done: 0 };
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

  $('modal-title').value        = task.text;
  $('modal-notes').value        = task.notes || '';
  $('modal-deadline').value     = task.deadline || '';
  $('modal-reminder').value     = task.reminder || '';
  $('modal-repeat').value       = task.reminderRepeat || 'none';
  $('modal-reminder-end').value = task.reminderEnd || '';
  $('modal-repeat-end-field').style.display = (task.reminderRepeat && task.reminderRepeat !== 'none') ? '' : 'none';
  $('modal-priority').value = task.priority;
  $('modal-category').value = task.category;
  $('modal-status').value   = task.status;

  renderModalTags(task.tags);
  renderModalSubtasks(task.subtasks);
  renderModalAttachments([]); // cleared first; real data loaded async below

  modalOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  // Load full attachment data (images) asynchronously
  loadAttachmentsData(id)
    .then(atts => { if (editingId === id) renderModalAttachments(atts); })
    .catch(() => {});
}

function closeModal() {
  editingId = null;
  modalOverlay.classList.remove('open');
  document.body.style.overflow = '';
}

async function saveModal() {
  if (!editingId) return;
  const task = tasks.find(t => t.id === editingId);
  if (!task) return;

  task.text           = $('modal-title').value.trim() || task.text;
  task.notes          = $('modal-notes').value;
  task.deadline       = $('modal-deadline').value || null;
  task.reminder       = $('modal-reminder').value || null;
  task.reminderRepeat = $('modal-repeat').value || 'none';
  task.reminderEnd    = (task.reminderRepeat !== 'none' ? $('modal-reminder-end').value : null) || null;
  task.priority       = $('modal-priority').value;
  task.category       = $('modal-category').value;
  task.status         = $('modal-status').value;
  task.tags           = [...modalTags];

  if (currentUser && db) {
    await saveTaskToFirestore(task);
  } else {
    saveLocalTasks();
    render();
  }

  scheduleReminders();
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
  input.onkeydown = e => {
    if ((e.key === 'Enter' || e.key === ',') && input.value.trim()) {
      e.preventDefault();
      const val = input.value.trim().replace(',', '');
      if (val && !modalTags.includes(val) && modalTags.length < 10) {
        modalTags.push(val);
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
      if (task) {
        if (currentUser && db) saveTaskToFirestore(task);
        else saveLocalTasks();
      }
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
      if (task) {
        task.subtasks = subtasks;
        if (currentUser && db) saveTaskToFirestore(task);
        else saveLocalTasks();
      }
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
  if (currentUser && db) saveTaskToFirestore(task);
  else saveLocalTasks();
  renderModalSubtasks(task.subtasks);
  input.value = '';
  input.focus();
}

// ---- Attachment storage helpers ----
// Images stored in Firestore subcollection (auth) or separate localStorage key (guest)
// Task doc only keeps metadata {id, name, type} — never image data → no 1MB doc limit issue

function getLocalAttachments(taskId) {
  try {
    return (JSON.parse(localStorage.getItem('yapsak-bence-att') || '{}'))[taskId] || [];
  } catch { return []; }
}

function setLocalAttachments(taskId, atts) {
  const store = JSON.parse(localStorage.getItem('yapsak-bence-att') || '{}');
  store[taskId] = atts;
  localStorage.setItem('yapsak-bence-att', JSON.stringify(store));
}

function removeLocalTaskAttachments(taskId) {
  try {
    const store = JSON.parse(localStorage.getItem('yapsak-bence-att') || '{}');
    delete store[taskId];
    localStorage.setItem('yapsak-bence-att', JSON.stringify(store));
  } catch {}
}

function attRef(taskId) {
  return db.collection('users').doc(currentUser.uid)
    .collection('tasks').doc(taskId).collection('attachments');
}

async function loadAttachmentsData(taskId) {
  if (currentUser && db) {
    const snap = await attRef(taskId).get();
    return snap.docs.map(d => d.data());
  }
  return getLocalAttachments(taskId);
}

async function saveAttachmentData(taskId, att) {
  if (currentUser && db) {
    await attRef(taskId).doc(att.id).set(att);
  } else {
    const atts = getLocalAttachments(taskId);
    atts.push(att);
    setLocalAttachments(taskId, atts);
  }
}

async function deleteAttachmentData(taskId, attId) {
  if (currentUser && db) {
    await attRef(taskId).doc(attId).delete();
  } else {
    setLocalAttachments(taskId, getLocalAttachments(taskId).filter(a => a.id !== attId));
  }
}

async function deleteAllTaskAttachments(taskId) {
  if (currentUser && db) {
    const snap = await attRef(taskId).get();
    if (snap.docs.length) {
      const batch = db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
  } else {
    removeLocalTaskAttachments(taskId);
  }
}

// ---- Attachments (canvas compress + subcollection storage) ----
const MAX_ATTACH_PER_TASK = 10;
const MAX_FILE_BYTES      = 700 * 1024; // 700 KB limit for non-image files (base64 ~960 KB < 1 MB Firestore doc limit)
const TARGET_PHOTO_BYTES  = 700 * 1024; // target ~700 KB per image (each in own doc)

function fileExt(name) { return (name.split('.').pop() || '').toLowerCase(); }

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function compressImage(file) {
  return new Promise(resolve => {
    if (!file.type.startsWith('image/')) { resolve(null); return; }
    const img    = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      const maxDim = 1600;
      if (width > maxDim || height > maxDim) {
        const r = Math.min(maxDim / width, maxDim / height);
        width  = Math.round(width  * r);
        height = Math.round(height * r);
      }
      canvas.width  = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);

      let q = 0.88;
      let dataUrl = canvas.toDataURL('image/jpeg', q);
      while (dataUrl.length > TARGET_PHOTO_BYTES * 1.37 && q > 0.2) {
        q -= 0.1;
        dataUrl = canvas.toDataURL('image/jpeg', q);
      }
      resolve(dataUrl);
    };
    img.onerror = () => { URL.revokeObjectURL(objUrl); resolve(null); };
    img.src = objUrl;
  });
}

function showAttachHint(msg, ms = 3500) {
  $('upload-hint').textContent = msg;
  setTimeout(() => { $('upload-hint').textContent = ''; }, ms);
}

async function uploadAttachment(taskId, file) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  if ((task.attachments || []).length >= MAX_ATTACH_PER_TASK) {
    showAttachHint(`En fazla ${MAX_ATTACH_PER_TASK} dosya eklenebilir.`);
    return;
  }

  const progressWrap = $('upload-progress');
  const progressBar  = $('upload-progress-bar');
  progressWrap.style.display = '';
  progressBar.style.width = '25%';

  const isImage = file.type.startsWith('image/');
  let dataUrl;

  if (isImage) {
    try { dataUrl = await compressImage(file); } catch { dataUrl = null; }
    if (!dataUrl) {
      progressWrap.style.display = 'none';
      showAttachHint('Fotoğraf işlenemedi.');
      return;
    }
  } else {
    if (file.size > MAX_FILE_BYTES) {
      progressWrap.style.display = 'none';
      showAttachHint(`Dosya çok büyük (maks ${Math.round(MAX_FILE_BYTES/1024)} KB — Firestore limiti).`);
      return;
    }
    try { dataUrl = await fileToBase64(file); } catch {
      progressWrap.style.display = 'none';
      showAttachHint('Dosya okunamadı.');
      return;
    }
  }

  progressBar.style.width = '60%';

  const att  = { id: genId(), name: file.name, type: isImage ? 'image/jpeg' : file.type, data: dataUrl, createdAt: new Date().toISOString() };
  const meta = { id: att.id, name: att.name, type: att.type };

  try {
    await saveAttachmentData(taskId, att);           // save image to subcollection/localStorage
    progressBar.style.width = '90%';

    if (!task.attachments) task.attachments = [];
    task.attachments.push(meta);                      // save only metadata to task doc
    if (currentUser && db) await saveTaskToFirestore(task);
    else saveLocalTasks();

    progressBar.style.width = '100%';
    setTimeout(() => { progressWrap.style.display = 'none'; }, 300);

    const allAtts = await loadAttachmentsData(taskId);
    if (editingId === taskId) renderModalAttachments(allAtts);
    render();
  } catch(err) {
    console.error('Attachment save error:', err);
    task.attachments = (task.attachments || []).filter(a => a.id !== att.id);
    try { await deleteAttachmentData(taskId, att.id); } catch {}
    progressWrap.style.display = 'none';
    showAttachHint('Fotoğraf kaydedilemedi: ' + (err.code || err.message || 'hata'), 5000);
  }
}

async function deleteAttachment(taskId, attId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  try {
    await deleteAttachmentData(taskId, attId);
    task.attachments = (task.attachments || []).filter(a => a.id !== attId);
    if (currentUser && db) await saveTaskToFirestore(task);
    else saveLocalTasks();
    const allAtts = await loadAttachmentsData(taskId);
    if (editingId === taskId) renderModalAttachments(allAtts);
    render();
  } catch(err) {
    console.error('Attachment delete error:', err);
    showAttachHint('Silinemedi: ' + (err.code || err.message || 'hata'), 5000);
  }
}

function fileTypeLabel(type, name) {
  if (type && type.startsWith('image/')) return '';
  const ext = fileExt(name).toUpperCase();
  return ext || 'FILE';
}

function renderModalAttachments(attachments) {
  const grid = $('attachments-grid');
  grid.innerHTML = '';

  (attachments || []).forEach(att => {
    const item = document.createElement('div');
    item.className = 'attachment-item';
    const src = att.data || att.url || '';
    const isImg = att.type && att.type.startsWith('image/');

    if (isImg) {
      const img = document.createElement('img');
      img.src = src;
      img.className = 'attachment-thumb';
      img.addEventListener('click', () => {
        const w = window.open();
        if (w) w.document.write(`<html><body style="margin:0;background:#000"><img src="${src}" style="max-width:100%;height:auto;display:block;margin:auto"></body></html>`);
      });
      item.appendChild(img);
    } else {
      const icon = document.createElement('div');
      icon.className = 'attachment-icon';
      const label = fileTypeLabel(att.type, att.name);
      icon.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span class="file-ext-label">${label}</span>`;
      icon.addEventListener('click', () => {
        const a = document.createElement('a');
        a.href = src; a.download = att.name; a.click();
      });
      item.appendChild(icon);
    }

    const name = document.createElement('span');
    name.className = 'attachment-name';
    name.title = att.name;
    name.textContent = att.name;

    const del = document.createElement('button');
    del.className = 'attachment-del';
    del.textContent = '×';
    del.title = 'Sil';
    del.addEventListener('click', e => { e.stopPropagation(); deleteAttachment(editingId, att.id); });

    item.append(name, del);
    grid.appendChild(item);
  });
}

// ---- Drag & Drop — List ----
function initListDrag() {
  const items = taskList.querySelectorAll('.task-item');
  items.forEach(item => {
    item.addEventListener('dragstart', e => {
      dragSrcId = item.dataset.id; dragSrcList = 'list';
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
      saveLocalTasks();
      renderList();
    });
  });
}

// ---- Drag & Drop — Kanban ----
function initKanbanDrag() {
  document.querySelectorAll('.kanban-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      dragSrcId = card.dataset.id; dragSrcList = 'kanban';
      setTimeout(() => card.classList.add('dragging'), 0);
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.addEventListener('dragover', e => { e.preventDefault(); card.classList.add('drag-over'); });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', async e => {
      e.preventDefault();
      card.classList.remove('drag-over');
      if (!dragSrcId || dragSrcId === card.dataset.id) return;
      const srcIdx  = tasks.findIndex(t => t.id === dragSrcId);
      const destIdx = tasks.findIndex(t => t.id === card.dataset.id);
      if (srcIdx !== -1 && destIdx !== -1) {
        const destStatus = tasks[destIdx].status;
        const [moved] = tasks.splice(srcIdx, 1);
        moved.status = destStatus;
        tasks.splice(destIdx, 0, moved);
        if (currentUser && db) await saveTaskToFirestore(moved);
        else saveLocalTasks();
        renderKanban();
      }
    });
  });

  document.querySelectorAll('.kanban-col').forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drag-over'); });
    col.addEventListener('dragleave', e => { if (!col.contains(e.relatedTarget)) col.classList.remove('drag-over'); });
    col.addEventListener('drop', async e => {
      e.preventDefault();
      col.classList.remove('drag-over');
      if (!dragSrcId || dragSrcList !== 'kanban') return;
      const newStatus = col.dataset.status;
      const task = tasks.find(t => t.id === dragSrcId);
      if (task && task.status !== newStatus) {
        task.status = newStatus;
        if (currentUser && db) await saveTaskToFirestore(task);
        else saveLocalTasks();
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
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem(THEME_KEY, next);
  updateThemeIcon(next);
}
function updateThemeIcon(theme) {
  $('theme-icon-dark').style.display  = theme === 'dark'  ? '' : 'none';
  $('theme-icon-light').style.display = theme === 'light' ? '' : 'none';
}

// ---- Service Worker ----
let swRegistration = null;

async function initSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    swRegistration = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
    // Auto-reload when a new SW takes over (so users always get fresh content)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!sessionStorage.getItem('sw-reloaded')) {
        sessionStorage.setItem('sw-reloaded', '1');
        window.location.reload();
      }
    });
  } catch (e) {
    console.warn('SW kaydedilemedi:', e);
  }
}

// ---- Notifications ----
async function showNotification(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (swRegistration) {
    try {
      await swRegistration.showNotification(title, { body, icon: 'icon.svg', badge: 'icon.svg' });
      return;
    } catch (e) {}
  }
  new Notification(title, { body });
}

// ---- Reminder repeat helpers ----
function advanceByRepeat(isoStr, repeat, dateOnly = false) {
  const d = dateOnly ? new Date(isoStr + 'T00:00:00') : new Date(isoStr);
  if (repeat === 'daily')        d.setDate(d.getDate() + 1);
  else if (repeat === 'weekly')  d.setDate(d.getDate() + 7);
  else if (repeat === 'monthly') d.setMonth(d.getMonth() + 1);
  return dateOnly ? d.toISOString().slice(0, 10) : d.toISOString().slice(0, 16);
}

function getNextReminder(task) {
  if (!task.reminder) return null;
  const repeat = task.reminderRepeat || 'none';
  const end    = task.reminderEnd ? new Date(task.reminderEnd + 'T23:59:59') : null;
  const now    = new Date();
  const next   = new Date(task.reminder);
  if (repeat === 'none') return next > now ? next : null;
  let cur = new Date(task.reminder);
  while (cur <= now) {
    if (repeat === 'daily')        cur.setDate(cur.getDate() + 1);
    else if (repeat === 'weekly')  cur.setDate(cur.getDate() + 7);
    else if (repeat === 'monthly') cur.setMonth(cur.getMonth() + 1);
    else break;
  }
  if (end && cur > end) return null;
  return cur;
}

function requestNotifPermission() {
  if (!('Notification' in window)) return;
  Notification.requestPermission().then(p => {
    if (p === 'granted') { notifBtn.style.color = 'var(--low)'; scheduleReminders(); }
  });
}
function scheduleReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  tasks.forEach(task => {
    if (!task.reminder || isDone(task)) return;
    const next = getNextReminder(task);
    if (!next) return;
    const delay = next.getTime() - Date.now();
    if (delay > 0 && delay < 86400000) {
      setTimeout(() => showNotification('Yapsak Bence ⏰', task.text), delay);
    }
  });
}
function checkPastReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const now = Date.now();
  tasks.forEach(task => {
    if (!task.reminder || isDone(task)) return;
    const repeat = task.reminderRepeat || 'none';
    const end    = task.reminderEnd ? new Date(task.reminderEnd + 'T23:59:59').getTime() : Infinity;
    let t = new Date(task.reminder).getTime();
    while (t <= now) {
      if (t > now - 60000 && t <= end) { showNotification('Yapsak Bence ⏰', task.text); break; }
      if (repeat === 'none') break;
      if (repeat === 'daily')        t += 86400000;
      else if (repeat === 'weekly')  t += 7 * 86400000;
      else if (repeat === 'monthly') { const d = new Date(t); d.setMonth(d.getMonth() + 1); t = d.getTime(); }
      else break;
    }
  });
}
function checkMissedReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const LAST_KEY = 'yapsak-bence-last-check';
  const lastCheck = parseInt(localStorage.getItem(LAST_KEY) || '0', 10);
  const now = Date.now();
  localStorage.setItem(LAST_KEY, String(now));
  if (!lastCheck) return;
  tasks.forEach(task => {
    if (!task.reminder || isDone(task)) return;
    const repeat = task.reminderRepeat || 'none';
    const end    = task.reminderEnd ? new Date(task.reminderEnd + 'T23:59:59').getTime() : Infinity;
    let t = new Date(task.reminder).getTime();
    while (t <= now) {
      if (t > lastCheck && t <= now && t <= end) {
        showNotification('Yapsak Bence ⏰ (Kaçırıldı)', task.text);
        break;
      }
      if (repeat === 'none') break;
      if (repeat === 'daily')        t += 86400000;
      else if (repeat === 'weekly')  t += 7 * 86400000;
      else if (repeat === 'monthly') { const d = new Date(t); d.setMonth(d.getMonth() + 1); t = d.getTime(); }
      else break;
    }
  });
}

// ---- View switch ----
function switchView(v) {
  view = v;
  document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  listView.classList.toggle('hidden', v === 'kanban');
  kanbanView.classList.toggle('hidden', v !== 'kanban');
  $('filters').classList.toggle('hidden', v === 'kanban');
  render();
}

// ---- AUTH ----
const loadingScreen = $('loading-screen');

function hideLoading() {
  loadingScreen.classList.add('hidden');
}

function showApp() {
  hideLoading();
  authOverlay.classList.add('hidden');
  userBtn.style.display = '';
  render();
}

function showAuth() {
  hideLoading();
  authOverlay.classList.remove('hidden');
  userBtn.style.display = 'none';
}

function enterGuestMode() {
  guestMode = true;
  tasks = migrate(loadLocalTasks());
  checkMissedReminders();
  hideLoading();
  authOverlay.classList.add('hidden');
  render();
}

// User menu
let userMenuOpen = false;
function buildUserMenu(user) {
  let menu = document.getElementById('user-menu');
  if (!menu) {
    menu = document.createElement('div');
    menu.className = 'user-menu';
    menu.id = 'user-menu';
    document.body.appendChild(menu);
  }
  const name  = user.displayName || user.email || 'Kullanıcı';
  const email = user.email || '';
  menu.innerHTML = `
    <div class="user-menu-info">
      <div class="user-menu-name">${name}</div>
      ${email ? `<div class="user-menu-email">${email}</div>` : ''}
    </div>
    <button class="user-menu-btn danger" id="btn-signout">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      Çıkış Yap
    </button>
  `;
  $('btn-signout').addEventListener('click', () => {
    auth.signOut();
    menu.classList.remove('open');
  });
  return menu;
}

// Auth error messages
function authErr(msg) {
  const el = $('auth-error');
  const map = {
    'auth/invalid-email': 'Geçersiz e-posta adresi.',
    'auth/user-not-found': 'Bu e-posta ile kayıtlı kullanıcı bulunamadı.',
    'auth/wrong-password': 'Şifre hatalı.',
    'auth/email-already-in-use': 'Bu e-posta zaten kullanımda.',
    'auth/weak-password': 'Şifre en az 6 karakter olmalı.',
    'auth/popup-closed-by-user': 'Giriş iptal edildi.',
    'auth/too-many-requests': 'Çok fazla deneme. Lütfen bekleyin.',
  };
  el.textContent = map[msg] || 'Bir hata oluştu. Tekrar dene.';
  setTimeout(() => el.textContent = '', 4000);
}

// ---- Auth Event Listeners ----
$('btn-google').addEventListener('click', async () => {
  if (!firebaseReady) { enterGuestMode(); return; }
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await auth.signInWithPopup(provider);
  } catch (e) { authErr(e.code); }
});

$('btn-login').addEventListener('click', async () => {
  if (!firebaseReady) { enterGuestMode(); return; }
  const email = $('auth-email').value.trim();
  const pass  = $('auth-password').value;
  if (!email || !pass) return;
  try {
    await auth.signInWithEmailAndPassword(email, pass);
  } catch (e) { authErr(e.code); }
});

$('btn-register').addEventListener('click', async () => {
  if (!firebaseReady) { enterGuestMode(); return; }
  const email = $('auth-email').value.trim();
  const pass  = $('auth-password').value;
  if (!email || !pass) return;
  try {
    await auth.createUserWithEmailAndPassword(email, pass);
  } catch (e) { authErr(e.code); }
});

$('btn-guest').addEventListener('click', enterGuestMode);

// Enter key on auth inputs
[$('auth-email'), $('auth-password')].forEach(el => {
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter') $('btn-login').click();
  });
});

// User button
userBtn.addEventListener('click', e => {
  e.stopPropagation();
  if (!currentUser) return;
  const menu = buildUserMenu(currentUser);
  userMenuOpen = !userMenuOpen;
  menu.classList.toggle('open', userMenuOpen);
});
document.addEventListener('click', () => {
  const menu = document.getElementById('user-menu');
  if (menu) { menu.classList.remove('open'); userMenuOpen = false; }
});

// ---- App Event Listeners ----
// Form details toggle
const formDetailsToggle = $('form-details-toggle');
const formDetails       = $('form-details');
const formTagsWrap      = $('form-tags-wrap');
const formTagInput      = $('form-tag-input');
let formTags = [];

formDetailsToggle.addEventListener('click', () => {
  const open = formDetails.classList.toggle('open');
  formDetailsToggle.classList.toggle('open', open);
  formDetailsToggle.querySelector('span') && null;
  formDetailsToggle.childNodes.forEach(n => { if (n.nodeType === 3) n.textContent = open ? ' Kapat' : ' Detaylar ekle'; });
  if (open) $('form-notes').focus();
});

// Form tag input
formTagInput.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ',') && formTagInput.value.trim()) {
    e.preventDefault();
    const val = formTagInput.value.trim().replace(',', '');
    if (val && !formTags.includes(val) && formTags.length < 10) {
      formTags.push(val);
      renderFormTags();
    }
    formTagInput.value = '';
  }
});
formTagsWrap.addEventListener('click', () => formTagInput.focus());

function renderFormTags() {
  formTagsWrap.innerHTML = '';
  formTags.forEach((tag, i) => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.innerHTML = `${tag} <button class="tag-pill-remove" type="button">×</button>`;
    pill.querySelector('.tag-pill-remove').addEventListener('click', () => {
      formTags.splice(i, 1); renderFormTags();
    });
    formTagsWrap.appendChild(pill);
  });
  formTagsWrap.appendChild(formTagInput);
  formTagInput.focus();
}

addForm.addEventListener('submit', e => {
  e.preventDefault();
  const text = taskInput.value.trim();
  if (!text) {
    taskInput.classList.add('shake');
    setTimeout(() => taskInput.classList.remove('shake'), 300);
    taskInput.focus();
    return;
  }
  const formRepeat = $('form-repeat').value || 'none';
  const extras = {
    notes:          $('form-notes').value,
    reminder:       $('form-reminder').value || null,
    reminderRepeat: formRepeat,
    reminderEnd:    (formRepeat !== 'none' ? $('form-reminder-end').value : null) || null,
    status:         $('form-status').value,
    tags:           [...formTags],
  };
  addTask(text, prioritySelect.value, categorySelect.value, deadlineInput.value, extras);
  // Reset form
  taskInput.value = '';
  deadlineInput.value = '';
  $('form-notes').value = '';
  $('form-reminder').value = '';
  $('form-repeat').value = 'none';
  $('form-reminder-end').value = '';
  $('form-repeat-end-field').style.display = 'none';
  $('form-status').value = 'todo';
  formTags = [];
  renderFormTags();
  // Close details panel
  formDetails.classList.remove('open');
  formDetailsToggle.classList.remove('open');
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

// Show/hide reminder end date when repeat changes
$('modal-repeat').addEventListener('change', e => {
  $('modal-repeat-end-field').style.display = e.target.value === 'none' ? 'none' : '';
});
$('form-repeat').addEventListener('change', e => {
  $('form-repeat-end-field').style.display = e.target.value === 'none' ? 'none' : '';
});

$('clear-done').addEventListener('click', async () => {
  const doneIds = tasks.filter(isDone).map(t => t.id);
  // Clean up attachments for each done task
  await Promise.all(doneIds.map(id => deleteAllTaskAttachments(id).catch(() => {})));
  if (currentUser && db) {
    const batch = db.batch();
    doneIds.forEach(id => {
      batch.delete(db.collection('users').doc(currentUser.uid).collection('tasks').doc(id));
    });
    await batch.commit();
  } else {
    tasks = tasks.filter(t => !isDone(t));
    saveLocalTasks();
    render();
  }
});

// Attachment file input
$('attachment-input').addEventListener('change', async e => {
  const files = Array.from(e.target.files);
  for (const file of files) {
    await uploadAttachment(editingId, file);
  }
  e.target.value = ''; // reset so same file can be re-selected
});

$('modal-close').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
$('modal-save').addEventListener('click', saveModal);
$('modal-delete').addEventListener('click', () => { if (editingId) deleteTask(editingId); });
$('subtask-add-btn').addEventListener('click', addSubtask);
$('subtask-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addSubtask(); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && editingId) closeModal(); });

// ---- Init ----
loadTheme();
initSW();

if ('Notification' in window && Notification.permission === 'granted') {
  notifBtn.style.color = 'var(--low)';
}

const fbReady = initFirebase();

if (fbReady) {
  // Firebase configured: listen for auth state
  auth.onAuthStateChanged(user => {
    currentUser = user;
    if (user) {
      guestMode = false;
      subscribeFirestore();
      showApp();
      scheduleReminders();
      setInterval(checkPastReminders, 30000);
    } else {
      if (fsListener) { fsListener(); fsListener = null; }
      tasks = [];
      showAuth();
    }
  });
} else {
  // Firebase not configured: go to guest mode automatically
  enterGuestMode(); // also calls hideLoading()
  scheduleReminders();
  setInterval(checkPastReminders, 30000);
}
