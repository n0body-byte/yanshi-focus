function normalizeDesktopTimerStatus(value) {
  const status = value && typeof value === "object" ? value : {};
  const progress = Number(status.progress);
  const running = status.running === true;
  const mode = ["focus", "short", "long"].includes(status.mode) ? status.mode : "focus";
  const keepAwake = status.keepAwake !== false;
  return {
    running,
    mode,
    keepAwake,
    progress: Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0,
    shouldBlockDisplaySleep: running && mode === "focus" && keepAwake,
    taskbarProgress: running ? (Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0) : -1
  };
}

function shouldHideWindowOnClose(closeToTray, isQuitting) {
  return closeToTray === true && isQuitting !== true;
}

function resolveLaunchAtLogin(enabled, isPackaged) {
  return isPackaged === true ? enabled === true : null;
}

module.exports = { normalizeDesktopTimerStatus, shouldHideWindowOnClose, resolveLaunchAtLogin };
