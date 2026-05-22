const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
    'electronAPI', {
    printReceipt: (html) => ipcRenderer.send('print-receipt', html),
    setSystemTime: (datetime) => ipcRenderer.invoke('set-system-time', datetime)
}
);

window.addEventListener('DOMContentLoaded', () => {
    console.log('Fashion Shaa POS Loaded');
});

/* placeholder aria-label */
