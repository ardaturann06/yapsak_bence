/* ============================================================
   YAPSAK BENCE — app.js
   Features: Auth (Firebase/Guest), Kanban, Search, Filter,
             Tags, Subtasks, Notes, Deadline, Reminder,
             Drag&Drop, Theme, Notifications
   ============================================================ */

const STORAGE_KEY  = 'yapsak-bence-v2';
const THEME_KEY    = 'yapsak-bence-theme';
const SETTINGS_KEY = 'yapsak-bence-settings';
const XP_KEY       = 'yapsak-bence-xp';
const STREAK_KEY   = 'yapsak-bence-streak';
const LISTS_KEY    = 'yapsak-bence-lists';

// ---- XP / Level System ----
const XP_PER_LEVEL = 300;
const XP_REWARDS   = { high: 50, normal: 30, low: 10 };
const XP_BONUS_EARLY = 20;
const LEVEL_NAMES  = ['Çaylak','Acemi','Gelişen','Yetenekli','Uzman','Usta','Efsane'];

let xpTotal = 0;

function loadXP() {
  try { xpTotal = parseInt(localStorage.getItem(XP_KEY)) || 0; } catch {}
  renderXPBar();
}

function saveXPLocal() {
  localStorage.setItem(XP_KEY, xpTotal);
}

async function saveXPFirestore() {
  if (!currentUser || !db) return;
  try {
    await db.collection('users').doc(currentUser.uid).set({ xp: xpTotal }, { merge: true });
  } catch {}
}

async function loadXPFirestore() {
  if (!currentUser || !db) return;
  try {
    const doc = await db.collection('users').doc(currentUser.uid).get();
    if (doc.exists && doc.data().xp) {
      xpTotal = doc.data().xp;
      saveXPLocal();
      renderXPBar();
    }
  } catch {}
}

function levelFromXP(xp) { return Math.floor(xp / XP_PER_LEVEL) + 1; }
function levelName(level) { return LEVEL_NAMES[Math.min(level - 1, LEVEL_NAMES.length - 1)] + (level > LEVEL_NAMES.length ? ' ' + (level - LEVEL_NAMES.length + 1) : ''); }

function renderXPBar() {
  const level    = levelFromXP(xpTotal);
  const xpInLevel = xpTotal - (level - 1) * XP_PER_LEVEL;
  const pct      = Math.min(xpInLevel / XP_PER_LEVEL * 100, 100);
  const badge    = $('xp-badge');
  const fill     = $('xp-bar-fill');
  const label    = $('xp-label');
  if (!badge) return;
  badge.textContent = `Lv.${level} ${levelName(level)}`;
  fill.style.width  = pct + '%';
  label.textContent = `${xpInLevel} / ${XP_PER_LEVEL} XP`;
}

async function addXP(task) {
  const base     = XP_REWARDS[task.priority] ?? XP_REWARDS.normal;
  const onTime   = task.deadline && new Date(task.deadline) >= new Date(new Date().toDateString());
  const earned   = base + (onTime ? XP_BONUS_EARLY : 0);
  const oldLevel = levelFromXP(xpTotal);
  xpTotal += earned;
  const newLevel = levelFromXP(xpTotal);
  saveXPLocal();
  await saveXPFirestore();
  renderXPBar();
  showXPToast(earned, onTime, newLevel > oldLevel ? newLevel : null);
}

function showXPToast(earned, bonus, newLevel) {
  const toast = document.createElement('div');
  toast.className = 'xp-toast';
  let msg = `+${earned} XP`;
  if (bonus) msg += ' ⚡ Zamanında!';
  if (newLevel) msg = `🏆 Seviye ${newLevel}: ${levelName(newLevel)}!`;
  toast.textContent = msg;
  toast.classList.toggle('xp-toast-levelup', !!newLevel);
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); }, 2200);
}

// ---- Lists ----
const DEFAULT_LISTS = [
  { id: 'genel',     name: 'Genel',     emoji: '📋' },
  { id: 'is',        name: 'İş',        emoji: '💼' },
  { id: 'kisisel',   name: 'Kişisel',   emoji: '👤' },
  { id: 'alisveris', name: 'Alışveriş', emoji: '🛒' },
  { id: 'saglik',    name: 'Sağlık',    emoji: '❤️' },
];
const EMOJI_PRESETS = ['📋','💼','👤','🛒','❤️','🎯','📚','🏋️','🎮','✈️','🏠','💡','🎵','🌿','🔧','⭐','🔔','📦','🎨','🚀'];
let customLists  = [];
let selectedList = null;
let createListEmoji = '📋';

function allLists() { return [...DEFAULT_LISTS, ...customLists]; }

function loadLists() {
  try { customLists = JSON.parse(localStorage.getItem(LISTS_KEY)) || []; } catch {}
}

function saveLists() {
  localStorage.setItem(LISTS_KEY, JSON.stringify(customLists));
  saveListsFirestore();
}

async function saveListsFirestore() {
  if (!currentUser || !db) return;
  try { await db.collection('users').doc(currentUser.uid).set({ lists: customLists }, { merge: true }); } catch {}
}

async function loadListsFirestore() {
  if (!currentUser || !db) return;
  try {
    const doc = await db.collection('users').doc(currentUser.uid).get();
    if (doc.exists && doc.data().lists) {
      customLists = doc.data().lists;
      localStorage.setItem(LISTS_KEY, JSON.stringify(customLists));
      renderListChips();
      renderListOptions();
    }
  } catch {}
}

function renderListChips() {
  const wrap = $('list-chips');
  if (!wrap) return;
  const all = allLists();
  wrap.innerHTML =
    `<button class="list-chip${selectedList === null ? ' active' : ''}" data-list="">Tümü</button>` +
    all.map(l =>
      `<button class="list-chip${selectedList === l.id ? ' active' : ''}" data-list="${l.id}">` +
      `${l.emoji} ${l.name}` +
      (customLists.find(c => c.id === l.id) ? ` <span class="list-chip-del" data-del="${l.id}">×</span>` : '') +
      `</button>`
    ).join('') +
    `<button class="list-chip list-chip-add" id="list-chip-add">＋ Yeni</button>`;

  wrap.querySelectorAll('.list-chip[data-list]').forEach(btn => {
    btn.addEventListener('click', e => {
      if (e.target.classList.contains('list-chip-del')) return;
      selectedList = btn.dataset.list || null;
      closeMenu();
      renderListChips();
      render();
    });
  });
  wrap.querySelectorAll('.list-chip-del').forEach(span => {
    span.addEventListener('click', e => {
      e.stopPropagation();
      const listName = allLists().find(l => l.id === span.dataset.del)?.name || '';
      if (!confirm(`"${listName}" listesini sil?`)) return;
      deleteList(span.dataset.del);
    });
  });
  const addBtn = $('list-chip-add');
  if (addBtn) addBtn.addEventListener('click', openCreateList);
}

