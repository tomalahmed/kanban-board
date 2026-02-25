const STORAGE_KEY = 'flowboard_tasks_v2';
const SYNC_CHANNEL = 'flowboard_sync';

const DEFAULT_TASKS = [
    {
        id: '1',
        title: 'Plan sprint backlog',
        description: 'Review carry-over work and prioritize sprint items.',
        column: 'todo',
        priority: 'high',
        labels: ['Meeting'],
        dueDate: '2026-02-26',
        progress: null,
        completedDate: null,
    },
    {
        id: '2',
        title: 'Design onboarding flow',
        description: 'Create first-pass UX for sign-up and welcome states.',
        column: 'todo',
        priority: 'medium',
        labels: ['Design'],
        dueDate: '2026-02-28',
        progress: 10,
        completedDate: null,
    },
    {
        id: '3',
        title: 'Implement auth endpoints',
        description: 'Token refresh and session revocation API work.',
        column: 'inprogress',
        priority: 'high',
        labels: ['Development'],
        dueDate: '2026-02-27',
        progress: 60,
        completedDate: null,
    },
    {
        id: '4',
        title: 'SEO metadata audit',
        description: 'Validate titles, descriptions, and OG tags.',
        column: 'inprogress',
        priority: 'low',
        labels: ['SEO', 'Documentation'],
        dueDate: null,
        progress: 40,
        completedDate: null,
    },
    {
        id: '5',
        title: 'Launch readiness checklist',
        description: 'Checklist approved by engineering and product.',
        column: 'done',
        priority: 'medium',
        labels: ['Documentation'],
        dueDate: null,
        progress: 100,
        completedDate: 'Feb 23',
    },
];

const ALL_LABELS = ['Design', 'Development', 'Documentation', 'Meeting', 'Research', 'SEO'];

const LABEL_STYLES = {
    Design: 'bg-fuchsia-400/15 text-fuchsia-200 border border-fuchsia-300/30',
    Development: 'bg-cyan-400/15 text-cyan-200 border border-cyan-300/30',
    Documentation: 'bg-blue-400/15 text-blue-200 border border-blue-300/30',
    Meeting: 'bg-emerald-400/15 text-emerald-200 border border-emerald-300/30',
    Research: 'bg-amber-400/15 text-amber-200 border border-amber-300/30',
    SEO: 'bg-orange-400/15 text-orange-200 border border-orange-300/30',
};

const PRIORITY_BORDER = {
    high: 'border-l-red-400',
    medium: 'border-l-amber-300',
    low: 'border-l-emerald-400',
};

const PRIORITY_BADGE = {
    high: 'bg-red-400/15 text-red-200 border border-red-300/30',
    medium: 'bg-amber-300/15 text-amber-100 border border-amber-200/30',
    low: 'bg-emerald-400/15 text-emerald-200 border border-emerald-300/30',
};

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
const PRIORITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' };
const COLUMN_LABELS = { todo: 'To Do', inprogress: 'In Progress', done: 'Done' };

let tasks = [];
let activeFilters = { priority: null, label: null };
let searchQuery = '';
let editingTaskId = null;
let pendingDeleteId = null;
let dragSrcId = null;
let lastUpdated = new Date();
let toastTimer = null;
let syncChannel = null;
let isApplyingRemote = false;
let syncStatusTimer = null;

const tabId = (globalThis.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function escapeHtml(value) {
    if (!value) return '';
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalize(value) {
    return (value || '').toString().trim().toLowerCase();
}

function cloneDefaultTasks() {
    return DEFAULT_TASKS.map((task) => ({
        ...task,
        labels: [...(task.labels || [])],
    }));
}

function sanitizeTask(task, index = 0) {
    if (!task || typeof task !== 'object') return null;

    const safeColumn = ['todo', 'inprogress', 'done'].includes(task.column) ? task.column : 'todo';
    const safePriority = ['high', 'medium', 'low'].includes(task.priority) ? task.priority : 'medium';
    const safeLabels = Array.isArray(task.labels)
        ? task.labels.filter((label) => ALL_LABELS.includes(label))
        : [];

    const rawTitle = (task.title || '').toString().trim();
    const safeTitle = rawTitle || `Untitled task ${index + 1}`;

    const rawProgress = task.progress;
    const safeProgress = rawProgress === null || rawProgress === undefined || rawProgress === ''
        ? null
        : Math.max(0, Math.min(100, parseInt(rawProgress, 10) || 0));

    return {
        id: (task.id ?? `${Date.now()}-${index}`).toString(),
        title: safeTitle,
        description: (task.description || '').toString(),
        column: safeColumn,
        priority: safePriority,
        labels: safeLabels,
        dueDate: task.dueDate ? task.dueDate.toString() : null,
        progress: safeProgress,
        completedDate: task.completedDate ? task.completedDate.toString() : null,
    };
}

function loadTasks() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            tasks = cloneDefaultTasks();
            return;
        }

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            tasks = cloneDefaultTasks();
            return;
        }

        const normalized = parsed.map((task, index) => sanitizeTask(task, index)).filter(Boolean);
        tasks = normalized.length ? normalized : cloneDefaultTasks();
    } catch (err) {
        tasks = cloneDefaultTasks();
    }
}

