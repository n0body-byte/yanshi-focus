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

  return { getNextTimerMode };
});
