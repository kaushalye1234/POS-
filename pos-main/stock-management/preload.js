const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    printReceipt: (html, options) => ipcRenderer.send('print-receipt', html, options),
    printThermalLabel: (data) => ipcRenderer.invoke('print-thermal-label', data),
    setAuthToken: (token) => ipcRenderer.invoke('set-auth-token', token),
    getAuthToken: () => ipcRenderer.invoke('get-auth-token'),
    deleteAuthToken: () => ipcRenderer.invoke('delete-auth-token'),
    getPrinters: () => ipcRenderer.invoke('get-printers'),
    getSyncDiagnostics: () => ipcRenderer.invoke('get-sync-diagnostics'),
    writeSimplePosItemsCache: (data) => ipcRenderer.invoke('write-simple-pos-items-cache', data)
});
