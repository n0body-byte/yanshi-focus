(function exposeTimerHelpers(root, factory) {
  const helpers = factory();
  if (typeof module === "object" && module.exports) module.exports = helpers;
  if (root) root.YanShiTimerHelpers = helpers;
})(typeof globalThis === "undefined" ? this : globalThis, () => {
  function getNextTimerMode(finishedMode, completedRounds, longBreakInterval = 4) {
    if (finishedMode !== "focus") return "focus";
    const interval = Math.min(8, Math.max(2, Math.floor(Number(longBreakInterval) || 4)));
    const rounds = Math.max(0, Math.floor(Number(completedRounds) || 0));
    return rounds > 0 && rounds % interval === 0 ? "long" : "short";
  }

  function getRemainingSeconds(endAt, now = Date.now()) {
    const endTime = Number(endAt);
    const currentTime = Number(now);
    if (!Number.isFinite(endTime) || !Number.isFinite(currentTime)) return 0;
    return Math.max(0, Math.ceil((endTime - currentTime) / 1000));
  }

  return { getNextTimerMode, getRemainingSeconds };
});