function saveTasks(options = { broadcast: true }) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    lastUpdated = new Date();
    updateLastUpdatedText();

    if (options.broadcast && syncChannel) {
        syncChannel.postMessage({
            type: 'tasks-updated',
            source: tabId,
            at: Date.now(),
        });
    }

    setSyncStatus('Synced');
}

function updateLastUpdatedText() {
    const el = document.getElementById('last-updated');
    if (!el) return;

    const diff = Math.floor((new Date() - lastUpdated) / 1000);
    if (diff < 10) el.textContent = 'just now';
    else if (diff < 60) el.textContent = `${diff}s ago`;
    else if (diff < 3600) {
        const m = Math.floor(diff / 60);
        el.textContent = `${m} min${m > 1 ? 's' : ''} ago`;
    } else {
        const h = Math.floor(diff / 3600);
        el.textContent = `${h} hr${h > 1 ? 's' : ''} ago`;
    }
}

function setSyncStatus(label) {
    const el = document.getElementById('sync-status');
    if (!el) return;
    el.textContent = label;
    if (syncStatusTimer) clearTimeout(syncStatusTimer);
    syncStatusTimer = setTimeout(() => {
        el.textContent = 'Live sync enabled';
    }, 2500);
}

function countActiveFilters() {
    return (activeFilters.priority ? 1 : 0) + (activeFilters.label ? 1 : 0);
}

function matchesSearch(task) {
    if (!searchQuery) return true;
    const query = normalize(searchQuery);
    const labels = (task.labels || []).map(normalize).join(' ');
    return normalize(task.title).includes(query)
        || normalize(task.description).includes(query)
        || labels.includes(query)
        || normalize(task.priority).includes(query);
}

function getFilteredTasks(column) {
    return tasks.filter((task) => {
        if (task.column !== column) return false;
        if (activeFilters.priority && task.priority !== activeFilters.priority) return false;
        if (activeFilters.label && !(task.labels || []).includes(activeFilters.label)) return false;
        if (!matchesSearch(task)) return false;
        return true;
    });
}

