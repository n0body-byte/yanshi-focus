const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeDesktopTimerStatus, shouldHideWindowOnClose } = require("../desktop-timer-helpers.cjs");

test("运行中的专注按设置启用防休眠与任务栏进度", () => {
  assert.deepEqual(normalizeDesktopTimerStatus({ running: true, mode: "focus", keepAwake: true, progress: 0.42 }), {
    running: true,
    mode: "focus",
    keepAwake: true,
    progress: 0.42,
    shouldBlockDisplaySleep: true,
    taskbarProgress: 0.42
  });
});

test("休息、暂停或关闭设置时不会阻止屏幕休眠", () => {
  assert.equal(normalizeDesktopTimerStatus({ running: true, mode: "short", keepAwake: true }).shouldBlockDisplaySleep, false);
  assert.equal(normalizeDesktopTimerStatus({ running: false, mode: "focus", keepAwake: true }).shouldBlockDisplaySleep, false);
  assert.equal(normalizeDesktopTimerStatus({ running: true, mode: "focus", keepAwake: false }).shouldBlockDisplaySleep, false);
});

test("任务栏进度会限制在有效范围并在停止时清除", () => {
  assert.equal(normalizeDesktopTimerStatus({ running: true, progress: 2 }).taskbarProgress, 1);
  assert.equal(normalizeDesktopTimerStatus({ running: true, progress: -2 }).taskbarProgress, 0);
  assert.equal(normalizeDesktopTimerStatus({ running: false, progress: 0.5 }).taskbarProgress, -1);
});

test("只有开启托盘且不是明确退出时才隐藏窗口", () => {
  assert.equal(shouldHideWindowOnClose(true, false), true);
  assert.equal(shouldHideWindowOnClose(false, false), false);
  assert.equal(shouldHideWindowOnClose(true, true), false);
});
