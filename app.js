const STORAGE_KEY = "yanshi-focus-v1";
const BROWSER_BACKUPS_KEY = "yanshi-focus-backups-v1";
const MAX_BACKUPS = 7;
const RING_CIRCUMFERENCE = 2 * Math.PI * 116;
const { sortTasks, filterTasks, getTaskStats } = window.YanShiTaskHelpers;
const { analyzeFocusSessions, filterFocusRecords } = window.YanShiInsightHelpers;

const defaultState = {
  settings: { focus: 25, short: 5, long: 15, sound: true, autoBreak: false, keepAwake: true, dailyTarget: 6 },
  todos: [],
  sessions: [],
  timer: { mode: "focus", remaining: 25 * 60, total: 25 * 60, running: false, endAt: null, rounds: 0, taskId: "" }
};

let state = loadState();
let timerInterval = null;
let historyRange = 7;
let taskFilter = "all";
let taskQuery = "";
let recordQuery = "";
let recordFilter = "all";
let deferredInstallPrompt = null;
let toastTimeout = null;
let toastActionHandler = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function loadState() {
  try {
    const desktopData = window.yanshiStorage?.load?.();
    const saved = JSON.parse(desktopData || localStorage.getItem(STORAGE_KEY));
    return normalizeState(saved);
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  const serialized = JSON.stringify(state);
  const previous = localStorage.getItem(STORAGE_KEY);
  if (!window.yanshiStorage?.isDesktop && previous && previous !== serialized) {
    createBrowserBackup(previous, "auto");
  }
  localStorage.setItem(STORAGE_KEY, serialized);
  window.yanshiStorage?.save?.(serialized);
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function safeDate(value, fallback = new Date().toISOString()) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function normalizeState(saved, { stopTimer = false } = {}) {
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return structuredClone(defaultState);
  const settings = {
    focus: clampNumber(saved.settings?.focus, 1, 120, defaultState.settings.focus),
    short: clampNumber(saved.settings?.short, 1, 60, defaultState.settings.short),
    long: clampNumber(saved.settings?.long, 1, 90, defaultState.settings.long),
    dailyTarget: clampNumber(saved.settings?.dailyTarget, 1, 16, defaultState.settings.dailyTarget),
    sound: saved.settings?.sound !== false,
    autoBreak: saved.settings?.autoBreak === true,
    keepAwake: saved.settings?.keepAwake !== false
  };
  const todos = (Array.isArray(saved.todos) ? saved.todos : []).slice(0, 10000).map(todo => ({
    id: typeof todo?.id === "string" ? todo.id : uid("todo"),
    title: String(todo?.title || "未命名任务").slice(0, 80),
    completed: todo?.completed === true,
    pinned: todo?.pinned === true,
    createdAt: safeDate(todo?.createdAt),
    completedAt: todo?.completedAt ? safeDate(todo.completedAt) : null
  }));
  const sessions = (Array.isArray(saved.sessions) ? saved.sessions : []).slice(0, 50000).map(session => {
    const startedAt = safeDate(session?.startedAt);
    return {
      id: typeof session?.id === "string" ? session.id : uid("session"),
      type: "focus",
      startedAt,
      endedAt: safeDate(session?.endedAt, startedAt),
      durationSeconds: clampNumber(session?.durationSeconds, 0, 24 * 60 * 60, 0),
      plannedSeconds: clampNumber(session?.plannedSeconds, 60, 24 * 60 * 60, 25 * 60),
      completed: session?.completed === true,
      taskId: typeof session?.taskId === "string" ? session.taskId : "",
      taskTitle: String(session?.taskTitle || "自由专注").slice(0, 80)
    };
  }).filter(session => session.durationSeconds >= 60);
  const timerSource = saved.timer || {};
  const mode = ["focus", "short", "long"].includes(timerSource.mode) ? timerSource.mode : "focus";
  const expectedTotal = settings[mode] * 60;
  const total = clampNumber(timerSource.total, 60, 24 * 60 * 60, expectedTotal);
  const endAt = Number(timerSource.endAt);
  const timer = {
    mode,
    remaining: clampNumber(timerSource.remaining, 0, total, total),
    total,
    running: !stopTimer && timerSource.running === true && Number.isFinite(endAt),
    endAt: !stopTimer && Number.isFinite(endAt) ? endAt : null,
    rounds: Math.floor(clampNumber(timerSource.rounds, 0, 100000, 0)),
    taskId: typeof timerSource.taskId === "string" ? timerSource.taskId : ""
  };
  return { settings, todos, sessions, timer };
}

function readBrowserBackups() {
  try {
    const backups = JSON.parse(localStorage.getItem(BROWSER_BACKUPS_KEY));
    return Array.isArray(backups) ? backups.filter(item => item?.createdAt && typeof item.content === "string").slice(0, MAX_BACKUPS) : [];
  } catch {
    return [];
  }
}

function createBrowserBackup(content, kind = "manual", force = false) {
  try {
    JSON.parse(content);
    const backups = readBrowserBackups();
    const today = localDateKey();
    if (!force && kind === "auto" && backups.some(item => item.kind === "auto" && localDateKey(new Date(item.createdAt)) === today)) return;
    backups.unshift({ id: uid("backup"), createdAt: new Date().toISOString(), kind, content });
    localStorage.setItem(BROWSER_BACKUPS_KEY, JSON.stringify(backups.slice(0, MAX_BACKUPS)));
  } catch { /* 浏览器存储空间不足时不影响主数据保存。 */ }
}

function buildBackupFileContent() {
  return JSON.stringify({
    format: "yanshi-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: state
  }, null, 2);
}

function parseBackupContent(content) {
  if (typeof content !== "string" || new Blob([content]).size > 10 * 1024 * 1024) throw new Error("备份文件无效或超过 10 MB");
  const parsed = JSON.parse(content);
  const data = parsed?.format === "yanshi-backup" ? parsed.data : parsed;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("备份内容格式不正确");
  return normalizeState(data, { stopTimer: true });
}

function uid(prefix = "id") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dateFromKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDuration(seconds, compact = false) {
  const minutes = Math.round(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (compact) return h ? `${h}h ${m}m` : `${m}m`;
  return h ? `${h} 小时 ${m} 分钟` : `${m} 分钟`;
}

function focusSessions() {
  return state.sessions.filter((session) => session.type === "focus");
}

function sessionsForDay(key) {
  return focusSessions().filter((session) => localDateKey(new Date(session.startedAt)) === key);
}

function focusSecondsForDay(key) {
  return sessionsForDay(key).reduce((total, session) => total + session.durationSeconds, 0);
}

function startOfWeek(date = new Date()) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  return result;
}

function calculateStreak() {
  const activeDays = new Set(focusSessions().filter(s => s.durationSeconds >= 60).map(s => localDateKey(new Date(s.startedAt))));
  let cursor = new Date();
  if (!activeDays.has(localDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (activeDays.has(localDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function renderDate() {
  const now = new Date();
  const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  $("#todayDate").textContent = `${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日 · ${weekdays[now.getDay()]}`;
}

function renderSummary() {
  const todayKey = localDateKey();
  const todaySeconds = focusSecondsForDay(todayKey);
  const todayCount = sessionsForDay(todayKey).length;
  const openTodos = state.todos.filter(todo => !todo.completed).length;
  const todayMinutes = Math.round(todaySeconds / 60);
  const targetMinutes = state.settings.dailyTarget * 60;
  const targetPct = Math.min(100, todayMinutes / targetMinutes * 100 || 0);

  $("#todayFocus").innerHTML = `${todayMinutes}<em> 分钟</em>`;
  $("#todaySessions").innerHTML = `${todayCount}<em> 个</em>`;
  $("#todayTodos").innerHTML = `${openTodos}<em> 项</em>`;
  $("#navTodoCount").textContent = openTodos;
  $("#navTodoCount").classList.toggle("hidden", openTodos === 0);
  $("#streakDays").textContent = calculateStreak();
  $("#targetProgress").style.width = `${targetPct}%`;
  $("#targetLabel").textContent = `${(todaySeconds / 3600).toFixed(todaySeconds >= 3600 ? 1 : 2).replace(/\.00$/, "")} / ${state.settings.dailyTarget}h`;
  $("#todayFocusHint").textContent = todayMinutes ? `已投入 ${formatDuration(todaySeconds, true)}，继续保持` : "从第一颗番茄开始";
  $("#todoSummaryHint").textContent = openTodos ? "专注当下，一件一件完成" : "今天的任务已经清空";
}

function getModeDuration(mode) {
  return state.settings[mode] * 60;
}

function setMode(mode, force = false) {
  if (!force && mode === state.timer.mode) return;
  state.timer.mode = mode;
  state.timer.total = getModeDuration(mode);
  state.timer.remaining = state.timer.total;
  state.timer.running = false;
  state.timer.endAt = null;
  saveState();
  stopTimerLoop();
  renderTimer();
}

function syncRunningTimer() {
  if (!state.timer.running || !state.timer.endAt) return;
  state.timer.remaining = Math.max(0, Math.ceil((state.timer.endAt - Date.now()) / 1000));
  if (state.timer.remaining <= 0) completeTimer(true);
}

function toggleTimer() {
  if (state.timer.running) {
    state.timer.remaining = Math.max(0, Math.ceil((state.timer.endAt - Date.now()) / 1000));
    state.timer.running = false;
    state.timer.endAt = null;
    stopTimerLoop();
  } else {
    if (state.timer.remaining <= 0) state.timer.remaining = state.timer.total;
    state.timer.running = true;
    state.timer.endAt = Date.now() + state.timer.remaining * 1000;
    startTimerLoop();
  }
  saveState();
  renderTimer();
}

function timerHasFocusProgress() {
  return state.timer.mode === "focus" && (state.timer.running || getCurrentRemaining() < state.timer.total);
}

function startTimerLoop() {
  stopTimerLoop();
  timerInterval = setInterval(() => {
    syncRunningTimer();
    renderTimer();
    if (state.timer.running) saveState();
  }, 500);
}

function stopTimerLoop() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
}

function resetTimer() {
  state.timer.running = false;
  state.timer.endAt = null;
  state.timer.total = getModeDuration(state.timer.mode);
  state.timer.remaining = state.timer.total;
  stopTimerLoop();
  saveState();
  renderTimer();
  showToast("计时已重置");
}

function finishEarly() {
  const elapsed = state.timer.total - getCurrentRemaining();
  if (state.timer.mode === "focus" && elapsed < 60) {
    showToast("专注满 1 分钟后才可以记录");
    return;
  }
  completeTimer(false);
}

function getCurrentRemaining() {
  return state.timer.running ? Math.max(0, Math.ceil((state.timer.endAt - Date.now()) / 1000)) : state.timer.remaining;
}

function completeTimer(natural) {
  const finishedMode = state.timer.mode;
  const elapsed = natural ? state.timer.total : Math.max(0, state.timer.total - getCurrentRemaining());
  state.timer.running = false;
  state.timer.endAt = null;
  stopTimerLoop();

  if (finishedMode === "focus" && elapsed >= 60) {
    const task = state.todos.find(todo => todo.id === state.timer.taskId);
    state.sessions.unshift({
      id: uid("session"),
      type: "focus",
      startedAt: new Date(Date.now() - elapsed * 1000).toISOString(),
      endedAt: new Date().toISOString(),
      durationSeconds: elapsed,
      plannedSeconds: state.timer.total,
      completed: natural,
      taskId: task?.id || "",
      taskTitle: task?.title || "自由专注"
    });
    state.timer.rounds += 1;
    showToast(`已记录 ${formatDuration(elapsed)}专注`);
  } else if (finishedMode !== "focus") {
    showToast("休息结束，准备好再继续");
  }

  playCompletionSound();
  if (document.hidden && "Notification" in window && Notification.permission === "granted") {
    new Notification(finishedMode === "focus" ? "专注完成" : "休息结束", { body: finishedMode === "focus" ? "这段努力已经记录，休息一下吧。" : "准备开始下一轮专注。", icon: "assets/icon.svg" });
  }

  const nextMode = finishedMode === "focus" ? (state.timer.rounds % 4 === 0 ? "long" : "short") : "focus";
  state.timer.mode = nextMode;
  state.timer.total = getModeDuration(nextMode);
  state.timer.remaining = state.timer.total;
  if (state.settings.autoBreak && finishedMode === "focus") {
    state.timer.running = true;
    state.timer.endAt = Date.now() + state.timer.remaining * 1000;
    startTimerLoop();
  }
  saveState();
  renderAll();
}

function playCompletionSound() {
  if (!state.settings.sound) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audio = new AudioContextClass();
    [0, .18].forEach((delay, index) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "sine";
      osc.frequency.value = index ? 660 : 520;
      gain.gain.setValueAtTime(0, audio.currentTime + delay);
      gain.gain.linearRampToValueAtTime(.11, audio.currentTime + delay + .02);
      gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + delay + .35);
      osc.connect(gain).connect(audio.destination);
      osc.start(audio.currentTime + delay);
      osc.stop(audio.currentTime + delay + .38);
    });
  } catch { /* Audio is optional. */ }
}

function renderTimer() {
  if (state.timer.running) syncRunningTimer();
  const remaining = state.timer.remaining;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const progress = state.timer.total ? remaining / state.timer.total : 1;
  const isFocus = state.timer.mode === "focus";
  const modeNames = { focus: "专注", short: "短休息", long: "长休息" };
  const button = $("#toggleTimer");

  $("#timerDisplay").textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  $("#timerStatus").textContent = state.timer.running ? (isFocus ? "正在专注" : "放松一下") : (remaining < state.timer.total ? "已暂停" : "准备开始");
  $("#timerRound").textContent = isFocus ? `第 ${state.timer.rounds + 1} 个番茄` : modeNames[state.timer.mode];
  $("#ringProgress").style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - progress);
  $("#timerRing").classList.toggle("break", !isFocus);
  button.classList.toggle("running", state.timer.running);
  button.innerHTML = state.timer.running ? `<svg><use href="#i-pause"></use></svg><span>暂停计时</span>` : `<svg><use href="#i-play"></use></svg><span>${isFocus ? (remaining < state.timer.total ? "继续专注" : "开始专注") : "开始休息"}</span>`;
  $("#finishTimer").textContent = isFocus ? "完成本次" : "结束休息";
  $("#focusTask").disabled = state.timer.running || (isFocus && remaining < state.timer.total);
  window.yanshiStorage?.updateTimerStatus?.({
    running: state.timer.running,
    mode: state.timer.mode,
    keepAwake: state.settings.keepAwake,
    progress: state.timer.total ? 1 - remaining / state.timer.total : 0
  });
  $$(".mode-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.mode === state.timer.mode));
  document.title = state.timer.running ? `${$("#timerDisplay").textContent} · ${isFocus ? "专注中" : "休息中"} | 研时` : "研时 · 考研专注钟";
}

function addTodo(title) {
  const cleanTitle = title.trim();
  if (!cleanTitle) return;
  state.todos.unshift({ id: uid("todo"), title: cleanTitle, completed: false, pinned: false, createdAt: new Date().toISOString(), completedAt: null });
  saveState();
  renderTodos();
  renderSummary();
  showToast("任务已添加");
}

function toggleTodo(id) {
  const todo = state.todos.find(item => item.id === id);
  if (!todo) return;
  if (!todo.completed && state.timer.taskId === id && timerHasFocusProgress()) {
    showToast("请先完成或重置当前番茄，再勾选这项任务");
    return;
  }
  todo.completed = !todo.completed;
  todo.completedAt = todo.completed ? new Date().toISOString() : null;
  if (todo.completed && state.timer.taskId === id) state.timer.taskId = "";
  saveState();
  renderTodos();
  renderSummary();
}

function toggleTodoPin(id) {
  const todo = state.todos.find(item => item.id === id);
  if (!todo || todo.completed) return;
  todo.pinned = !todo.pinned;
  saveState();
  renderTodos();
  showToast(todo.pinned ? "任务已置顶" : "已取消置顶");
}

function focusTodo(id) {
  const todo = state.todos.find(item => item.id === id && !item.completed);
  if (!todo) return;
  if (state.timer.running && state.timer.taskId !== id) {
    showToast("请先暂停当前计时，再切换任务");
    return;
  }
  if (timerHasFocusProgress() && state.timer.taskId !== id) {
    showToast("当前番茄已有进度，重置后才能切换任务");
    return;
  }
  if (state.timer.mode !== "focus") setMode("focus", true);
  state.timer.taskId = id;
  saveState();
  renderTodos();
  renderTimer();
  navigate("timer");
  showToast(`已选择“${todo.title}”`);
}

function beginTodoEdit(id, item) {
  const todo = state.todos.find(candidate => candidate.id === id);
  const text = item?.querySelector(".todo-text");
  if (!todo || !text) return;

  const input = document.createElement("input");
  input.className = "todo-edit-input";
  input.setAttribute("aria-label", "编辑任务名称");
  input.maxLength = 80;
  input.value = todo.title;
  text.replaceWith(input);
  input.focus();
  input.select();

  let finished = false;
  const finish = (shouldSave) => {
    if (finished) return;
    finished = true;
    const nextTitle = input.value.trim();
    if (shouldSave && nextTitle) {
      todo.title = nextTitle;
      saveState();
      showToast("任务名称已更新");
    } else if (shouldSave && !nextTitle) {
      showToast("任务名称不能为空");
    }
    renderTodos();
  };

  input.addEventListener("keydown", event => {
    if (event.key === "Enter") { event.preventDefault(); finish(true); }
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(false); }
  });
  input.addEventListener("blur", () => finish(true), { once: true });
}

function deleteTodo(id) {
  const index = state.todos.findIndex(item => item.id === id);
  if (index < 0) return;
  if (state.timer.taskId === id && timerHasFocusProgress()) {
    showToast("当前番茄正在使用这项任务，完成或重置后才能删除");
    return;
  }
  const [removed] = state.todos.splice(index, 1);
  const wasSelected = state.timer.taskId === id;
  if (wasSelected) state.timer.taskId = "";
  saveState();
  renderTodos();
  renderSummary();
  showUndoToast("任务已删除", () => {
    state.todos.splice(index, 0, removed);
    if (wasSelected && !state.timer.taskId) state.timer.taskId = id;
    saveState();
    renderTodos();
    renderSummary();
  });
}

function todoHTML(todo, full = false) {
  const created = new Date(todo.createdAt);
  const stats = getTaskStats(todo.id, state.sessions);
  const activity = stats.sessionCount
    ? `已专注 ${formatDuration(stats.durationSeconds, true)} · ${stats.sessionCount} 次`
    : `${created.getMonth() + 1} 月 ${created.getDate()} 日添加`;
  const meta = `${todo.pinned && !todo.completed ? "置顶 · " : ""}${activity}`;
  const classes = [todo.completed ? "done" : "", todo.pinned && !todo.completed ? "pinned" : "", state.timer.taskId === todo.id ? "selected" : ""].filter(Boolean).join(" ");
  return `<div class="todo-item ${classes}" data-id="${escapeHTML(todo.id)}">
    <button class="todo-check" data-action="toggle" aria-label="${todo.completed ? "标记为未完成" : "标记为完成"}"><svg><use href="#i-check"></use></svg></button>
    <div class="todo-main">
      <div class="todo-text" title="${escapeHTML(todo.title)}">${escapeHTML(todo.title)}</div>
      ${full ? `<span class="todo-meta">${meta}</span>` : ""}
    </div>
    <div class="todo-actions">
      ${!todo.completed ? `<button class="todo-action ${todo.pinned ? "active" : ""}" data-action="pin" aria-label="${todo.pinned ? "取消置顶" : "置顶任务"}" title="${todo.pinned ? "取消置顶" : "置顶任务"}"><svg><use href="#i-pin"></use></svg></button>` : ""}
      ${!todo.completed ? `<button class="todo-action focus" data-action="focus" aria-label="专注此任务" title="选择并前往计时"><svg><use href="#i-play"></use></svg></button>` : ""}
      ${full ? `<button class="todo-action" data-action="edit" aria-label="编辑任务" title="编辑任务"><svg><use href="#i-edit"></use></svg></button>` : ""}
      <button class="todo-action delete" data-action="delete" aria-label="删除任务" title="删除任务"><svg><use href="#i-trash"></use></svg></button>
    </div>
  </div>`;
}

function emptyTodoHTML(message = "还没有任务") {
  return `<div class="empty-state"><span class="empty-icon"><svg><use href="#i-list"></use></svg></span><p>${message}<br><small>写下一件事，让今天有清晰的起点</small></p></div>`;
}

function renderTodos() {
  const sorted = sortTasks(state.todos);
  const quickItems = sorted.filter(todo => !todo.completed).slice(0, 6);
  $("#quickTodoList").innerHTML = quickItems.length ? quickItems.map(todo => todoHTML(todo)).join("") : emptyTodoHTML("今天还没有待办");

  const filtered = filterTasks(sorted, taskFilter, taskQuery);
  const emptyMessage = taskQuery ? `没有找到“${escapeHTML(taskQuery)}”` : (taskFilter === "done" ? "还没有完成的任务" : "任务清单是空的");
  $("#fullTodoList").innerHTML = filtered.length ? filtered.map(todo => todoHTML(todo, true)).join("") : emptyTodoHTML(emptyMessage);

  const done = state.todos.filter(todo => todo.completed).length;
  const percentage = state.todos.length ? Math.round(done / state.todos.length * 100) : 0;
  $("#todoProgressText").textContent = `${percentage}%`;
  $("#todoProgressBar").style.width = `${percentage}%`;
  $("#taskRingValue").textContent = `${percentage}%`;

  const select = $("#focusTask");
  const selected = state.timer.taskId;
  select.innerHTML = `<option value="">暂不关联任务</option>${state.todos.filter(todo => !todo.completed).map(todo => `<option value="${escapeHTML(todo.id)}">${escapeHTML(todo.title)}</option>`).join("")}`;
  select.value = state.todos.some(todo => todo.id === selected && !todo.completed) ? selected : "";
  state.timer.taskId = select.value;
}

function renderHistory() {
  const now = new Date();
  const weekStart = startOfWeek(now);
  const weekSeconds = focusSessions().filter(session => new Date(session.startedAt) >= weekStart).reduce((sum, session) => sum + session.durationSeconds, 0);
  const allSeconds = focusSessions().reduce((sum, session) => sum + session.durationSeconds, 0);
  const byDay = new Map();
  focusSessions().forEach(session => {
    const key = localDateKey(new Date(session.startedAt));
    byDay.set(key, (byDay.get(key) || 0) + session.durationSeconds);
  });
  const best = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];

  $("#weekFocus").textContent = formatDuration(weekSeconds, true);
  $("#totalFocus").textContent = formatDuration(allSeconds, true);
  $("#totalDays").textContent = `${byDay.size} 个专注日`;
  $("#bestDay").textContent = best ? formatDuration(best[1], true) : "0h 0m";
  $("#bestDayDate").textContent = best ? dateFromKey(best[0]).toLocaleDateString("zh-CN", { month: "long", day: "numeric" }) : "还没有记录";
  $("#weekCompare").textContent = weekSeconds ? `本周完成 ${focusSessions().filter(s => new Date(s.startedAt) >= weekStart).length} 次专注` : "本周从此刻开始";
  renderChart();
  renderInsights();
  renderRecords();
}

function renderChart() {
  const data = [];
  for (let i = historyRange - 1; i >= 0; i--) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - i);
    const key = localDateKey(date);
    data.push({ date, key, seconds: focusSecondsForDay(key) });
  }
  const maxValue = Math.max(...data.map(item => item.seconds), 60 * 60);
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  const chart = $("#focusChart");
  chart.classList.toggle("days-30", historyRange === 30);
  chart.innerHTML = data.map((item, index) => {
    const height = item.seconds ? Math.max(5, item.seconds / maxValue * 170) : 3;
    const label = historyRange === 7 ? (index === data.length - 1 ? "今天" : `周${weekdays[item.date.getDay()]}`) : ((index % 5 === 0 || index === data.length - 1) ? `${item.date.getMonth() + 1}/${item.date.getDate()}` : "");
    return `<div class="chart-bar ${index === data.length - 1 ? "today" : ""}" title="${item.date.toLocaleDateString("zh-CN")} · ${formatDuration(item.seconds)}">
      <span class="chart-value">${item.seconds ? formatDuration(item.seconds, true) : "0m"}</span>
      <i class="chart-column" style="height:${height}px"></i>
      <span class="chart-label">${label}</span>
    </div>`;
  }).join("");
}

