const test = require("node:test");
const assert = require("node:assert/strict");
const { analyzeFocusSessions, getTimeBand } = require("../insight-helpers.js");

test("专注洞察只统计所选自然日范围内的记录", () => {
  const now = new Date(2026, 7, 9, 20, 0, 0);
  const sessions = [
    { type: "focus", startedAt: new Date(2026, 7, 9, 9, 0).toISOString(), durationSeconds: 1500, completed: true, taskId: "math", taskTitle: "数学" },
    { type: "focus", startedAt: new Date(2026, 7, 3, 19, 0).toISOString(), durationSeconds: 900, completed: false, taskId: "english", taskTitle: "英语" },
    { type: "focus", startedAt: new Date(2026, 7, 2, 23, 0).toISOString(), durationSeconds: 3600, completed: true, taskId: "old", taskTitle: "范围外" }
  ];
  const result = analyzeFocusSessions(sessions, 7, now);
  assert.equal(result.totalSeconds, 2400);
  assert.equal(result.activeDays, 2);
  assert.equal(result.sessionCount, 2);
  assert.equal(result.completionRate, 50);
});

test("任务投入会按任务合并并按时长降序排列", () => {
  const now = new Date(2026, 7, 9, 20, 0, 0);
  const sessions = [
    { type: "focus", startedAt: new Date(2026, 7, 9, 9, 0).toISOString(), durationSeconds: 1200, taskId: "math", taskTitle: "数学" },
    { type: "focus", startedAt: new Date(2026, 7, 9, 10, 0).toISOString(), durationSeconds: 900, taskId: "math", taskTitle: "数学真题" },
    { type: "focus", startedAt: new Date(2026, 7, 9, 19, 0).toISOString(), durationSeconds: 1500, taskId: "english", taskTitle: "英语" }
  ];
  const result = analyzeFocusSessions(sessions, 7, now);
  assert.deepEqual(result.topTasks.map(task => [task.taskId, task.durationSeconds, task.sessionCount]), [
    ["math", 2100, 2],
    ["english", 1500, 1]
  ]);
  assert.equal(result.peakBand, "上午 09–11");
});

test("无记录时返回稳定的零值洞察", () => {
  const result = analyzeFocusSessions([], 30, new Date(2026, 7, 9, 20, 0, 0));
  assert.equal(result.dailyAverageSeconds, 0);
  assert.equal(result.completionRate, 0);
  assert.equal(result.peakBand, "暂无数据");
  assert.deepEqual(result.topTasks, []);
  assert.equal(getTimeBand(1).label, "深夜 23–04");
});