function sortTasksForColumn(columnTasks, column) {
    return [...columnTasks].sort((a, b) => {
        const pDiff = (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3);
        if (pDiff !== 0) return pDiff;

        const aDate = a.dueDate ? new Date(`${a.dueDate}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
        const bDate = b.dueDate ? new Date(`${b.dueDate}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
        if (column !== 'done' && aDate !== bDate) return aDate - bDate;

        return a.title.localeCompare(b.title);
    });
}

function updateStats() {
    const total = tasks.length;
    const inProgress = tasks.filter((t) => t.column === 'inprogress').length;
    const done = tasks.filter((t) => t.column === 'done').length;
    const pct = total ? Math.round((done / total) * 100) : 0;

    document.getElementById('stat-total').textContent = `${total}`;
    document.getElementById('stat-inprogress').textContent = `${inProgress}`;
    document.getElementById('stat-done').textContent = `${done}`;
    document.getElementById('stat-progress').textContent = `${pct}%`;
    document.getElementById('header-task-count').textContent = `${total} task${total === 1 ? '' : 's'} across 3 columns`;

    ['todo', 'inprogress', 'done'].forEach((col) => {
        const count = tasks.filter((t) => t.column === col).length;
        const counter = document.getElementById(`count-${col}`);
        if (counter) counter.textContent = `${count}`;
    });
}

function renderAll() {
    ['todo', 'inprogress', 'done'].forEach(renderColumn);
    updateStats();
    updateFilterBadge();
}

function renderColumn(column) {
    const container = document.getElementById(`drop-${column}`);
    if (!container) return;

    container.innerHTML = '';
    const records = sortTasksForColumn(getFilteredTasks(column), column);

    if (!records.length) {
        const hasFilters = Boolean(searchQuery) || countActiveFilters() > 0;
        container.innerHTML = `<div class="drop-placeholder">${hasFilters ? 'No tasks match current filters' : 'Drop tasks here'}</div>`;
        return;
    }

    records.forEach((task, index) => {
        const card = createTaskCard(task);
        card.style.animationDelay = `${Math.min(index * 25, 160)}ms`;
        container.appendChild(card);
    });
}

function createTaskCard(task) {
    const done = task.column === 'done';
    const card = document.createElement('div');
    card.className = `task-card border-l-4 ${PRIORITY_BORDER[task.priority] || 'border-l-cyan-300'}`;
    card.setAttribute('draggable', 'true');
    card.dataset.taskId = task.id;

    let dueHtml = '';
    if (task.dueDate) {
        const due = new Date(`${task.dueDate}T00:00:00`);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const overdue = !done && due < today;
        const fmt = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        dueHtml = `<span class="text-xs ${overdue ? 'text-red-300' : 'text-slate-400'}">${fmt}${overdue ? ' • overdue' : ''}</span>`;
    } else if (done && task.completedDate) {
        dueHtml = `<span class="text-xs text-emerald-300">Completed ${escapeHtml(task.completedDate)}</span>`;
    }

    let progressHtml = '';
    if (task.progress !== null && task.progress !== undefined && task.progress !== '') {
        const pct = Math.max(0, Math.min(100, parseInt(task.progress, 10) || 0));
        progressHtml = `
            <div class="mb-3">
                <div class="mb-1 flex items-center justify-between text-[11px] text-slate-400">
                    <span>Progress</span>
                    <span class="font-semibold text-slate-200">${pct}%</span>
                </div>
                <div class="h-2 w-full rounded-full bg-slate-700">
                    <div class="h-2 rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300" style="width:${pct}%"></div>
                </div>
            </div>
        `;
    }

    const labelsHtml = (task.labels || []).map((label) => {
        const style = LABEL_STYLES[label] || 'bg-slate-400/15 text-slate-200 border border-slate-300/20';
        return `<span class="rounded-md px-2 py-1 text-[11px] font-bold ${style}">${escapeHtml(label)}</span>`;
    }).join('');

    card.innerHTML = `
        <div class="mb-2 flex items-start justify-between gap-2">
            <h3 class="text-sm font-bold ${done ? 'text-emerald-100' : 'text-slate-50'}">${escapeHtml(task.title)}</h3>
            <button class="task-menu-btn rounded-md p-1.5 text-slate-400 transition hover:bg-white/8 hover:text-white" data-task-id="${task.id}" title="Edit task">
                <i class="fa-solid fa-pen"></i>
            </button>
        </div>
        ${task.description ? `<p class="mb-3 text-xs text-slate-300">${escapeHtml(task.description)}</p>` : ''}
        ${progressHtml}
        <div class="mb-3 flex flex-wrap gap-1.5">
            ${labelsHtml}
            <span class="rounded-md px-2 py-1 text-[11px] font-bold ${PRIORITY_BADGE[task.priority] || PRIORITY_BADGE.medium}">
                ${PRIORITY_LABEL[task.priority] || 'Medium'}
            </span>
        </div>
        <div class="flex items-center justify-between gap-2">
            ${dueHtml || '<span class="text-xs text-slate-500">No due date</span>'}
            <span class="text-xs text-slate-500"><i class="fa-solid fa-grip-vertical"></i></span>
        </div>
    `;

    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);
    card.addEventListener('click', (event) => {
        if (event.target.closest('.task-menu-btn')) return;
        openEditModal(task.id);
    });

    const menuButton = card.querySelector('.task-menu-btn');
    if (menuButton) {
        menuButton.addEventListener('click', (event) => {
            event.stopPropagation();
            openEditModal(task.id);
        });
    }

    return card;
}

function handleDragStart(event) {
    dragSrcId = event.currentTarget.dataset.taskId;
    event.currentTarget.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', dragSrcId);
}

