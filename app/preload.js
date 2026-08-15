const {contextBridge, ipcRenderer} = require("electron");

console.log("Preload.js loaded.");

// Expose protected methods that allow the renderer process to use
contextBridge.exposeInMainWorld("electronAPI", {
    handleBluetoothDevices: (callback) => {
        ipcRenderer.on("devices", callback);
    },
    startScan: (callback) => {
        ipcRenderer.on("started", callback);
    },
    selectBluetoothDevice: (value) => {
        ipcRenderer.send("select", value);
    },
    pushNotification: (type, message) => {
        ipcRenderer.send("notification", {type: type, text: message});
    },
    openExternal: (url) => {
        ipcRenderer.send("open", url);
    }
});