function renderInsights() {
  const insight = analyzeFocusSessions(focusSessions(), historyRange, new Date());
  $("#insightRangeLabel").textContent = `近 ${historyRange} 天`;
  $("#insightDailyAverage").textContent = formatDuration(insight.dailyAverageSeconds, true);
  $("#insightActiveDays").textContent = `${insight.activeDays} 天`;
  $("#insightCompletionRate").textContent = `${insight.completionRate}%`;
  $("#insightPeakBand").textContent = insight.peakBand;
  $("#insightTaskCount").textContent = insight.sessionCount ? `${insight.sessionCount} 次 · ${formatDuration(insight.totalSeconds, true)}` : "暂无记录";

  const breakdown = $("#taskBreakdown");
  if (!insight.topTasks.length) {
    breakdown.innerHTML = `<div class="task-breakdown-empty">完成一次关联任务的专注后，这里会显示投入分布</div>`;
    return;
  }

  const maxSeconds = insight.topTasks[0].durationSeconds;
  breakdown.innerHTML = insight.topTasks.map(task => {
    const currentTitle = state.todos.find(todo => todo.id === task.taskId)?.title;
    const title = currentTitle || task.title || "自由专注";
    const width = Math.max(7, task.durationSeconds / maxSeconds * 100);
    return `<div class="task-breakdown-row" title="${escapeHTML(title)} · ${formatDuration(task.durationSeconds)}">
      <div><strong>${escapeHTML(title)}</strong><span>${task.sessionCount} 次 · ${formatDuration(task.durationSeconds, true)}</span></div>
      <i><b style="width:${width}%"></b></i>
    </div>`;
  }).join("");
}

