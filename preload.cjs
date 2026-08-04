const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("yanshiStorage", {
  isDesktop: true,
  load: () => ipcRenderer.sendSync("storage:load"),
  save: content => ipcRenderer.send("storage:save", content),
  getDataPath: () => ipcRenderer.sendSync("storage:path"),
  getInfo: () => ipcRenderer.invoke("storage:info"),
  exportData: content => ipcRenderer.invoke("storage:export", content),
  importData: () => ipcRenderer.invoke("storage:import"),
  backupNow: content => ipcRenderer.invoke("storage:backup-now", content),
  openFolder: () => ipcRenderer.invoke("storage:open-folder")
});
