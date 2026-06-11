const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
    'electronAPI', {
    printReceipt: (html) => ipcRenderer.send('print-receipt', html),
    printThermalLabel: (data) => ipcRenderer.invoke('print-thermal-label', data),
    getPrinters: () => ipcRenderer.invoke('get-printers'),
    setSystemTime: (datetime) => ipcRenderer.invoke('set-system-time', datetime),
    setAuthToken: (token) => ipcRenderer.invoke('set-auth-token', token),
    getAuthToken: () => ipcRenderer.invoke('get-auth-token'),
    deleteAuthToken: () => ipcRenderer.invoke('delete-auth-token'),
    readItemsCache: () => ipcRenderer.invoke('read-items-cache'),
    writeItemsCache: (data) => ipcRenderer.invoke('write-items-cache', data),
    readPendingSales: () => ipcRenderer.invoke('read-pending-sales'),
    writePendingSales: (data) => ipcRenderer.invoke('write-pending-sales', data)
}
);

window.addEventListener('DOMContentLoaded', () => {
    console.log('Fashion Shaa POS Loaded');
});

/* placeholder aria-label */
