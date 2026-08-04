const fs = require("fs");
const path = require("path");

const MAX_CONTENT_BYTES = 10 * 1024 * 1024;

function dateStamp(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timeStamp(date) {
  const time = [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map(value => String(value).padStart(2, "0"))
    .join("-");
  return `${dateStamp(date)}-${time}`;
}

function validateContent(content) {
  if (typeof content !== "string" || Buffer.byteLength(content, "utf8") > MAX_CONTENT_BYTES) {
    throw new Error("数据文件无效或超过 10 MB");
  }
  const parsed = JSON.parse(content);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("数据文件必须包含一个 JSON 对象");
  }
  return parsed;
}

function createStorageManager({ dataFile, backupDir, maxBackups = 7, now = () => new Date() }) {
  const tempFile = `${dataFile}.tmp`;

  function ensureDirectories() {
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    fs.mkdirSync(backupDir, { recursive: true });
  }

  function listBackups() {
    ensureDirectories();
    return fs.readdirSync(backupDir)
      .filter(name => /^yanshi-data-.*\.json$/i.test(name))
      .map(name => {
        const filePath = path.join(backupDir, name);
        const stat = fs.statSync(filePath);
        return { name, path: filePath, createdAt: stat.mtime.toISOString(), mtimeMs: stat.mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
  }

  function pruneBackups() {
    const backups = listBackups();
    backups.slice(maxBackups).forEach(item => fs.unlinkSync(item.path));
    return backups.slice(0, maxBackups);
  }

  function writeBackup(content, fileName) {
    validateContent(content);
    ensureDirectories();
    const filePath = path.join(backupDir, fileName);
    const backupTempFile = `${filePath}.tmp`;
    fs.writeFileSync(backupTempFile, content, "utf8");
    fs.renameSync(backupTempFile, filePath);
    const backupTime = now();
    fs.utimesSync(filePath, backupTime, backupTime);
    pruneBackups();
    return filePath;
  }

  function ensureDailyBackup(content) {
    const fileName = `yanshi-data-${dateStamp(now())}-auto.json`;
    const filePath = path.join(backupDir, fileName);
    if (!fs.existsSync(filePath)) writeBackup(content, fileName);
    return filePath;
  }

  function createManualBackup(content) {
    return writeBackup(content, `yanshi-data-${timeStamp(now())}-manual.json`);
  }

  function loadData() {
    try {
      if (!fs.existsSync(dataFile)) return null;
      const content = fs.readFileSync(dataFile, "utf8");
      validateContent(content);
      return content;
    } catch {
      try {
        if (fs.existsSync(dataFile)) {
          fs.copyFileSync(dataFile, `${dataFile}.corrupt-${now().getTime()}`);
        }
      } catch { /* 保留原文件失败时仍允许应用启动。 */ }
      return null;
    }
  }

  function saveData(content) {
    validateContent(content);
    ensureDirectories();
    const hadExistingData = fs.existsSync(dataFile);
    if (hadExistingData) {
      const previousContent = fs.readFileSync(dataFile, "utf8");
      try { ensureDailyBackup(previousContent); } catch { /* 损坏数据不进入自动备份。 */ }
    }
    fs.writeFileSync(tempFile, content, "utf8");
    fs.renameSync(tempFile, dataFile);
    if (!hadExistingData) ensureDailyBackup(content);
  }

  function getInfo() {
    const backups = listBackups();
    return {
      dataPath: dataFile,
      dataDir: path.dirname(dataFile),
      backupDir,
      backupCount: backups.length,
      latestBackupAt: backups[0]?.createdAt || null,
      maxBackups
    };
  }

  return {
    loadData,
    saveData,
    createManualBackup,
    getInfo,
    listBackups,
    validateContent
  };
}

module.exports = { createStorageManager, validateContent, dateStamp, timeStamp };
