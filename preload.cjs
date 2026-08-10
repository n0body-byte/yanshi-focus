const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("yanshiStorage", {
  isDesktop: true,
  load: () => ipcRenderer.sendSync("storage:load"),
  save: content => ipcRenderer.send("storage:save", content),
  getDataPath: () => ipcRenderer.sendSync("storage:path"),
  getInfo: () => ipcRenderer.invoke("storage:info"),
  exportData: content => ipcRenderer.invoke("storage:export", content),
  exportCsv: content => ipcRenderer.invoke("storage:export-csv", content),
  importData: () => ipcRenderer.invoke("storage:import"),
  backupNow: content => ipcRenderer.invoke("storage:backup-now", content),
  openFolder: () => ipcRenderer.invoke("storage:open-folder"),
  updateTimerStatus: status => ipcRenderer.send("timer:status", status),
  notifyCompletion: () => ipcRenderer.send("timer:completed"),
  onSaveStatus: callback => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("storage:save-status", listener);
    return () => ipcRenderer.removeListener("storage:save-status", listener);
  }
});
