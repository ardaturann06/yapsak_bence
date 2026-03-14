const STORAGE_KEY = 'yapsak-bence-tasks';

let tasks = loadTasks();
let currentFilter = 'all';

const form = document.getElementById('add-form');
const input = document.getElementById('task-input');
const prioritySelect = document.getElementById('priority-select');
const categorySelect = document.getElementById('category-select');
const taskList = document.getElementById('task-list');
const emptyState = document.getElementById('empty-state');
const bottomActions = document.getElementById('bottom-actions');
const statsText = document.getElementById('stats-text');
const filterBtns = document.querySelectorAll('.filter-btn');
const clearDoneBtn = document.getElementById('clear-done');

function loadTasks() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

function getFilteredTasks() {
  if (currentFilter === 'active') return tasks.filter(t => !t.done);
  if (currentFilter === 'done') return tasks.filter(t => t.done);
  return tasks;
}

function render() {
  const filtered = getFilteredTasks();
  taskList.innerHTML = '';

  if (filtered.length === 0) {
    emptyState.style.display = 'flex';
  } else {
    emptyState.style.display = 'none';
    filtered.forEach(task => {
      taskList.appendChild(createTaskEl(task));
    });
  }

  const hasDone = tasks.some(t => t.done);
  bottomActions.style.display = hasDone ? 'flex' : 'none';

  const total = tasks.length;
  const done = tasks.filter(t => t.done).length;
  statsText.textContent = total === 0
    ? '0 görev'
    : `${done}/${total} tamamlandı`;
}

function createTaskEl(task) {
  const li = document.createElement('li');
  li.className = 'task-item' + (task.done ? ' done' : '');
  li.dataset.id = task.id;
  li.dataset.priority = task.priority;

  const checkDiv = document.createElement('div');
  checkDiv.className = 'task-check' + (task.done ? ' checked' : '');
  checkDiv.setAttribute('role', 'checkbox');
  checkDiv.setAttribute('aria-checked', task.done);
  checkDiv.addEventListener('click', () => toggleTask(task.id));

  const content = document.createElement('div');
  content.className = 'task-content';

  const textSpan = document.createElement('span');
  textSpan.className = 'task-text';
  textSpan.textContent = task.text;

  const meta = document.createElement('div');
  meta.className = 'task-meta';

  const catTag = document.createElement('span');
  catTag.className = 'tag tag-category';
  catTag.textContent = task.category;

  const priTag = document.createElement('span');
  priTag.className = `tag tag-priority-${task.priority}`;
  priTag.textContent = task.priority === 'high' ? 'Yüksek' : task.priority === 'low' ? 'Düşük' : '';

  const dateSpan = document.createElement('span');
  dateSpan.className = 'task-date';
  dateSpan.textContent = formatDate(task.createdAt);

  meta.append(catTag, priTag, dateSpan);
  content.append(textSpan, meta);

  const delBtn = document.createElement('button');
  delBtn.className = 'task-delete';
  delBtn.innerHTML = '&times;';
  delBtn.setAttribute('aria-label', 'Görevi sil');
  delBtn.addEventListener('click', () => deleteTask(task.id));

  li.append(checkDiv, content, delBtn);
  return li;
}

function addTask(text, priority, category) {
  const task = {
    id: Date.now().toString(),
    text: text.trim(),
    priority,
    category,
    done: false,
    createdAt: new Date().toISOString(),
  };
  tasks.unshift(task);
  saveTasks();
  render();
}

function toggleTask(id) {
  const task = tasks.find(t => t.id === id);
  if (task) {
    task.done = !task.done;
    saveTasks();
    render();
  }
}

function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  saveTasks();
  render();
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) {
    input.focus();
    input.classList.add('shake');
    setTimeout(() => input.classList.remove('shake'), 300);
    return;
  }
  addTask(text, prioritySelect.value, categorySelect.value);
  input.value = '';
  input.focus();
});

filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    render();
  });
});

clearDoneBtn.addEventListener('click', () => {
  tasks = tasks.filter(t => !t.done);
  saveTasks();
  render();
});

// Shake animation
const style = document.createElement('style');
style.textContent = `
  @keyframes shake {
    0%,100%{transform:translateX(0)}
    25%{transform:translateX(-6px)}
    75%{transform:translateX(6px)}
  }
  .shake { animation: shake 0.25s ease; border-color: #f87272 !important; }
`;
document.head.appendChild(style);

render();
