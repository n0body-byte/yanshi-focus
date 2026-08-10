const test = require("node:test");
const assert = require("node:assert/strict");
const { buildSessionCsv, csvCell } = require("../export-helpers.js");

test("CSV 单元格会正确转义逗号、引号和换行", () => {
  assert.equal(csvCell('英语,阅读"精练"'), '"英语,阅读""精练"""');
  assert.equal(csvCell("普通任务"), "普通任务");
  assert.equal(csvCell("两行\n任务"), '"两行\n任务"');
});

test("专注明细 CSV 带 UTF-8 BOM 并保留筛选顺序", () => {
  const csv = buildSessionCsv([
    { taskTitle: "数学真题", note: "订正第 12 题", startedAt: "2026-08-10T01:00:00.000Z", endedAt: "2026-08-10T01:25:00.000Z", durationSeconds: 1500, completed: true },
    { taskTitle: "英语,阅读", startedAt: "2026-08-09T01:00:00.000Z", endedAt: "2026-08-09T01:10:00.000Z", durationSeconds: 600, completed: false }
  ]);
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  assert.match(csv, /^\uFEFF任务,备注,开始时间,结束时间,专注分钟,完成方式\r\n/);
  assert.match(csv, /数学真题,订正第 12 题,/);
  assert.ok(csv.indexOf("数学真题") < csv.indexOf('"英语,阅读"'));
  assert.match(csv, /25\.0,完整番茄/);
  assert.match(csv, /10\.0,提前完成/);
});
