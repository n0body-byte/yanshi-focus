const { app, BrowserWindow, dialog, ipcMain, powerSaveBlocker, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const { createStorageManager } = require("./storage-manager.cjs");
const { normalizeDesktopTimerStatus } = require("./desktop-timer-helpers.cjs");

// 固定数据目录，避免应用升级、安装路径变化或使用便携版时丢失历史记录。
app.setPath("userData", process.env.YANSHI_DATA_DIR || path.join(app.getPath("appData"), "YanShi"));
app.setAppUserModelId("com.yanshi.focus");

const DATA_FILE = path.join(app.getPath("userData"), "yanshi-data.json");
const BACKUP_DIR = path.join(app.getPath("userData"), "backups");
const storageManager = createStorageManager({ dataFile: DATA_FILE, backupDir: BACKUP_DIR });
const TEST_MODE = process.env.YANSHI_TEST_MODE === "1";
let mainWindow = null;
let pendingData = null;
let saveTimer = null;
let displaySleepBlockerId = null;

function loadData() {
  return storageManager.loadData();
}

function flushData() {
  if (!pendingData) return;
  const content = pendingData;
  pendingData = null;
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    storageManager.saveData(content);
  } catch (error) {
    pendingData = content;
    console.error("保存专注数据失败：", error.message);
  }
}

function queueDataSave(content) {
  try {
    storageManager.validateContent(content);
  } catch {
    return;
  }
  pendingData = content;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushData, 250);
}

ipcMain.on("storage:load", event => { event.returnValue = loadData(); });
ipcMain.on("storage:path", event => { event.returnValue = DATA_FILE; });
ipcMain.on("storage:save", (_event, content) => queueDataSave(content));

ipcMain.on("timer:status", (_event, value) => {
  const status = normalizeDesktopTimerStatus(value);
  if (status.shouldBlockDisplaySleep && displaySleepBlockerId === null) {
    displaySleepBlockerId = powerSaveBlocker.start("prevent-display-sleep");
  } else if (!status.shouldBlockDisplaySleep && displaySleepBlockerId !== null) {
    if (powerSaveBlocker.isStarted(displaySleepBlockerId)) powerSaveBlocker.stop(displaySleepBlockerId);
    displaySleepBlockerId = null;
  }
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setProgressBar(status.taskbarProgress);
});

ipcMain.handle("storage:info", () => storageManager.getInfo());

ipcMain.handle("storage:export", async (_event, content) => {
  storageManager.validateContent(content);
  const date = new Date().toISOString().slice(0, 10);
  const options = {
    title: "导出研时数据",
    defaultPath: path.join(app.getPath("documents"), `研时数据-${date}.json`),
    filters: [{ name: "JSON 数据文件", extensions: ["json"] }]
  };
  const result = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  fs.writeFileSync(result.filePath, content, "utf8");
  return { ok: true, path: result.filePath };
});

ipcMain.handle("storage:export-csv", async (_event, content) => {
  if (typeof content !== "string" || Buffer.byteLength(content, "utf8") > 10 * 1024 * 1024) throw new Error("CSV 内容无效或超过 10 MB");
  const date = new Date().toISOString().slice(0, 10);
  const options = {
    title: "导出专注明细",
    defaultPath: path.join(app.getPath("documents"), `研时专注明细-${date}.csv`),
    filters: [{ name: "CSV 表格", extensions: ["csv"] }]
  };
  const result = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  fs.writeFileSync(result.filePath, content, "utf8");
  return { ok: true, path: result.filePath };
});

ipcMain.handle("storage:import", async () => {
  const options = {
    title: "导入研时数据",
    properties: ["openFile"],
    filters: [{ name: "JSON 数据文件", extensions: ["json"] }]
  };
  const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
  const filePath = result.filePaths[0];
  if (fs.statSync(filePath).size > 10 * 1024 * 1024) throw new Error("数据文件超过 10 MB");
  const content = fs.readFileSync(filePath, "utf8");
  storageManager.validateContent(content);
  return { ok: true, path: filePath, content };
});

ipcMain.handle("storage:backup-now", (_event, content) => {
  const backupPath = storageManager.createManualBackup(content);
  return { ok: true, path: backupPath, ...storageManager.getInfo() };
});

ipcMain.handle("storage:open-folder", async () => {
  const info = storageManager.getInfo();
  if (fs.existsSync(DATA_FILE)) shell.showItemInFolder(DATA_FILE);
  else await shell.openPath(info.dataDir);
  return { ok: true };
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    backgroundColor: "#f4f2ec",
    icon: path.join(__dirname, "build", "icon.ico"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.removeMenu();
  mainWindow.loadFile("index.html");
  mainWindow.once("ready-to-show", () => { if (!TEST_MODE) mainWindow.show(); });
  if (TEST_MODE) {
    mainWindow.webContents.once("did-finish-load", () => setTimeout(() => app.quit(), 800));
  }
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.on("closed", () => { mainWindow = null; });
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(createWindow);
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  app.on("before-quit", () => {
    if (displaySleepBlockerId !== null && powerSaveBlocker.isStarted(displaySleepBlockerId)) powerSaveBlocker.stop(displaySleepBlockerId);
    displaySleepBlockerId = null;
    flushData();
  });
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
}