function handleDragEnd(event) {
    event.currentTarget.classList.remove('dragging');
    document.querySelectorAll('.drop-zone').forEach((zone) => zone.classList.remove('drag-over'));
}

function setupDropZones() {
    document.querySelectorAll('.drop-zone').forEach((zone) => {
        zone.addEventListener('dragover', (event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            zone.classList.add('drag-over');
        });

        zone.addEventListener('dragleave', (event) => {
            if (!zone.contains(event.relatedTarget)) zone.classList.remove('drag-over');
        });

        zone.addEventListener('drop', (event) => {
            event.preventDefault();
            zone.classList.remove('drag-over');

            if (!dragSrcId) return;
            const targetColumn = zone.dataset.column;
            const task = tasks.find((item) => item.id === dragSrcId);
            if (!task || !targetColumn || task.column === targetColumn) return;

            task.column = targetColumn;
            if (targetColumn === 'done') {
                if (!task.completedDate) {
                    task.completedDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                }
                task.progress = 100;
            } else {
                task.completedDate = null;
                if (task.progress === 100) task.progress = null;
            }

            saveTasks();
            renderAll();
            showToast(`Moved to ${COLUMN_LABELS[targetColumn]}`, 'success');
            dragSrcId = null;
        });
    });
}

function buildLabelCheckboxes(selectedLabels) {
    const host = document.getElementById('label-checkboxes');
    host.innerHTML = ALL_LABELS.map((label) => {
        const checked = selectedLabels.includes(label) ? 'checked' : '';
        const style = LABEL_STYLES[label] || 'bg-slate-400/20 text-slate-200 border border-slate-300/20';
        return `
            <label class="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-2 py-1.5 text-xs">
                <input type="checkbox" value="${label}" ${checked} class="label-checkbox h-4 w-4 accent-cyan-300">
                <span class="rounded px-1.5 py-0.5 font-bold ${style}">${label}</span>
            </label>
        `;
    }).join('');
}

function openAddModal(column = 'todo') {
    editingTaskId = null;
    document.getElementById('modal-title').textContent = 'New Task';
    document.getElementById('modal-task-title').value = '';
    document.getElementById('modal-task-desc').value = '';
    document.getElementById('modal-task-column').value = column;
    document.getElementById('modal-task-priority').value = 'medium';
    document.getElementById('modal-task-duedate').value = '';
    document.getElementById('modal-task-progress').value = '';
    document.getElementById('title-error').classList.add('hidden');
    document.getElementById('delete-task-btn').classList.add('hidden');

    buildLabelCheckboxes([]);
    showModal('task-modal');
    setTimeout(() => document.getElementById('modal-task-title').focus(), 80);
}

function openEditModal(taskId) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;

    editingTaskId = taskId;
    document.getElementById('modal-title').textContent = 'Edit Task';
    document.getElementById('modal-task-title').value = task.title;
    document.getElementById('modal-task-desc').value = task.description || '';
    document.getElementById('modal-task-column').value = task.column;
    document.getElementById('modal-task-priority').value = task.priority;
    document.getElementById('modal-task-duedate').value = task.dueDate || '';
    document.getElementById('modal-task-progress').value = task.progress ?? '';
    document.getElementById('title-error').classList.add('hidden');
    document.getElementById('delete-task-btn').classList.remove('hidden');

    buildLabelCheckboxes(task.labels || []);
    showModal('task-modal');
}

function saveTask() {
    const titleInput = document.getElementById('modal-task-title');
    const title = titleInput.value.trim();

    if (!title) {
        document.getElementById('title-error').classList.remove('hidden');
        titleInput.focus();
        return;
    }

    document.getElementById('title-error').classList.add('hidden');

    const payload = {
        title,
        description: document.getElementById('modal-task-desc').value.trim(),
        column: document.getElementById('modal-task-column').value,
        priority: document.getElementById('modal-task-priority').value,
        dueDate: document.getElementById('modal-task-duedate').value || null,
        progress: (() => {
            const raw = document.getElementById('modal-task-progress').value;
            if (raw === '') return null;
            return Math.max(0, Math.min(100, parseInt(raw, 10) || 0));
        })(),
        labels: Array.from(document.querySelectorAll('.label-checkbox:checked')).map((el) => el.value),
    };

    if (editingTaskId) {
        const task = tasks.find((item) => item.id === editingTaskId);
        if (!task) return;

        task.title = payload.title;
        task.description = payload.description;
        task.column = payload.column;
        task.priority = payload.priority;
        task.dueDate = payload.dueDate;
        task.progress = payload.progress;
        task.labels = payload.labels;

        if (task.column === 'done') {
            if (!task.completedDate) {
                task.completedDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }
            task.progress = 100;
        } else {
            task.completedDate = null;
            if (task.progress === 100) task.progress = null;
        }

        showToast('Task updated', 'success');
    } else {
        tasks.push({
            id: Date.now().toString(),
            ...payload,
            completedDate: payload.column === 'done'
                ? new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : null,
        });

        if (payload.column === 'done') {
            tasks[tasks.length - 1].progress = 100;
        }

        showToast('Task created', 'success');
    }

    saveTasks();
    renderAll();
    hideModal('task-modal');
}

