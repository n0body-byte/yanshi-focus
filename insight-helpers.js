(function exposeInsightHelpers(root, factory) {
  const helpers = factory();
  if (typeof module === "object" && module.exports) module.exports = helpers;
  if (root) root.YanShiInsightHelpers = helpers;
})(typeof globalThis === "undefined" ? this : globalThis, () => {
  const TIME_BANDS = [
    { key: "early", label: "清晨 05–08", start: 5, end: 9 },
    { key: "morning", label: "上午 09–11", start: 9, end: 12 },
    { key: "afternoon", label: "下午 12–17", start: 12, end: 18 },
    { key: "evening", label: "晚间 18–22", start: 18, end: 23 },
    { key: "late", label: "深夜 23–04", start: 23, end: 29 }
  ];

  function localDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function getTimeBand(hour) {
    const normalizedHour = hour < 5 ? hour + 24 : hour;
    return TIME_BANDS.find(band => normalizedHour >= band.start && normalizedHour < band.end) || TIME_BANDS[4];
  }

  function analyzeFocusSessions(sessions, days, now = new Date()) {
    const safeDays = Math.max(1, Math.floor(Number(days) || 1));
    const rangeEnd = new Date(now);
    const rangeStart = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate());
    rangeStart.setDate(rangeStart.getDate() - safeDays + 1);
    const activeDays = new Set();
    const taskTotals = new Map();
    const bandTotals = new Map(TIME_BANDS.map(band => [band.key, 0]));
    let totalSeconds = 0;
    let completedCount = 0;
    let sessionCount = 0;

    for (const session of Array.isArray(sessions) ? sessions : []) {
      if (session?.type !== "focus") continue;
      const startedAt = new Date(session.startedAt);
      const durationSeconds = Math.max(0, Number(session.durationSeconds) || 0);
      if (Number.isNaN(startedAt.getTime()) || startedAt < rangeStart || startedAt > rangeEnd || durationSeconds <= 0) continue;

      totalSeconds += durationSeconds;
      sessionCount += 1;
      if (session.completed === true) completedCount += 1;
      activeDays.add(localDateKey(startedAt));

      const band = getTimeBand(startedAt.getHours());
      bandTotals.set(band.key, bandTotals.get(band.key) + durationSeconds);

      const taskId = typeof session.taskId === "string" ? session.taskId : "";
      const title = String(session.taskTitle || "自由专注").slice(0, 80);
      const taskKey = taskId || `title:${title}`;
      const existing = taskTotals.get(taskKey) || { taskId, title, durationSeconds: 0, sessionCount: 0 };
      existing.durationSeconds += durationSeconds;
      existing.sessionCount += 1;
      existing.title = title;
      taskTotals.set(taskKey, existing);
    }

    const peakBand = TIME_BANDS
      .map(band => ({ ...band, durationSeconds: bandTotals.get(band.key) }))
      .sort((a, b) => b.durationSeconds - a.durationSeconds)[0];

    return {
      days: safeDays,
      totalSeconds,
      dailyAverageSeconds: Math.round(totalSeconds / safeDays),
      activeDays: activeDays.size,
      sessionCount,
      completionRate: sessionCount ? Math.round(completedCount / sessionCount * 100) : 0,
      peakBand: peakBand?.durationSeconds ? peakBand.label : "暂无数据",
      topTasks: [...taskTotals.values()].sort((a, b) => b.durationSeconds - a.durationSeconds).slice(0, 5)
    };
  }

  function filterFocusRecords(sessions, status = "all", query = "") {
    const normalizedQuery = String(query).trim().toLocaleLowerCase("zh-CN");
    return (Array.isArray(sessions) ? sessions : []).filter(session => {
      if (session?.type !== "focus") return false;
      if (status === "completed" && session.completed !== true) return false;
      if (status === "early" && session.completed === true) return false;
      const searchable = `${session.taskTitle || "自由专注"} ${session.note || ""}`.toLocaleLowerCase("zh-CN");
      return !normalizedQuery || searchable.includes(normalizedQuery);
    });
  }

  function calculateGoalProgress(seconds, targetHours) {
    const totalSeconds = Math.max(0, Number(seconds) || 0);
    const targetSeconds = Math.max(1, Number(targetHours) || 1) * 3600;
    return {
      percentage: Math.min(100, Math.round(totalSeconds / targetSeconds * 100)),
      remainingSeconds: Math.max(0, targetSeconds - totalSeconds),
      reached: totalSeconds >= targetSeconds
    };
  }

  return { analyzeFocusSessions, calculateGoalProgress, filterFocusRecords, getTimeBand };
});
