const {contextBridge, ipcRenderer} = require("electron");

console.log("Preload.js loaded.");

// Expose protected methods that allow the renderer process to use
contextBridge.exposeInMainWorld("electronAPI", {
    handleBluetoothDevices: (callback) => {
        ipcRenderer.on("devices", callback);
    },
    startScan: (callback) => {
        ipcRenderer.on("started", callback);
    }
});