function promptDeleteTask(taskId) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;

    pendingDeleteId = taskId;
    const safeTitle = (task.title || '').toString().trim() || 'Untitled task';
    document.getElementById('confirm-task-name').textContent = safeTitle;
    hideModal('task-modal');
    showModal('confirm-modal');
}

function confirmDelete() {
    if (!pendingDeleteId) return;
    tasks = tasks.filter((item) => item.id !== pendingDeleteId);
    pendingDeleteId = null;
    saveTasks();
    renderAll();
    hideModal('confirm-modal');
    showToast('Task deleted', 'error');
}

function showModal(id) {
    const modal = document.getElementById(id);
    modal.classList.remove('hidden');
}

function hideModal(id) {
    const modal = document.getElementById(id);
    modal.classList.add('hidden');
}

function updateFilterBadge() {
    const badge = document.getElementById('filter-badge');
    const count = countActiveFilters();

    if (count > 0) {
        badge.textContent = `${count}`;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }

    document.querySelectorAll('.filter-btn').forEach((button) => {
        const type = button.dataset.filter;
        const value = button.dataset.value;
        const active = activeFilters[type] === value;
        button.classList.toggle('is-active', active);
    });
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const icon = document.getElementById('toast-icon');
    const label = document.getElementById('toast-message');

    label.textContent = message;
    if (type === 'error') {
        icon.className = 'fa-solid fa-circle-xmark text-red-300';
    } else if (type === 'sync') {
        icon.className = 'fa-solid fa-arrows-rotate text-cyan-200';
    } else {
        icon.className = 'fa-solid fa-circle-check text-emerald-300';
    }

    toast.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 2200);
}

function escapeCell(value) {
    return escapeHtml((value ?? '').toString());
}

function exportTasksToExcel() {
    const rows = tasks.map((task) => `
        <tr>
            <td>${escapeCell(task.title)}</td>
            <td>${escapeCell(task.description)}</td>
            <td>${escapeCell(COLUMN_LABELS[task.column] || task.column)}</td>
            <td>${escapeCell(PRIORITY_LABEL[task.priority] || task.priority)}</td>
            <td>${escapeCell((task.labels || []).join(', '))}</td>
            <td>${escapeCell(task.dueDate || '')}</td>
            <td>${escapeCell(task.progress ?? '')}</td>
            <td>${escapeCell(task.completedDate || '')}</td>
        </tr>
    `).join('');

    const table = `
        <table>
            <thead>
                <tr>
                    <th>Title</th>
                    <th>Description</th>
                    <th>Column</th>
                    <th>Priority</th>
                    <th>Labels</th>
                    <th>Due Date</th>
                    <th>Progress</th>
                    <th>Completed Date</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;

    const workbookHtml = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta charset="utf-8">
                <style>
                    table { border-collapse: collapse; }
                    th, td { border: 1px solid #d1d5db; padding: 6px 8px; font-family: Arial, sans-serif; font-size: 12px; }
                    th { background: #eef2ff; }
                </style>
            </head>
            <body>${table}</body>
        </html>
    `;

    const blob = new Blob([workbookHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `flowboard-${new Date().toISOString().slice(0, 10)}.xls`;
    link.click();
    URL.revokeObjectURL(url);

    showToast('Exported to Excel (.xls)', 'success');
}

function resetToDefault() {
    if (!confirm('Reset board to default tasks? This removes current changes.')) return;
    tasks = cloneDefaultTasks();
    saveTasks();
    renderAll();
    showToast('Board reset complete', 'success');
}

function applyRemoteUpdate() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return;

        const normalized = parsed.map((task, index) => sanitizeTask(task, index)).filter(Boolean);
        if (!normalized.length) return;

        isApplyingRemote = true;
        tasks = normalized;
        lastUpdated = new Date();
        renderAll();
        updateLastUpdatedText();
        showToast('Board updated in real time', 'sync');
        setSyncStatus('Synced from another tab');
    } finally {
        isApplyingRemote = false;
    }
}

