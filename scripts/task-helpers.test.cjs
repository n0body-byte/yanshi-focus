const test = require("node:test");
const assert = require("node:assert/strict");
const { sortTasks, filterTasks, getTaskStats } = require("../task-helpers.js");

const tasks = [
  { id: "done", title: "完成的英语", completed: true, pinned: true, createdAt: "2026-08-03T08:00:00.000Z" },
  { id: "normal", title: "数学错题", completed: false, pinned: false, createdAt: "2026-08-04T08:00:00.000Z" },
  { id: "pinned", title: "英语阅读", completed: false, pinned: true, createdAt: "2026-08-02T08:00:00.000Z" }
];

test("待完成任务优先，置顶任务排在同状态任务之前", () => {
  assert.deepEqual(sortTasks(tasks).map(task => task.id), ["pinned", "normal", "done"]);
});

test("任务状态筛选与关键词搜索可以组合使用", () => {
  assert.deepEqual(filterTasks(tasks, "open", "英语").map(task => task.id), ["pinned"]);
  assert.deepEqual(filterTasks(tasks, "done", "英语").map(task => task.id), ["done"]);
  assert.equal(filterTasks(tasks, "all", "不存在").length, 0);
});

test("任务投入统计只累计关联的专注记录", () => {
  const sessions = [
    { type: "focus", taskId: "pinned", durationSeconds: 1500 },
    { type: "focus", taskId: "pinned", durationSeconds: 600 },
    { type: "focus", taskId: "normal", durationSeconds: 900 },
    { type: "break", taskId: "pinned", durationSeconds: 300 }
  ];
  assert.deepEqual(getTaskStats("pinned", sessions), { sessionCount: 2, durationSeconds: 2100 });
});