function renderRecords() {
  const allSessions = focusSessions().sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  const sessions = filterFocusRecords(allSessions, recordFilter, recordQuery);
  $("#recordCount").textContent = sessions.length === allSessions.length ? `共 ${allSessions.length} 条` : `${sessions.length} / ${allSessions.length} 条`;
  if (!sessions.length) {
    const message = allSessions.length ? "没有匹配的专注记录" : "还没有专注记录";
    const hint = allSessions.length ? "换个关键词或筛选条件试试" : "完成第一次专注后，记录会出现在这里";
    $("#recordsList").innerHTML = `<div class="empty-state"><span class="empty-icon"><svg><use href="#i-clock"></use></svg></span><p>${message}<br><small>${hint}</small></p></div>`;
    return;
  }
  $("#recordsList").innerHTML = sessions.map(session => {
    const date = new Date(session.startedAt);
    return `<div class="record-row" data-id="${session.id}">
      <div class="record-date"><strong>${date.getDate()}</strong><span>${date.getMonth() + 1}月</span></div>
      <div class="record-info"><strong>${escapeHTML(session.taskTitle || "自由专注")}</strong><span>${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })} · ${session.completed ? "完整番茄" : "提前完成"}</span></div>
      <span class="record-duration">${formatDuration(session.durationSeconds, true)}</span>
      <button class="record-delete" aria-label="删除记录"><svg><use href="#i-trash"></use></svg></button>
    </div>`;
  }).join("");
}