function renderListOptions() {
  const all = allLists();
  const opts = all.map(l => `<option value="${l.id}">${l.emoji} ${l.name}</option>`).join('');
  ['category-select', 'modal-category', 'stg-category'].forEach(id => {
    const el = $(id);
    if (!el) return;
    const cur = el.value;
    el.innerHTML = opts;
    el.value = all.find(l => l.id === cur) ? cur : 'genel';
  });
}

function createList(name, emoji) {
  const id = 'list_' + Date.now().toString(36);
  customLists.push({ id, name: name.trim(), emoji });
  saveLists();
  renderListChips();
  renderListOptions();
}

function deleteList(id) {
  customLists = customLists.filter(l => l.id !== id);
  if (selectedList === id) selectedList = null;
  saveLists();
  renderListChips();
  renderListOptions();
  render();
}

function openMenu() {
  $('sidebar-backdrop').classList.remove('hidden');
  $('sidebar-backdrop').classList.add('open');
}
function closeMenu() {
  const bd = $('sidebar-backdrop');
  bd.classList.remove('open');
  setTimeout(() => bd.classList.add('hidden'), 260);
}

function openCreateList() {
  createListEmoji = '📋';
  const overlay = $('create-list-overlay');
  const grid = $('create-list-emoji-grid');
  grid.innerHTML = EMOJI_PRESETS.map(e =>
    `<button class="emoji-preset${e === createListEmoji ? ' selected' : ''}" data-emoji="${e}">${e}</button>`
  ).join('');
  grid.querySelectorAll('.emoji-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      createListEmoji = btn.dataset.emoji;
      grid.querySelectorAll('.emoji-preset').forEach(b => b.classList.toggle('selected', b === btn));
      $('create-list-preview').textContent = createListEmoji;
    });
  });
  $('create-list-preview').textContent = createListEmoji;
  $('new-list-name').value = '';
  overlay.classList.remove('hidden');
  setTimeout(() => $('new-list-name').focus(), 50);
}

function closeCreateList() {
  $('create-list-overlay').classList.add('hidden');
}

// ---- Settings ----
let settings = {
  sound:           true,
  confetti:        true,
  sortOrder:       'manual',
  defaultPriority: 'normal',
  defaultCategory: 'genel',
  hideDone:        false,
  accentColor:     '#7c6dfa',
  language:        'tr',
  pomoWork:        25,
  pomoShort:       5,
  pomoLong:        15,
  notifications:   false,
  compactMode:     false,
};

// ---- i18n ----
const I18N = {
  tr: {
    'filter.all':        'Tümü',
    'filter.todo':       'Yapılacak',
    'filter.inprogress': 'Devam',
    'filter.done':       'Bitti',
    'filter.overdue':    '⚠ Gecikmiş',
    'empty':             'Görev bulunamadı',
    'kanban.todo':       'Yapılacak',
    'kanban.inprogress': 'Devam Ediyor',
    'kanban.done':       'Tamamlandı',
    'stg.effects':       'Efektler',
    'stg.tasklist':      'Görev Listesi',
    'stg.defaults':      'Yeni Görev Varsayılanları',
    'stg.appearance':    'Görünüm',
    'stg.accentColor':   'Vurgu Rengi',
    'stg.compact':       'Kompakt mod',
    'stg.pomodoro':      'Pomodoro',
    'stg.pomoWork':      'Çalışma (dk)',
    'stg.pomoShort':     'Kısa Mola (dk)',
    'stg.pomoLong':      'Uzun Mola (dk)',
    'stg.notifications': 'Bildirimler',
    'stg.notifLabel':    'Hatırlatıcı bildirimleri',
  },
  en: {
    'filter.all':        'All',
    'filter.todo':       'To Do',
    'filter.inprogress': 'In Progress',
    'filter.done':       'Done',
    'filter.overdue':    '⚠ Overdue',
    'empty':             'No tasks found',
    'kanban.todo':       'To Do',
    'kanban.inprogress': 'In Progress',
    'kanban.done':       'Done',
    'stg.effects':       'Effects',
    'stg.tasklist':      'Task List',
    'stg.defaults':      'New Task Defaults',
    'stg.appearance':    'Appearance',
    'stg.accentColor':   'Accent Color',
    'stg.compact':       'Compact mode',
    'stg.pomodoro':      'Pomodoro',
    'stg.pomoWork':      'Work (min)',
    'stg.pomoShort':     'Short Break (min)',
    'stg.pomoLong':      'Long Break (min)',
    'stg.notifications': 'Notifications',
    'stg.notifLabel':    'Reminder notifications',
  },
};
function t(key) {
  const lang = settings.language || 'tr';
  return (I18N[lang] && I18N[lang][key]) || I18N.tr[key] || key;
}
function applyLanguage() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
}

function shadeColor(hex, amt) {
  const n = parseInt(hex.replace('#',''), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xFF) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xFF) + amt));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (saved) settings = { ...settings, ...saved };
  } catch {}
  applySettings();
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  applySettings();
  render();
}

function applySettings() {
  const ps = $('priority-select');
  const cs = $('category-select');
  if (ps) ps.value = settings.defaultPriority;
  if (cs) cs.value = settings.defaultCategory;

  // Accent color
  const accent = settings.accentColor || '#7c6dfa';
  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--accent-dim', shadeColor(accent, -28));

  // Compact mode
  document.body.classList.toggle('compact', !!settings.compactMode);

  // Pomodoro durations — guarded because POMO_DURATIONS is declared later in the file
  try {
    POMO_DURATIONS.work  = (settings.pomoWork  || 25) * 60;
    POMO_DURATIONS.short = (settings.pomoShort || 5)  * 60;
    POMO_DURATIONS.long  = (settings.pomoLong  || 15) * 60;
  } catch { /* not yet initialized; Pomodoro init reads settings directly */ }

  // Language
  applyLanguage();

  // Active swatch highlight
  document.querySelectorAll('.accent-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.color === accent);
  });
}

