(function exposeTaskHelpers(root, factory) {
  const helpers = factory();
  if (typeof module === "object" && module.exports) module.exports = helpers;
  if (root) root.YanShiTaskHelpers = helpers;
})(typeof globalThis === "undefined" ? this : globalThis, () => {
  function sortTasks(todos) {
    return [...(Array.isArray(todos) ? todos : [])].sort((a, b) => {
      return Number(a.completed === true) - Number(b.completed === true)
        || Number(b.pinned === true) - Number(a.pinned === true)
        || new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  }

  function filterTasks(todos, filter = "all", query = "") {
    const normalizedQuery = String(query).trim().toLocaleLowerCase("zh-CN");
    return (Array.isArray(todos) ? todos : []).filter(todo => {
      const matchesFilter = filter === "all"
        || (filter === "open" ? todo.completed !== true : todo.completed === true);
      const matchesQuery = !normalizedQuery
        || String(todo.title || "").toLocaleLowerCase("zh-CN").includes(normalizedQuery);
      return matchesFilter && matchesQuery;
    });
  }

  function getTaskStats(taskId, sessions) {
    return (Array.isArray(sessions) ? sessions : []).reduce((stats, session) => {
      if (session?.type !== "focus" || session.taskId !== taskId) return stats;
      stats.sessionCount += 1;
      stats.durationSeconds += Math.max(0, Number(session.durationSeconds) || 0);
      return stats;
    }, { sessionCount: 0, durationSeconds: 0 });
  }

  return { sortTasks, filterTasks, getTaskStats };
});