function deleteSession(id) {
  if (!confirm("确定删除这条专注记录吗？删除后今日累计也会相应减少。")) return;
  const index = state.sessions.findIndex(session => session.id === id);
  if (index < 0) return;
  const [removed] = state.sessions.splice(index, 1);
  saveState();
  renderSummary();
  renderHistory();
  showUndoToast("专注记录已删除", () => {
    state.sessions.splice(index, 0, removed);
    saveState();
    renderSummary();
    renderHistory();
  });
}

function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function navigate(view) {
  const titles = { timer: "专注计时", history: "专注记录", tasks: "待办清单" };
  $$(".view").forEach(section => section.classList.toggle("active", section.id === `view-${view}`));
  $$(".nav-item[data-view]").forEach(button => button.classList.toggle("active", button.dataset.view === view));
  $("#pageTitle").textContent = titles[view];
  if (view === "history") renderHistory();
  if (view === "tasks") renderTodos();
}

function showToast(message, { actionLabel = "", onAction = null, duration = 2200 } = {}) {
  const toast = $("#toast");
  const actionButton = $("#toastAction");
  toast.querySelector("span").textContent = message;
  toastActionHandler = typeof onAction === "function" ? onAction : null;
  actionButton.textContent = actionLabel;
  actionButton.classList.toggle("hidden", !toastActionHandler);
  toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove("show");
    toastActionHandler = null;
    actionButton.classList.add("hidden");
  }, duration);
}

