const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createStorageManager, validateContent } = require("../storage-manager.cjs");

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "yanshi-storage-"));
  let currentTime = new Date(2026, 0, 1, 9, 0, 0);
  const dataFile = path.join(root, "yanshi-data.json");
  const backupDir = path.join(root, "backups");
  const manager = createStorageManager({ dataFile, backupDir, now: () => new Date(currentTime) });
  return {
    root,
    dataFile,
    manager,
    setTime(value) { currentTime = new Date(value); },
    cleanup() { fs.rmSync(root, { recursive: true, force: true }); }
  };
}

test("保存时每天生成一个快照并保留最近七份", () => {
  const fixture = createFixture();
  try {
    const first = JSON.stringify({ todos: [{ id: "1" }] });
    const second = JSON.stringify({ todos: [{ id: "2" }] });
    fixture.manager.saveData(first);
    assert.equal(fixture.manager.listBackups().length, 1);

    fixture.manager.saveData(second);
    assert.equal(fixture.manager.listBackups().length, 1);
    assert.equal(fs.readFileSync(fixture.manager.listBackups()[0].path, "utf8"), first);

    for (let day = 2; day <= 10; day += 1) {
      fixture.setTime(new Date(2026, 0, day, 9, 0, 0));
      fixture.manager.saveData(JSON.stringify({ day }));
    }
    const backups = fixture.manager.listBackups();
    assert.equal(backups.length, 7);
    assert.match(backups[0].name, /2026-01-10-auto/);
    assert.equal(JSON.parse(fs.readFileSync(fixture.dataFile, "utf8")).day, 10);
  } finally {
    fixture.cleanup();
  }
});

test("手动备份进入滚动备份列表", () => {
  const fixture = createFixture();
  try {
    const content = JSON.stringify({ sessions: [1, 2, 3] });
    fixture.manager.saveData(content);
    fixture.setTime(new Date(2026, 0, 1, 12, 30, 45));
    const backupPath = fixture.manager.createManualBackup(content);
    assert.match(path.basename(backupPath), /2026-01-01-12-30-45-manual\.json/);
    assert.equal(fixture.manager.getInfo().backupCount, 2);
  } finally {
    fixture.cleanup();
  }
});

test("只能按已存在的安全名称读取备份", () => {
  const fixture = createFixture();
  try {
    const content = JSON.stringify({ todos: [{ id: "safe" }] });
    const backupPath = fixture.manager.createManualBackup(content);
    assert.equal(fixture.manager.readBackup(path.basename(backupPath)), content);
    assert.throws(() => fixture.manager.readBackup("..\\yanshi-data.json"), /找不到指定备份/);
  } finally {
    fixture.cleanup();
  }
});

test("损坏数据会被隔离且不会阻止启动", () => {
  const fixture = createFixture();
  try {
    fs.mkdirSync(path.dirname(fixture.dataFile), { recursive: true });
    fs.writeFileSync(fixture.dataFile, "not-json", "utf8");
    assert.equal(fixture.manager.loadData(), null);
    const corruptFiles = fs.readdirSync(fixture.root).filter(name => name.includes(".corrupt-"));
    assert.equal(corruptFiles.length, 1);
  } finally {
    fixture.cleanup();
  }
});

test("拒绝非法或过大的数据内容", () => {
  assert.throws(() => validateContent("[]"), /JSON 对象/);
  assert.throws(() => validateContent("not-json"));
  assert.throws(() => validateContent(JSON.stringify({ payload: "x".repeat(10 * 1024 * 1024) })), /10 MB/);
});