function openSettings() {
  const drawer = $('settings-drawer');
  drawer.classList.add('open');
  setToggle('stg-sound',    settings.sound);
  setToggle('stg-confetti', settings.confetti);
  setToggle('stg-hidedone', settings.hideDone);
  $('stg-sort').value      = settings.sortOrder;
  $('stg-priority').value  = settings.defaultPriority;
  $('stg-category').value  = settings.defaultCategory;
  setToggle('stg-compact',  settings.compactMode);
  $('stg-language').value  = settings.language || 'tr';
  $('stg-pomo-work').value  = settings.pomoWork  || 25;
  $('stg-pomo-short').value = settings.pomoShort || 5;
  $('stg-pomo-long').value  = settings.pomoLong  || 15;
  setToggle('stg-notif',    settings.notifications);
  applySettings(); // refresh swatch active states
}

function closeSettings() {
  $('settings-drawer').classList.remove('open');
}

function setToggle(id, val) {
  const el = $(id);
  if (el) el.checked = !!val;
}

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
let selectMode  = false;
let selectedIds = new Set();

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
      tasks = migrate(snap.docs.map(d => ({ id: d.id, ...d.data() }))).sort((a, b) => a.order - b.order);
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
    recurType:   t.recurType   || 'none',
    recurEnd:    t.recurEnd    || null,
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
  if (selectedList) list = list.filter(t => t.category === selectedList);
  if (filter === 'all')             list = list.filter(t => !isDone(t));
  else if (filter === 'todo')       list = list.filter(t => t.status === 'todo');
  else if (filter === 'inprogress') list = list.filter(t => t.status === 'inprogress');
  else if (filter === 'done')       list = list.filter(t => isDone(t));
  else if (filter === 'overdue')    list = list.filter(t => isOverdue(t));

  if (settings.hideDone && filter === 'all') {
    list = list.filter(t => !isDone(t));
  }

  const priOrd = { high: 0, normal: 1, low: 2 };
  if (settings.sortOrder === 'deadline') {
    list.sort((a, b) => {
      if (!a.deadline && !b.deadline) return 0;
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return new Date(a.deadline) - new Date(b.deadline);
    });
  } else if (settings.sortOrder === 'priority') {
    list.sort((a, b) => (priOrd[a.priority] ?? 1) - (priOrd[b.priority] ?? 1));
  } else if (settings.sortOrder === 'alpha') {
    list.sort((a, b) => a.text.localeCompare(b.text, 'tr'));
  } else if (settings.sortOrder === 'created') {
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

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
    recurType:   extras.recurType   || 'none',
    recurEnd:    extras.recurEnd    || null,
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

  // Deadline-based recurrence (recurType / recurEnd)
  if (becomingDone && t.recurType && t.recurType !== 'none' && t.deadline) {
    const end     = t.recurEnd ? new Date(t.recurEnd + 'T23:59:59') : null;
    const nextDl  = advanceByRepeat(t.deadline, t.recurType, true);
    if (!end || new Date(nextDl) <= end) {
      t.status   = 'todo';
      t.deadline = nextDl;
    }
  }
  // Reminder-based recurrence (legacy reminderRepeat)
  if (becomingDone && t.reminderRepeat && t.reminderRepeat !== 'none' && t.reminder) {
    const end         = t.reminderEnd ? new Date(t.reminderEnd + 'T23:59:59') : null;
    const nextReminder = advanceByRepeat(t.reminder, t.reminderRepeat);
    if (!end || new Date(nextReminder) <= end) {
      t.status   = 'todo';
      t.reminder = nextReminder;
      if (t.deadline && t.recurType === 'none') t.deadline = advanceByRepeat(t.deadline, t.reminderRepeat, true);
    }
  }

  if (becomingDone) {
    playDoneSound();
    fireConfetti();
    addXP(t);
    recordTaskDone();
  }

  if (currentUser && db) {
    await saveTaskToFirestore(t);
  } else {
    saveLocalTasks();
    render();
  }
}

// ---- Done effects ----
function playDoneSound() {
  if (!settings.sound) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523, 659, 784]; // C5 E5 G5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.12;
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  } catch {}
}

let confettiInstance = null;

function getConfettiInstance() {
  if (confettiInstance) return confettiInstance;
  if (typeof confetti !== 'function') return null;
  const canvas = document.createElement('canvas');
  canvas.id = 'confetti-canvas';
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9998';
  document.body.appendChild(canvas);
  confettiInstance = confetti.create(canvas, { resize: true, useWorker: false });
  return confettiInstance;
}

let cleanerTimer = null;

function fireConfetti() {
  if (!settings.confetti) return;
  const fire = getConfettiInstance();
  if (!fire) return;
  const colors = ['#7c6dfa', '#60d999', '#f8a72a', '#ff6b6b', '#fff'];
  const opts = { particleCount: 70, spread: 60, colors, gravity: 0.45, ticks: 900, scalar: 1.1, drift: 0 };

  // Sol alt
  fire({ ...opts, origin: { x: 0.2, y: 1 }, angle: 65 });
  // Orta
  setTimeout(() => fire({ ...opts, particleCount: 90, origin: { x: 0.5, y: 1 }, angle: 90 }), 150);
  // Sağ alt
  setTimeout(() => fire({ ...opts, origin: { x: 0.8, y: 1 }, angle: 115 }), 300);

  if (cleanerTimer) clearTimeout(cleanerTimer);
  cleanerTimer = setTimeout(spawnCleaner, 2200);
}