function showUndoToast(message, undo) {
  showToast(message, {
    actionLabel: "撤销",
    duration: 6000,
    onAction: () => {
      undo();
      showToast("已撤销删除");
    }
  });
}

function openSettings() {
  $("#focusDuration").value = state.settings.focus;
  $("#shortDuration").value = state.settings.short;
  $("#longDuration").value = state.settings.long;
  $("#dailyTarget").value = state.settings.dailyTarget;
  $("#soundEnabled").checked = state.settings.sound;
  $("#autoBreak").checked = state.settings.autoBreak;
  $("#keepAwake").checked = state.settings.keepAwake;
  $("#settingsModal").classList.add("open");
  $("#settingsModal").setAttribute("aria-hidden", "false");
  refreshDataSafetyInfo();
}

function closeSettings() {
  $("#settingsModal").classList.remove("open");
  $("#settingsModal").setAttribute("aria-hidden", "true");
}

function formatBackupTime(value) {
  if (!value) return "尚未生成备份";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "备份时间未知";
  return `最近备份：${date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

async function refreshDataSafetyInfo() {
  const status = $("#dataBackupStatus");
  const badge = $("#backupCountBadge");
  const folderButton = $("#openDataFolder");
  const storageLocation = $("#dataSaveLocation");
  if (!status || !badge) return;
  if (window.yanshiStorage?.isDesktop) {
    try {
      const info = await window.yanshiStorage.getInfo();
      badge.textContent = `${info.backupCount} / ${info.maxBackups}`;
      status.textContent = `${formatBackupTime(info.latestBackupAt)} · 自动保留最近 ${info.maxBackups} 份`;
      storageLocation.textContent = `数据文件：${info.dataPath}`;
      folderButton.disabled = false;
      return;
    } catch {
      status.textContent = "暂时无法读取桌面备份状态";
    }
  }
  const backups = readBrowserBackups();
  badge.textContent = `${backups.length} / ${MAX_BACKUPS}`;
  status.textContent = `${formatBackupTime(backups[0]?.createdAt)} · 保存在当前浏览器`;
  storageLocation.textContent = "数据与快照保存在当前浏览器中，请定期导出文件备份";
  folderButton.disabled = true;
}

async function handleExportData() {
  const content = buildBackupFileContent();
  try {
    if (window.yanshiStorage?.isDesktop) {
      const result = await window.yanshiStorage.exportData(content);
      if (!result?.ok) return;
    } else {
      const blob = new Blob([content], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `研时数据-${localDateKey()}.json`;
      link.click();
      URL.revokeObjectURL(url);
    }
    showToast("数据已导出");
  } catch (error) {
    showToast(error?.message || "数据导出失败");
  }
}

async function applyImportedContent(content) {
  let importedState;
  try {
    importedState = parseBackupContent(content);
  } catch (error) {
    showToast(error?.message || "无法读取备份文件");
    return;
  }
  if (!confirm("导入会替换当前任务、专注记录和设置。继续前会先创建一份当前数据备份，确定导入吗？")) return;
  try {
    const currentContent = JSON.stringify(state);
    if (window.yanshiStorage?.isDesktop) await window.yanshiStorage.backupNow(currentContent);
    else createBrowserBackup(currentContent, "manual", true);
    stopTimerLoop();
    state = importedState;
    saveState();
    renderAll();
    await refreshDataSafetyInfo();
    closeSettings();
    showToast(`已恢复 ${state.todos.length} 项任务和 ${state.sessions.length} 条专注记录`);
  } catch (error) {
    showToast(error?.message || "数据导入失败");
  }
}

async function handleImportData() {
  try {
    if (window.yanshiStorage?.isDesktop) {
      const result = await window.yanshiStorage.importData();
      if (result?.ok) await applyImportedContent(result.content);
    } else {
      $("#importFileInput").click();
    }
  } catch (error) {
    showToast(error?.message || "数据导入失败");
  }
}

async function handleBackupNow() {
  try {
    const content = JSON.stringify(state);
    if (window.yanshiStorage?.isDesktop) await window.yanshiStorage.backupNow(content);
    else createBrowserBackup(content, "manual", true);
    await refreshDataSafetyInfo();
    showToast("手动备份已创建");
  } catch (error) {
    showToast(error?.message || "创建备份失败");
  }
}

async function handleOpenDataFolder() {
  try {
    if (window.yanshiStorage?.openFolder) await window.yanshiStorage.openFolder();
  } catch (error) {
    showToast(error?.message || "无法打开数据目录");
  }
}

function saveSettings(event) {
  event.preventDefault();
  const next = {
    focus: Math.min(120, Math.max(1, Number($("#focusDuration").value) || 25)),
    short: Math.min(60, Math.max(1, Number($("#shortDuration").value) || 5)),
    long: Math.min(90, Math.max(1, Number($("#longDuration").value) || 15)),
    dailyTarget: Math.min(16, Math.max(1, Number($("#dailyTarget").value) || 6)),
    sound: $("#soundEnabled").checked,
    autoBreak: $("#autoBreak").checked,
    keepAwake: $("#keepAwake").checked
  };
  state.settings = next;
  if (!state.timer.running) {
    state.timer.total = getModeDuration(state.timer.mode);
    state.timer.remaining = state.timer.total;
  }
  saveState();
  renderAll();
  closeSettings();
  showToast("设置已保存");
}

function bindEvents() {
  $$(".nav-item[data-view]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.view)));
  $$('[data-go]').forEach(button => button.addEventListener("click", () => navigate(button.dataset.go)));
  $$(".mode-tab").forEach(button => button.addEventListener("click", () => setMode(button.dataset.mode)));
  $("#toggleTimer").addEventListener("click", toggleTimer);
  $("#resetTimer").addEventListener("click", resetTimer);
  $("#finishTimer").addEventListener("click", finishEarly);
  $("#focusTask").addEventListener("change", event => { state.timer.taskId = event.target.value; saveState(); });

  $("#quickAddForm").addEventListener("submit", event => {
    event.preventDefault();
    addTodo($("#quickAddInput").value);
    $("#quickAddInput").value = "";
  });
  $("#taskAddForm").addEventListener("submit", event => {
    event.preventDefault();
    addTodo($("#taskAddInput").value);
    $("#taskAddInput").value = "";
    taskQuery = "";
    $("#taskSearch").value = "";
    taskFilter = "all";
    $$('[data-task-filter]').forEach(item => item.classList.toggle("active", item.dataset.taskFilter === "all"));
    renderTodos();
  });
  [$("#quickTodoList"), $("#fullTodoList")].forEach(list => list.addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    const item = event.target.closest(".todo-item");
    if (!button || !item) return;
    if (button.dataset.action === "toggle") toggleTodo(item.dataset.id);
    if (button.dataset.action === "pin") toggleTodoPin(item.dataset.id);
    if (button.dataset.action === "focus") focusTodo(item.dataset.id);
    if (button.dataset.action === "edit") beginTodoEdit(item.dataset.id, item);
    if (button.dataset.action === "delete") deleteTodo(item.dataset.id);
  }));
  $$("[data-task-filter]").forEach(button => button.addEventListener("click", () => {
    taskFilter = button.dataset.taskFilter;
    $$("[data-task-filter]").forEach(item => item.classList.toggle("active", item === button));
    renderTodos();
  }));
  $("#taskSearch").addEventListener("input", event => {
    taskQuery = event.target.value;
    renderTodos();
  });
  $("#clearCompleted").addEventListener("click", () => {
    const count = state.todos.filter(todo => todo.completed).length;
    if (!count) return showToast("没有已完成的任务");
    const previousTodos = state.todos.map(todo => ({ ...todo }));
    state.todos = state.todos.filter(todo => !todo.completed);
    saveState();
    renderTodos();
    renderSummary();
    showUndoToast(`已清除 ${count} 项已完成任务`, () => {
      state.todos = previousTodos;
      saveState();
      renderTodos();
      renderSummary();
    });
  });

  $$("[data-range]").forEach(button => button.addEventListener("click", () => {
    historyRange = Number(button.dataset.range);
    $$("[data-range]").forEach(item => item.classList.toggle("active", item === button));
    renderChart();
    renderInsights();
  }));
  $("#recordsList").addEventListener("click", event => {
    const button = event.target.closest(".record-delete");
    const row = event.target.closest(".record-row");
    if (button && row) deleteSession(row.dataset.id);
  });
  $("#recordSearch").addEventListener("input", event => { recordQuery = event.target.value; renderRecords(); });
  $("#recordFilter").addEventListener("change", event => { recordFilter = event.target.value; renderRecords(); });

  $("#openSettings").addEventListener("click", openSettings);
  $("#closeSettings").addEventListener("click", closeSettings);
  $("#settingsModal").addEventListener("click", event => { if (event.target === $("#settingsModal")) closeSettings(); });
  $("#settingsForm").addEventListener("submit", saveSettings);
  $("#exportData").addEventListener("click", handleExportData);
  $("#importData").addEventListener("click", handleImportData);
  $("#backupNow").addEventListener("click", handleBackupNow);
  $("#openDataFolder").addEventListener("click", handleOpenDataFolder);
  $("#importFileInput").addEventListener("change", async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return showToast("备份文件超过 10 MB");
    await applyImportedContent(await file.text());
  });
  $("#toastAction").addEventListener("click", () => {
    const handler = toastActionHandler;
    if (!handler) return;
    clearTimeout(toastTimeout);
    toastActionHandler = null;
    $("#toast").classList.remove("show");
    $("#toastAction").classList.add("hidden");
    handler();
  });

  document.addEventListener("keydown", event => {
    const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName);
    if (event.code === "Escape") closeSettings();
    if (typing || $("#settingsModal").classList.contains("open")) return;
    if (event.key === "/" && $("#view-tasks").classList.contains("active")) {
      event.preventDefault();
      $("#taskSearch").focus();
      return;
    }
    if (event.key.toLowerCase() === "n" && $("#view-tasks").classList.contains("active")) {
      event.preventDefault();
      $("#taskAddInput").focus();
      return;
    }
    if (event.code === "Space") { event.preventDefault(); toggleTimer(); }
    if (event.key.toLowerCase() === "r") resetTimer();
  });

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    $("#installApp").classList.remove("hidden");
  });
  $("#installApp").addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    $("#installApp").classList.add("hidden");
  });
}

function renderAll() {
  renderDate();
  renderSummary();
  renderTimer();
  renderTodos();
  renderHistory();
}

function init() {
  bindEvents();
  syncRunningTimer();
  renderAll();
  // 桌面版首次启动时立即创建数据文件，并把已有浏览器数据迁移进去。
  saveState();
  if (state.timer.running) startTimerLoop();
  const quotes = [
    "不必一次看清全部台阶，迈出第一步就好。",
    "真正的进步，藏在那些无人喝彩的专注里。",
    "慢一点没有关系，只要今天仍在向前。",
    "把眼前这一页读好，未来就会多一种可能。",
    "你认真度过的每一分钟，都在回答未来。"
  ];
  $("#dailyQuote").textContent = quotes[new Date().getDate() % quotes.length];
  refreshDataSafetyInfo();
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
}

init();