function setupRealtimeSync() {
    if ('BroadcastChannel' in window) {
        syncChannel = new BroadcastChannel(SYNC_CHANNEL);
        syncChannel.onmessage = (event) => {
            const data = event.data || {};
            if (data.source === tabId || data.type !== 'tasks-updated') return;
            applyRemoteUpdate();
        };
    }

    window.addEventListener('storage', (event) => {
        if (event.key !== STORAGE_KEY || isApplyingRemote) return;
        applyRemoteUpdate();
    });
}

function setupEventListeners() {
    document.getElementById('new-task-btn').addEventListener('click', () => openAddModal('todo'));

    document.querySelectorAll('.add-task-col-btn').forEach((button) => {
        button.addEventListener('click', () => openAddModal(button.dataset.column));
    });

    document.getElementById('save-task-btn').addEventListener('click', saveTask);
    document.getElementById('close-modal-btn').addEventListener('click', () => hideModal('task-modal'));
    document.getElementById('cancel-modal-btn').addEventListener('click', () => hideModal('task-modal'));

    document.getElementById('delete-task-btn').addEventListener('click', () => {
        if (editingTaskId) promptDeleteTask(editingTaskId);
    });

    document.getElementById('confirm-cancel-btn').addEventListener('click', () => {
        pendingDeleteId = null;
        hideModal('confirm-modal');
    });

    document.getElementById('confirm-delete-btn').addEventListener('click', confirmDelete);

    document.getElementById('task-modal').addEventListener('click', (event) => {
        if (event.target === event.currentTarget) hideModal('task-modal');
    });

    document.getElementById('confirm-modal').addEventListener('click', (event) => {
        if (event.target === event.currentTarget) hideModal('confirm-modal');
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            hideModal('task-modal');
            hideModal('confirm-modal');
        }

        if (event.key.toLowerCase() === 'n' && !event.metaKey && !event.ctrlKey) {
            const active = document.activeElement;
            const inForm = active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);
            if (!inForm) openAddModal('todo');
        }

        if (event.key === '/') {
            const input = document.getElementById('search-input');
            if (input && document.activeElement !== input) {
                event.preventDefault();
                input.focus();
            }
        }
    });

    document.getElementById('modal-task-title').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') saveTask();
    });

    document.getElementById('filter-toggle-btn').addEventListener('click', () => {
        document.getElementById('filter-panel').classList.toggle('hidden');
    });

    document.querySelectorAll('.filter-btn').forEach((button) => {
        button.addEventListener('click', () => {
            const type = button.dataset.filter;
            const value = button.dataset.value;
            activeFilters[type] = activeFilters[type] === value ? null : value;
            renderAll();
        });
    });

    document.getElementById('clear-filters-btn').addEventListener('click', () => {
        activeFilters = { priority: null, label: null };
        renderAll();
    });

    const searchInput = document.getElementById('search-input');
    const clearSearchBtn = document.getElementById('clear-search-btn');

    searchInput.addEventListener('input', () => {
        searchQuery = searchInput.value.trim();
        clearSearchBtn.classList.toggle('hidden', !searchQuery);
        renderAll();
    });

    clearSearchBtn.addEventListener('click', () => {
        searchQuery = '';
        searchInput.value = '';
        clearSearchBtn.classList.add('hidden');
        renderAll();
        searchInput.focus();
    });

    document.getElementById('export-btn').addEventListener('click', exportTasksToExcel);
    document.getElementById('footer-export-btn').addEventListener('click', exportTasksToExcel);
    document.getElementById('reset-btn').addEventListener('click', resetToDefault);
}

function init() {
    loadTasks();
    setupRealtimeSync();
    setupDropZones();
    setupEventListeners();
    renderAll();
    updateLastUpdatedText();

    setInterval(updateLastUpdatedText, 30000);
}

init();
