const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeDueDate, getTaskDueInfo, sortTasks, filterTasks, getTaskStats } = require("../task-helpers.js");

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

test("截止日期会区分逾期、今天、明天和未来", () => {
  const today = "2026-08-10";
  assert.equal(getTaskDueInfo({ dueDate: "2026-08-08" }, today).kind, "overdue");
  assert.equal(getTaskDueInfo({ dueDate: "2026-08-10" }, today).label, "今天截止");
  assert.equal(getTaskDueInfo({ dueDate: "2026-08-11" }, today).label, "明天截止");
  assert.equal(getTaskDueInfo({ dueDate: "2026-08-20" }, today).kind, "upcoming");
  assert.equal(normalizeDueDate("2026-02-30"), "");
});

test("逾期任务最优先，并可筛出今天需要处理的任务", () => {
  const today = "2026-08-10";
  const datedTasks = [
    { id: "future", title: "未来", completed: false, pinned: true, dueDate: "2026-08-12", createdAt: "2026-08-01T00:00:00.000Z" },
    { id: "overdue", title: "逾期", completed: false, pinned: false, dueDate: "2026-08-09", createdAt: "2026-08-01T00:00:00.000Z" },
    { id: "today", title: "今天", completed: false, pinned: false, dueDate: "2026-08-10", createdAt: "2026-08-01T00:00:00.000Z" },
    { id: "done", title: "已完成", completed: true, dueDate: "2026-08-08", createdAt: "2026-08-01T00:00:00.000Z" }
  ];
  assert.deepEqual(sortTasks(datedTasks, today).map(task => task.id), ["overdue", "future", "today", "done"]);
  assert.deepEqual(filterTasks(datedTasks, "today", "", today).map(task => task.id), ["overdue", "today"]);
});
