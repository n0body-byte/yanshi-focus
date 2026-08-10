(function exposeTaskHelpers(root, factory) {
  const helpers = factory();
  if (typeof module === "object" && module.exports) module.exports = helpers;
  if (root) root.YanShiTaskHelpers = helpers;
})(typeof globalThis === "undefined" ? this : globalThis, () => {
  function normalizeDueDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return "";
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(0);
    date.setFullYear(year, month - 1, day);
    date.setHours(0, 0, 0, 0);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? match[0] : "";
  }

  function dateKey(value = new Date()) {
    if (typeof value === "string") return normalizeDueDate(value);
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const pad = number => String(number).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function dayNumber(key) {
    const [year, month, day] = key.split("-").map(Number);
    return Date.UTC(year, month - 1, day) / 86400000;
  }

  function getTaskDueInfo(todo, today = new Date()) {
    const dueDate = normalizeDueDate(todo?.dueDate);
    const todayKey = dateKey(today);
    if (!dueDate || !todayKey) return { kind: "none", label: "", days: null, dueDate: "" };
    const days = dayNumber(dueDate) - dayNumber(todayKey);
    const [, month, day] = dueDate.split("-").map(Number);
    if (todo?.completed === true) return { kind: "done", label: `截止 ${month}月${day}日`, days, dueDate };
    if (days < 0) return { kind: "overdue", label: `已逾期 ${Math.abs(days)} 天`, days, dueDate };
    if (days === 0) return { kind: "today", label: "今天截止", days, dueDate };
    if (days === 1) return { kind: "tomorrow", label: "明天截止", days, dueDate };
    return { kind: "upcoming", label: `${month}月${day}日截止`, days, dueDate };
  }

  function normalizePomodoroEstimate(value) {
    const estimate = Number(value);
    return Number.isFinite(estimate) && estimate > 0 ? Math.min(99, Math.floor(estimate)) : 0;
  }

  function sortTasks(todos, today = new Date()) {
    return [...(Array.isArray(todos) ? todos : [])].sort((a, b) => {
      const completedOrder = Number(a.completed === true) - Number(b.completed === true);
      if (completedOrder) return completedOrder;
      if (a.completed !== true) {
        const aDue = getTaskDueInfo(a, today);
        const bDue = getTaskDueInfo(b, today);
        const overdueOrder = Number(aDue.kind !== "overdue") - Number(bDue.kind !== "overdue");
        if (overdueOrder) return overdueOrder;
        const pinnedOrder = Number(b.pinned === true) - Number(a.pinned === true);
        if (pinnedOrder) return pinnedOrder;
        const datedOrder = Number(!aDue.dueDate) - Number(!bDue.dueDate);
        if (datedOrder) return datedOrder;
        const dueDateOrder = aDue.dueDate.localeCompare(bDue.dueDate);
        if (dueDateOrder) return dueDateOrder;
      }
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  }

  function filterTasks(todos, filter = "all", query = "", today = new Date()) {
    const normalizedQuery = String(query).trim().toLocaleLowerCase("zh-CN");
    return (Array.isArray(todos) ? todos : []).filter(todo => {
      const matchesFilter = filter === "all"
        || (filter === "open" && todo.completed !== true)
        || (filter === "done" && todo.completed === true)
        || (filter === "today" && todo.completed !== true && (getTaskDueInfo(todo, today).days ?? 1) <= 0);
      const matchesQuery = !normalizedQuery
        || String(todo.title || "").toLocaleLowerCase("zh-CN").includes(normalizedQuery);
      return matchesFilter && matchesQuery;
    });
  }

  function getTaskStats(taskId, sessions) {
    return (Array.isArray(sessions) ? sessions : []).reduce((stats, session) => {
      if (session?.type !== "focus" || session.taskId !== taskId) return stats;
      stats.sessionCount += 1;
      if (session.completed === true) stats.completedSessionCount += 1;
      stats.durationSeconds += Math.max(0, Number(session.durationSeconds) || 0);
      return stats;
    }, { sessionCount: 0, completedSessionCount: 0, durationSeconds: 0 });
  }

  function getTaskPomodoroProgress(todo, sessions) {
    const estimated = normalizePomodoroEstimate(todo?.estimatedPomodoros);
    const completed = getTaskStats(todo?.id, sessions).completedSessionCount;
    return {
      estimated,
      completed,
      remaining: estimated ? Math.max(0, estimated - completed) : 0,
      percentage: estimated ? Math.min(100, Math.round(completed / estimated * 100)) : 0
    };
  }

  return { normalizeDueDate, getTaskDueInfo, normalizePomodoroEstimate, sortTasks, filterTasks, getTaskStats, getTaskPomodoroProgress };
});
