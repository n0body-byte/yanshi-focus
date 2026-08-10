(function exposeExportHelpers(root, factory) {
  const helpers = factory();
  if (typeof module === "object" && module.exports) module.exports = helpers;
  if (root) root.YanShiExportHelpers = helpers;
})(typeof globalThis === "undefined" ? this : globalThis, () => {
  function csvCell(value) {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function formatLocalDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  function buildSessionCsv(sessions) {
    const header = ["任务", "备注", "开始时间", "结束时间", "专注分钟", "完成方式"];
    const rows = (Array.isArray(sessions) ? sessions : []).map(session => [
      session?.taskTitle || "自由专注",
      session?.note || "",
      formatLocalDateTime(session?.startedAt),
      formatLocalDateTime(session?.endedAt),
      (Math.max(0, Number(session?.durationSeconds) || 0) / 60).toFixed(1),
      session?.source === "manual" ? "手动补记" : (session?.completed === true ? "完整番茄" : "提前完成")
    ]);
    return `\uFEFF${[header, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n")}`;
  }

  return { buildSessionCsv, csvCell, formatLocalDateTime };
});
