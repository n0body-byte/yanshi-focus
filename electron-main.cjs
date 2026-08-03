const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("fs");
const path = require("path");

// 固定数据目录，避免应用升级、安装路径变化或使用便携版时丢失历史记录。
app.setPath("userData", process.env.YANSHI_DATA_DIR || path.join(app.getPath("appData"), "YanShi"));
app.setAppUserModelId("com.yanshi.focus");

const DATA_FILE = path.join(app.getPath("userData"), "yanshi-data.json");
const TEMP_FILE = `${DATA_FILE}.tmp`;
const TEST_MODE = process.env.YANSHI_TEST_MODE === "1";
let mainWindow = null;
let pendingData = null;
let saveTimer = null;

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) return null;
    const content = fs.readFileSync(DATA_FILE, "utf8");
    JSON.parse(content);
    return content;
  } catch (error) {
    try {
      if (fs.existsSync(DATA_FILE)) {
        fs.copyFileSync(DATA_FILE, `${DATA_FILE}.corrupt-${Date.now()}`);
      }
    } catch { /* 保留原文件失败时仍允许应用启动。 */ }
    return null;
  }
}

function flushData() {
  if (!pendingData) return;
  const content = pendingData;
  pendingData = null;
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(TEMP_FILE, content, "utf8");
    fs.renameSync(TEMP_FILE, DATA_FILE);
  } catch (error) {
    pendingData = content;
    console.error("保存专注数据失败：", error.message);
  }
}

function queueDataSave(content) {
  if (typeof content !== "string" || content.length > 10 * 1024 * 1024) return;
  try {
    JSON.parse(content);
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
  app.on("before-quit", flushData);
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
}
