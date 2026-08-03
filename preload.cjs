const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("yanshiStorage", {
  isDesktop: true,
  load: () => ipcRenderer.sendSync("storage:load"),
  save: content => ipcRenderer.send("storage:save", content),
  getDataPath: () => ipcRenderer.sendSync("storage:path")
});
