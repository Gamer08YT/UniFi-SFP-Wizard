const {contextBridge, ipcRenderer} = require("electron");

// Expose protected methods that allow the renderer process to use
contextBridge.exposeInMainWorld("api", {
    handleBluetoothDevices: (callback) => {
        ipcRenderer.on("devices", callback);
    }
});
