const test = require("node:test");
const assert = require("node:assert/strict");
const { getNextTimerMode, getRemainingSeconds } = require("../timer-helpers.js");

test("完成指定轮数后进入长休息", () => {
  assert.equal(getNextTimerMode("focus", 3, 3), "long");
  assert.equal(getNextTimerMode("focus", 2, 3), "short");
  assert.equal(getNextTimerMode("focus", 4, 4), "long");
});

test("任何休息结束后都回到专注模式", () => {
  assert.equal(getNextTimerMode("short", 2, 4), "focus");
  assert.equal(getNextTimerMode("long", 4, 4), "focus");
});

test("非法长休息间隔会回退并限制在 2 到 8 轮", () => {
  assert.equal(getNextTimerMode("focus", 4, "invalid"), "long");
  assert.equal(getNextTimerMode("focus", 2, 1), "long");
  assert.equal(getNextTimerMode("focus", 8, 99), "long");
});

test("剩余秒数按结束时间校准并避免负数", () => {
  assert.equal(getRemainingSeconds(10_500, 10_000), 1);
  assert.equal(getRemainingSeconds(10_001, 10_000), 1);
  assert.equal(getRemainingSeconds(9_000, 10_000), 0);
  assert.equal(getRemainingSeconds("invalid", 10_000), 0);
});