function spawnCleaner() {
  const existing = document.getElementById('cleaner-car');
  if (existing) existing.remove();
  const car = document.createElement('div');
  car.id = 'cleaner-car';
  car.innerHTML = '🚛';
  car.className = 'cleaner-car';
  document.body.appendChild(car);
  // Midway through — reset confetti so it looks like the car collected it
  setTimeout(() => { if (confettiInstance) confettiInstance.reset(); }, 1200);
  car.addEventListener('animationend', () => car.remove());
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

  if (selectMode) {
    li.draggable = false;
    if (selectedIds.has(task.id)) li.classList.add('selected');
    li.addEventListener('click', e => { e.stopPropagation(); toggleSelectItem(task.id); });
  }

  const chk = document.createElement('div');
  chk.className = 'task-check' + (isDone(task) ? ' checked' : '');
  chk.addEventListener('click', e => {
    e.stopPropagation();
    if (selectMode) toggleSelectItem(task.id);
    else toggleTask(task.id);
  });

  const content = document.createElement('div');
  content.className = 'task-content';
  content.style.cursor = 'pointer';
  content.addEventListener('click', () => { if (!selectMode) openModal(task.id); });

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

  if (task.recurType && task.recurType !== 'none') {
    const recurLabels = { daily: 'Günlük', weekly: 'Haftalık', monthly: 'Aylık' };
    const rb = document.createElement('span');
    rb.className = 'tag tag-repeat';
    const endStr = task.recurEnd ? ' → ' + fmtDate(task.recurEnd) : '';
    rb.title = (recurLabels[task.recurType] || '') + endStr;
    rb.textContent = '↻ ' + (recurLabels[task.recurType] || '') + endStr;
    meta.appendChild(rb);
  }

  if (task.reminderRepeat && task.reminderRepeat !== 'none') {
    const repeatLabels = { daily: 'Günlük', weekly: 'Haftalık', monthly: 'Aylık' };
    const rb = document.createElement('span');
    rb.className = 'tag tag-repeat';
    rb.title = repeatLabels[task.reminderRepeat] || '';
    rb.textContent = '🔔↻ ' + (repeatLabels[task.reminderRepeat] || '');
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
  $('modal-recur-type').value   = task.recurType || 'none';
  $('modal-recur-end').value    = task.recurEnd || '';
  $('modal-recur-end-wrap').style.display = (task.recurType && task.recurType !== 'none') ? '' : 'none';
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
  task.recurType      = $('modal-recur-type').value || 'none';
  task.recurEnd       = (task.recurType !== 'none' ? $('modal-recur-end').value : null) || null;
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
    item.addEventListener('drop', async e => {
      e.preventDefault();
      item.classList.remove('drag-over');
      if (!dragSrcId || dragSrcId === item.dataset.id || dragSrcList !== 'list') return;
      const srcIdx  = tasks.findIndex(t => t.id === dragSrcId);
      const destIdx = tasks.findIndex(t => t.id === item.dataset.id);
      if (srcIdx === -1 || destIdx === -1) return;
      const [moved] = tasks.splice(srcIdx, 1);
      tasks.splice(destIdx, 0, moved);
      tasks.forEach((t, i) => { t.order = i; });
      if (currentUser && db) {
        await Promise.all(tasks.map(t => saveTaskToFirestore(t)));
      } else {
        saveLocalTasks();
        renderList();
      }
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

// ---- Stats ----
function openStats() {
  const total    = tasks.length;
  const done     = tasks.filter(isDone).length;
  const inprog   = tasks.filter(t => t.status === 'inprogress').length;
  const overdue  = tasks.filter(isOverdue).length;
  const pct      = total ? Math.round(done / total * 100) : 0;

  // Category breakdown
  const catLabels = { genel: 'Genel', is: 'İş', kisisel: 'Kişisel', alisveris: 'Alışveriş', saglik: 'Sağlık' };
  const catCounts = {};
  tasks.forEach(t => { catCounts[t.category] = (catCounts[t.category] || 0) + 1; });
  const maxCat = Math.max(...Object.values(catCounts), 1);

  // Priority breakdown
  const priColors = { high: '#f87272', normal: '#7c6dfa', low: '#60d999' };
  const priLabels = { high: 'Yüksek', normal: 'Normal', low: 'Düşük' };
  const priCounts = { high: 0, normal: 0, low: 0 };
  tasks.forEach(t => { if (priCounts[t.priority] !== undefined) priCounts[t.priority]++; });

  // Donut SVG for completion
  const r = 40, cx = 50, cy = 50, circ = 2 * Math.PI * r;
  const fill = circ * pct / 100;
  const donutSVG = `<svg width="100" height="100" viewBox="0 0 100 100">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--surface3)" stroke-width="12"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--accent)" stroke-width="12"
      stroke-dasharray="${fill} ${circ}" stroke-dashoffset="${circ * 0.25}" stroke-linecap="round"/>
    <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle"
      fill="var(--text)" font-size="16" font-weight="700">${pct}%</text>
  </svg>`;

  $('stats-body').innerHTML = `
    <div class="stats-summary">
      <div class="stat-card accent"><span class="stat-card-label">Toplam</span><span class="stat-card-value">${total}</span></div>
      <div class="stat-card green"><span class="stat-card-label">Tamamlanan</span><span class="stat-card-value">${done}</span></div>
      <div class="stat-card warn"><span class="stat-card-label">Devam Eden</span><span class="stat-card-value">${inprog}</span></div>
      <div class="stat-card red"><span class="stat-card-label">Gecikmiş</span><span class="stat-card-value">${overdue}</span></div>
    </div>

    <div class="stats-section-title">Tamamlanma Oranı</div>
    <div class="stats-donut-wrap">
      ${donutSVG}
      <div class="stats-legend">
        <div class="stats-legend-item"><span class="stats-legend-dot" style="background:var(--accent)"></span>Tamamlanan: ${done}</div>
        <div class="stats-legend-item"><span class="stats-legend-dot" style="background:var(--surface3)"></span>Kalan: ${total - done}</div>
      </div>
    </div>

    <div class="stats-section-title">Kategoriye Göre</div>
    ${Object.entries(catLabels).map(([key, label]) => {
      const count = catCounts[key] || 0;
      const w = maxCat ? Math.round(count / maxCat * 100) : 0;
      return `<div class="stats-bar-row">
        <span class="stats-bar-label">${label}</span>
        <div class="stats-bar-wrap"><div class="stats-bar-fill" style="width:${w}%"></div></div>
        <span class="stats-bar-count">${count}</span>
      </div>`;
    }).join('')}

    <div class="stats-section-title">Önceliğe Göre</div>
    ${Object.entries(priLabels).map(([key, label]) => {
      const count = priCounts[key] || 0;
      const w = total ? Math.round(count / total * 100) : 0;
      return `<div class="stats-bar-row">
        <span class="stats-bar-label">${label}</span>
        <div class="stats-bar-wrap"><div class="stats-bar-fill" style="width:${w}%;background:${priColors[key]}"></div></div>
        <span class="stats-bar-count">${count}</span>
      </div>`;
    }).join('')}

    <button class="btn btn-save" style="width:100%;margin-top:20px" onclick="exportCSV()">
      CSV İndir
    </button>
  `;

  const ov = $('stats-overlay');
  ov.classList.remove('hidden');
  ov.classList.add('open');
}

// ---- Share ----
async function openShareModal() {
  if (!currentUser || !db) return;
  const ov = $('share-overlay');
  ov.classList.remove('hidden');
  ov.classList.add('open');
  $('share-link-input').value = 'Oluşturuluyor...';
  await createShareLink();
}

async function createShareLink() {
  const shareId = genId();
  const shareTasks = tasks.map(({ id, text, status, priority, category, deadline, tags, notes, subtasks }) =>
    ({ id, text, status, priority, category, deadline: deadline||null, tags: tags||[], notes: notes||'', subtasks: subtasks||[] }));
  await db.collection('shares').doc(shareId).set({
    ownerName: currentUser.displayName || currentUser.email || 'Kullanıcı',
    createdAt: new Date().toISOString(),
    tasks: shareTasks,
  });
  const url = `${location.origin}${location.pathname}?share=${shareId}`;
  $('share-link-input').value = url;
}

async function loadSharedList(shareId) {
  if (!db) return false;
  try {
    const doc = await db.collection('shares').doc(shareId).get();
    if (!doc.exists) return false;
    const data = doc.data();
    // Show read-only shared view
    document.title = `${data.ownerName} — Yapsak Bence`;
    tasks = migrate(data.tasks || []);
    // Hide add form, filters, bottom actions, toolbar buttons
    $('add-form').style.display = 'none';
    $('bottom-actions').style.display = 'none';
    $('select-btn').style.display = 'none';
    $('share-btn').style.display = 'none';
    // Show banner
    const banner = document.createElement('div');
    banner.className = 'share-banner';
    banner.textContent = `${data.ownerName} tarafından paylaşıldı — Salt Okunur`;
    document.querySelector('.app').prepend(banner);
    render();
    return true;
  } catch { return false; }
}

// ---- Bulk Select ----
function toggleSelectMode() {
  selectMode = !selectMode;
  selectedIds.clear();
  const btn = $('select-btn');
  btn.classList.toggle('active', selectMode);
  updateBulkBar();
  renderList();
}

function toggleSelectItem(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  updateBulkBar();
  renderList();
}

function updateBulkBar() {
  const bar = $('bulk-bar');
  if (!bar) return;
  const count = selectedIds.size;
  if (selectMode && count > 0) {
    bar.classList.add('show');
    $('bulk-count').textContent = count + ' seçildi';
  } else {
    bar.classList.remove('show');
  }
}

async function bulkComplete() {
  for (const id of selectedIds) {
    const t = tasks.find(t => t.id === id);
    if (t && !isDone(t)) {
      t.status = 'done';
      if (currentUser && db) await saveTaskToFirestore(t);
    }
  }
  if (!currentUser || !db) { saveLocalTasks(); render(); }
  selectedIds.clear();
  selectMode = false;
  $('select-btn').classList.remove('active');
  updateBulkBar();
}

async function bulkDelete() {
  for (const id of selectedIds) await deleteTask(id);
  selectedIds.clear();
  selectMode = false;
  $('select-btn').classList.remove('active');
  updateBulkBar();
}

// ---- CSV Export ----
function exportCSV() {
  const headers = ['Görev', 'Durum', 'Öncelik', 'Kategori', 'Son Tarih', 'Hatırlatıcı', 'Etiketler', 'Notlar', 'Oluşturulma'];
  const statusMap = { todo: 'Yapılacak', inprogress: 'Devam Ediyor', done: 'Tamamlandı' };
  const priMap    = { high: 'Yüksek', normal: 'Normal', low: 'Düşük' };
  const catMap    = { genel: 'Genel', is: 'İş', kisisel: 'Kişisel', alisveris: 'Alışveriş', saglik: 'Sağlık' };

  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const rows = tasks.map(t => [
    esc(t.text),
    esc(statusMap[t.status] || t.status),
    esc(priMap[t.priority] || t.priority),
    esc(catMap[t.category] || t.category),
    esc(t.deadline || ''),
    esc(t.reminder || ''),
    esc((t.tags || []).join(', ')),
    esc(t.notes || ''),
    esc(t.createdAt ? t.createdAt.slice(0, 10) : ''),
  ].join(','));

  const csv = '\uFEFF' + [headers.map(h => `"${h}"`).join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `yapsak-bence-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
  // Now handled via Settings > Bildirimler toggle
  openSettings();
}
function scheduleReminders() {
  if (!settings.notifications || !('Notification' in window) || Notification.permission !== 'granted') return;
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
  if (!settings.notifications || !('Notification' in window) || Notification.permission !== 'granted') return;
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
  if (!settings.notifications || !('Notification' in window) || Notification.permission !== 'granted') return;
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
  listView.classList.toggle('hidden',           v !== 'list');
  kanbanView.classList.toggle('hidden',         v !== 'kanban');
  $('calendar-view').classList.toggle('hidden', v !== 'calendar');
  $('filters').classList.toggle('hidden',       v !== 'list');
  if (v === 'calendar') renderCalendar();
  else render();
}

// ---- Calendar ----
let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth();
let calSelectedDate = null;

const TR_MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const TR_DAYS   = ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'];

// Returns all occurrence date strings of a recurring task within [fromIso, toIso]
function getRecurOccurrences(task, fromIso, toIso) {
  if (!task.recurType || task.recurType === 'none' || !task.deadline) return [];
  const from = new Date(fromIso + 'T00:00:00');
  const to   = new Date(toIso   + 'T23:59:59');
  const end  = task.recurEnd ? new Date(task.recurEnd + 'T23:59:59') : null;
  const results = [];
  let cur = new Date(task.deadline + 'T00:00:00');
  for (let i = 0; i < 200; i++) {
    if ((end && cur > end) || cur > to) break;
    if (cur >= from) results.push(cur.toISOString().slice(0, 10));
    if      (task.recurType === 'daily')   cur.setDate(cur.getDate() + 1);
    else if (task.recurType === 'weekly')  cur.setDate(cur.getDate() + 7);
    else if (task.recurType === 'monthly') cur.setMonth(cur.getMonth() + 1);
    else break;
  }
  return results;
}

function renderCalendar() {
  const grid  = $('cal-grid');
  const title = $('cal-title');
  if (!grid) return;
  title.textContent = `${TR_MONTHS[calMonth]} ${calYear}`;

  const firstDay = new Date(calYear, calMonth, 1);
  const lastDay  = new Date(calYear, calMonth + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // Mon=0

  const monthStart = `${calYear}-${String(calMonth+1).padStart(2,'0')}-01`;
  const monthEnd   = lastDay.toISOString().slice(0, 10);

  const tasksByDate = {};
  const addToDate = (ds, t) => {
    if (!tasksByDate[ds]) tasksByDate[ds] = [];
    tasksByDate[ds].push(t);
  };
  tasks.forEach(t => {
    if (!t.deadline) return;
    addToDate(t.deadline, t);
    if (t.recurType && t.recurType !== 'none') {
      getRecurOccurrences(t, monthStart, monthEnd).forEach(ds => {
        if (ds !== t.deadline) addToDate(ds, t); // current deadline already added
      });
    }
  });

  const todayIso = new Date().toISOString().slice(0, 10);
  const headers  = TR_DAYS.map(d => `<div class="cal-dow">${d}</div>`).join('');

  let cells = '';
  for (let i = 0; i < startDow; i++) cells += '<div class="cal-cell cal-cell-empty"></div>';
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const ds = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dt = tasksByDate[ds] || [];
    const isToday = ds === todayIso;
    const isSel   = ds === calSelectedDate;
    const dots    = dt.slice(0,4).map(t => {
      const c = t.priority==='high'?'#f87272':t.priority==='low'?'#60d999':'#7c6dfa';
      const isRecurOcc = t.recurType && t.recurType !== 'none' && t.deadline !== ds;
      const extra = isRecurOcc ? ' cal-dot-recur' : '';
      return `<span class="cal-dot${extra}" style="background:${c}" title="${t.text}${isRecurOcc?' (↻)':''}"></span>`;
    }).join('');
    cells += `<div class="cal-cell${isToday?' cal-today':''}${isSel?' cal-selected':''}" data-date="${ds}">
      <span class="cal-day-num">${d}</span>
      <div class="cal-dots">${dots}</div>
    </div>`;
  }

  grid.innerHTML = headers + cells;
  grid.querySelectorAll('.cal-cell[data-date]').forEach(el => {
    el.addEventListener('click', () => { calSelectedDate = el.dataset.date; renderCalendar(); renderCalDayTasks(); });
  });
  if (calSelectedDate) renderCalDayTasks();
}

function renderCalDayTasks() {
  const panel = $('cal-day-tasks');
  if (!calSelectedDate) { panel.innerHTML = ''; return; }
  const [y, m, d] = calSelectedDate.split('-');
  const label = `${parseInt(d)} ${TR_MONTHS[parseInt(m)-1]} ${y}`;
  const dayTasks = tasks.filter(t => {
    if (t.deadline === calSelectedDate) return true;
    if (t.recurType && t.recurType !== 'none')
      return getRecurOccurrences(t, calSelectedDate, calSelectedDate).length > 0;
    return false;
  });
  if (!dayTasks.length) { panel.innerHTML = `<p class="cal-day-empty">📅 ${label} — görev yok</p>`; return; }
  const items = dayTasks.map(t => {
    const c = t.priority==='high'?'#f87272':t.priority==='low'?'#60d999':'#7c6dfa';
    const isRecurOcc = t.recurType && t.recurType !== 'none' && t.deadline !== calSelectedDate;
    const recurBadge = isRecurOcc ? `<span class="cal-recur-badge">↻</span>` : '';
    return `<div class="cal-task-item${isDone(t)?' cal-task-done':''}" data-id="${t.id}">
      <span class="cal-task-dot" style="background:${c}"></span>
      <span class="cal-task-text">${t.text}</span>${recurBadge}
    </div>`;
  }).join('');
  panel.innerHTML = `<div class="cal-day-header">📅 ${label}</div>${items}`;
  panel.querySelectorAll('.cal-task-item').forEach(el => el.addEventListener('click', () => openModal(el.dataset.id)));
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
  if (currentUser && currentUser.photoURL) {
    userBtn.innerHTML = `<img src="${currentUser.photoURL}" class="user-avatar" alt="profil" referrerpolicy="no-referrer" />`;
  }
  if (currentUser && db) $('share-btn').style.display = '';
  loadXP();
  loadXPFirestore();
  loadStreak();
  loadStreakFirestore();
  loadLists();
  loadListsFirestore();
  initDailyQuote();
  renderListChips();
  renderListOptions();
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
  loadXP();
  loadStreak();
  loadLists();
  initDailyQuote();
  renderListChips();
  renderListOptions();
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
notifBtn.addEventListener('click', openSettings);
$('stats-btn').addEventListener('click', openStats);
$('share-btn').addEventListener('click', openShareModal);
$('share-close').addEventListener('click', () => { $('share-overlay').classList.add('hidden'); $('share-overlay').classList.remove('open'); });
$('share-overlay').addEventListener('click', e => { if (e.target === $('share-overlay')) { $('share-overlay').classList.add('hidden'); $('share-overlay').classList.remove('open'); } });
$('share-copy-btn').addEventListener('click', () => {
  const input = $('share-link-input');
  navigator.clipboard.writeText(input.value).then(() => {
    const msg = $('share-copied-msg');
    msg.style.display = '';
    setTimeout(() => msg.style.display = 'none', 2000);
  });
});
$('share-new-btn').addEventListener('click', createShareLink);
$('select-btn').addEventListener('click', toggleSelectMode);
$('bulk-complete-btn').addEventListener('click', bulkComplete);
$('bulk-delete-btn').addEventListener('click', bulkDelete);
$('bulk-cancel-btn').addEventListener('click', () => { selectMode = false; selectedIds.clear(); $('select-btn').classList.remove('active'); updateBulkBar(); renderList(); });
$('stats-close').addEventListener('click', () => { $('stats-overlay').classList.add('hidden'); $('stats-overlay').classList.remove('open'); });
$('stats-overlay').addEventListener('click', e => { if (e.target === $('stats-overlay')) { $('stats-overlay').classList.add('hidden'); $('stats-overlay').classList.remove('open'); } });

// Show/hide recur end date when recurType changes
$('modal-recur-type').addEventListener('change', e => {
  $('modal-recur-end-wrap').style.display = e.target.value === 'none' ? 'none' : '';
});
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

// ---- Streak ----
let streakData = { streak: 0, maxStreak: 0, lastDate: null };

function todayStr() { return new Date().toDateString(); }
function yesterdayStr() {
  const d = new Date(); d.setDate(d.getDate() - 1); return d.toDateString();
}

function loadStreak() {
  try {
    const saved = JSON.parse(localStorage.getItem(STREAK_KEY));
    if (saved) streakData = { ...streakData, ...saved };
  } catch {}
  // If last activity was before yesterday, reset streak
  if (streakData.lastDate && streakData.lastDate !== todayStr() && streakData.lastDate !== yesterdayStr()) {
    streakData.streak = 0;
    saveStreakLocal();
  }
  renderStreak();
}

function saveStreakLocal() {
  localStorage.setItem(STREAK_KEY, JSON.stringify(streakData));
}

async function saveStreakFirestore() {
  if (!currentUser || !db) return;
  try {
    await db.collection('users').doc(currentUser.uid).set({ streak: streakData }, { merge: true });
  } catch {}
}

async function loadStreakFirestore() {
  if (!currentUser || !db) return;
  try {
    const doc = await db.collection('users').doc(currentUser.uid).get();
    if (doc.exists && doc.data().streak) {
      streakData = { ...streakData, ...doc.data().streak };
      saveStreakLocal();
      renderStreak();
    }
  } catch {}
}

async function recordTaskDone() {
  const today = todayStr();
  if (streakData.lastDate === today) return; // already counted today
  const wasYesterday = streakData.lastDate === yesterdayStr();
  streakData.streak = wasYesterday ? streakData.streak + 1 : 1;
  streakData.maxStreak = Math.max(streakData.streak, streakData.maxStreak);
  streakData.lastDate = today;
  saveStreakLocal();
  await saveStreakFirestore();
  renderStreak();
  checkStreakMilestone(streakData.streak);
}

function renderStreak() {
  const pill = $('streak-pill');
  if (!pill) return;
  const s = streakData.streak;
  pill.style.display = s > 0 ? '' : 'none';
  pill.innerHTML = `🔥 <b>${s}</b> gün seri`;
  pill.title = `En uzun seri: ${streakData.maxStreak} gün`;
}

function checkStreakMilestone(streak) {
  const milestones = { 3: '3 günlük seri!', 7: 'Bir hafta seri!', 14: 'İki hafta seri!', 30: 'Bir ay seri! Efsanesin!' };
  if (milestones[streak]) {
    const toast = document.createElement('div');
    toast.className = 'xp-toast xp-toast-levelup';
    toast.textContent = `🔥 ${milestones[streak]}`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); }, 3000);
  }
}

// ---- Daily Quote ----
const QUOTES = [
  "Büyük işler, küçük adımlarla başlar.",
  "Bugün yapabileceğini yarına bırakma.",
  "Başarı, her gün tekrarlanan küçük çabaların toplamıdır.",
  "Bir görevi tamamlamak, onu mükemmel yapmaktan daha iyidir.",
  "Disiplin, motivasyon olmadığında devreye girer.",
  "Hedefe giden yol, tek tek atılan adımlardan oluşur.",
  "Harekete geçmek, mükemmel planı beklemekten üstündür.",
  "Her başarı, bir kararla başlar.",
  "Kendin için yaptıkların seni en ileri götürür.",
  "Güçlü olmak zorunda değilsin, sadece pes etme.",
  "Zor zamanlar geçer, güçlü insanlar kalır.",
  "Bugünkü emek, yarınki başarıdır.",
  "Bir sonraki adım her zaman en önemli olanıdır.",
  "Başarı şansa değil, kararlılığa bağlıdır.",
  "En uzun yolculuk bile tek bir adımla başlar.",
  "Küçük ilerlemeler de ilerlemedir.",
  "Vazgeçmek, başarısızlığın tek garantili yoludur.",
  "İmkânsız gibi görünen şeyler, sadece henüz yapılmamış olanlardır.",
  "Odaklan, çalış, kazan.",
  "Her yeni gün, yeni bir fırsat sunar.",
  "Başarılar hedeflenmez, kazanılır.",
  "En iyi zaman şimdi; ikinci en iyi zaman da yine şimdi.",
  "Yapabilirsin, sadece başla.",
  "Düşünceler hayata dönüşür — doğru düşün.",
  "Süreklilik, yeteneği bile geçer.",
  "Bir görev tamamlanmadan diğerine geçme.",
  "Küçük kazanımları kutla, büyük hedeflere odaklan.",
  "Bugün sıkı çalış, yarın sonuçlarını gör.",
  "Mükemmeli beklerken iyiyi kaçırma.",
  "Başarı, vazgeçmeyenlerin ödülüdür.",
];

function initDailyQuote() {
  const today = new Date().toDateString();
  if (sessionStorage.getItem('yapsak-quote-dismissed') === today) {
    $('daily-quote').style.display = 'none'; return;
  }
  const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  $('daily-quote-text').textContent = QUOTES[dayOfYear % QUOTES.length];
  $('daily-quote-close').addEventListener('click', () => {
    const el = $('daily-quote');
    el.classList.add('closing');
    setTimeout(() => { el.style.display = 'none'; }, 300);
    sessionStorage.setItem('yapsak-quote-dismissed', today);
  });
}

// ---- Init ----
loadTheme();
loadSettings();
initSW();

// ---- Pomodoro ----
const POMO_DURATIONS = {
  get work()  { return (settings.pomoWork  || 25) * 60; },
  get short() { return (settings.pomoShort || 5)  * 60; },
  get long()  { return (settings.pomoLong  || 15) * 60; },
};
let pomoMode        = 'work';
let pomoSecondsLeft = POMO_DURATIONS.work;
let pomoRunning     = false;
let pomoInterval    = null;
let pomoSessions    = parseInt(localStorage.getItem('yapsak-pomo-sessions') || '0');

function pomoFmt(s) { return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }

function pomoUpdateRing() {
  const pct = pomoSecondsLeft / POMO_DURATIONS[pomoMode];
  const circ = 2 * Math.PI * 50;
  const fill = $('pomo-ring-fill');
  if (fill) { fill.style.strokeDasharray = circ; fill.style.strokeDashoffset = circ * (1 - pct); }
  const t = $('pomo-time'); if (t) t.textContent = pomoFmt(pomoSecondsLeft);
}

function pomoTick() {
  if (pomoSecondsLeft <= 0) {
    clearInterval(pomoInterval); pomoRunning = false;
    $('pomo-start').textContent = 'Başlat';
    if (pomoMode === 'work') {
      pomoSessions++;
      localStorage.setItem('yapsak-pomo-sessions', pomoSessions);
      const sc = $('pomo-session-count'); if (sc) sc.textContent = pomoSessions;
    }
    playPomodoroEnd();
    document.title = 'Yapsak Bence';
    if ('Notification' in window && Notification.permission === 'granted') {
      const msg = { work: 'Mola zamanı! 🎉', short: 'Kısa mola bitti, devam!', long: 'Uzun mola bitti!' };
      new Notification('Yapsak Bence — Pomodoro', { body: msg[pomoMode], icon: 'icon.svg' });
    }
    return;
  }
  pomoSecondsLeft--;
  pomoUpdateRing();
  document.title = `${pomoFmt(pomoSecondsLeft)} — Yapsak Bence`;
}

function pomoStart() {
  if (pomoRunning) {
    clearInterval(pomoInterval); pomoRunning = false;
    $('pomo-start').textContent = 'Devam'; document.title = 'Yapsak Bence'; return;
  }
  pomoRunning = true;
  $('pomo-start').textContent = 'Duraklat';
  pomoInterval = setInterval(pomoTick, 1000);
}

function pomoReset() {
  clearInterval(pomoInterval); pomoRunning = false;
  pomoSecondsLeft = POMO_DURATIONS[pomoMode];
  $('pomo-start').textContent = 'Başlat';
  document.title = 'Yapsak Bence';
  pomoUpdateRing();
}

function pomoSetMode(mode) {
  clearInterval(pomoInterval); pomoRunning = false;
  pomoMode = mode; pomoSecondsLeft = POMO_DURATIONS[mode];
  $('pomo-start').textContent = 'Başlat';
  document.title = 'Yapsak Bence';
  document.querySelectorAll('.pomo-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  pomoUpdateRing();
}

function playPomodoroEnd() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [440, 550, 660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine'; osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.start(t); osc.stop(t + 0.4);
    });
  } catch {}
}

$('pomo-fab').addEventListener('click', () => {
  $('pomo-widget').classList.toggle('hidden');
  if (!$('pomo-widget').classList.contains('hidden')) {
    const sc = $('pomo-session-count'); if (sc) sc.textContent = pomoSessions;
    pomoUpdateRing();
  }
});
$('pomo-close').addEventListener('click', () => $('pomo-widget').classList.add('hidden'));
$('pomo-start').addEventListener('click', pomoStart);
$('pomo-reset').addEventListener('click', pomoReset);
document.querySelectorAll('.pomo-mode-btn').forEach(b => b.addEventListener('click', () => pomoSetMode(b.dataset.mode)));

// Calendar navigation
$('cal-prev').addEventListener('click', () => {
  calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar();
});
$('cal-next').addEventListener('click', () => {
  calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
});

// Settings events
$('settings-btn').addEventListener('click', openSettings);
$('settings-close').addEventListener('click', closeSettings);
$('settings-drawer').addEventListener('click', e => { if (e.target === $('settings-drawer')) closeSettings(); });

['stg-sound','stg-confetti','stg-hidedone','stg-compact'].forEach(id => {
  $(id).addEventListener('change', e => {
    const key = { 'stg-sound': 'sound', 'stg-confetti': 'confetti', 'stg-hidedone': 'hideDone', 'stg-compact': 'compactMode' }[id];
    settings[key] = e.target.checked;
    saveSettings();
  });
});
['stg-sort','stg-priority','stg-category','stg-language'].forEach(id => {
  $(id).addEventListener('change', e => {
    const key = { 'stg-sort': 'sortOrder', 'stg-priority': 'defaultPriority', 'stg-category': 'defaultCategory', 'stg-language': 'language' }[id];
    settings[key] = e.target.value;
    saveSettings();
  });
});
['stg-pomo-work','stg-pomo-short','stg-pomo-long'].forEach(id => {
  $(id).addEventListener('change', e => {
    const key = { 'stg-pomo-work': 'pomoWork', 'stg-pomo-short': 'pomoShort', 'stg-pomo-long': 'pomoLong' }[id];
    const val = parseInt(e.target.value);
    if (val > 0) { settings[key] = val; saveSettings(); }
  });
});
$('stg-notif').addEventListener('change', e => {
  settings.notifications = e.target.checked;
  if (e.target.checked && 'Notification' in window) {
    Notification.requestPermission().then(p => {
      if (p !== 'granted') { settings.notifications = false; setToggle('stg-notif', false); }
      saveSettings();
    });
  } else {
    saveSettings();
  }
});
// Accent color swatches
document.querySelectorAll('.accent-swatch').forEach(s => {
  s.addEventListener('click', () => {
    settings.accentColor = s.dataset.color;
    saveSettings();
    openSettings(); // refresh active swatch state
  });
});

if ('Notification' in window && Notification.permission === 'granted') {
  notifBtn.style.color = 'var(--low)';
}

// ---- Sidebar (Lists) Event Listeners ----
$('menu-btn').addEventListener('click', openMenu);
$('sidebar-close').addEventListener('click', closeMenu);
$('sidebar-backdrop').addEventListener('click', e => { if (e.target === $('sidebar-backdrop')) closeMenu(); });

// ---- Create List Event Listeners ----
$('create-list-cancel').addEventListener('click', closeCreateList);
$('create-list-close').addEventListener('click', closeCreateList);
$('create-list-overlay').addEventListener('click', e => { if (e.target === $('create-list-overlay')) closeCreateList(); });
$('create-list-confirm').addEventListener('click', () => {
  const name = $('new-list-name').value.trim();
  if (!name) { $('new-list-name').focus(); return; }
  createList(name, createListEmoji);
  closeCreateList();
});
$('new-list-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('create-list-confirm').click();
  if (e.key === 'Escape') closeCreateList();
});

// Check for shared list URL
const shareParam = new URLSearchParams(location.search).get('share');

const fbReady = initFirebase();

if (fbReady && shareParam) {
  // Shared list view — no auth needed
  loadSharedList(shareParam).then(ok => {
    if (!ok) { document.body.innerHTML = '<p style="padding:2rem;color:#888">Paylaşılan liste bulunamadı.</p>'; }
    else hideLoading();
  });
} else if (fbReady) {
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
