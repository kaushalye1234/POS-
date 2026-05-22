const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { exec } = require('child_process');

const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self' http://localhost:* http://127.0.0.1:* https:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'self'";

let mainWindow;

if (process.platform === 'win32') {
    app.setAppUserModelId('com.fashionshaa.pos');
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (!mainWindow) return;
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    });
}

function isSafeInternalUrl(url) {
    return typeof url === 'string' && (url.startsWith('file://') || url.startsWith('data:'));
}

function injectCspMeta(html, csp) {
    if (!html) return html;
    if (/<meta[^>]+http-equiv=["']Content-Security-Policy["']/i.test(html)) return html;

    const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;

    if (/<head[^>]*>/i.test(html)) {
        return html.replace(/<head[^>]*>/i, (m) => `${m}\n    ${meta}`);
    }

    // Fallback: wrap fragments or head-less documents (e.g. print content)
    return `<!doctype html><html><head>${meta}</head><body>${html}</body></html>`;
}

function createWindow() {
    // DevTools are disabled by default (prevents accidental docked DevTools panel in the app UI).
    // Enable explicitly when debugging:
    //   set ELECTRON_DEVTOOLS=1
    //   set ELECTRON_OPEN_DEVTOOLS=1
    const devToolsEnabled = !app.isPackaged && process.env.ELECTRON_DEVTOOLS === '1';

    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        icon: path.join(__dirname, 'logo.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            devTools: devToolsEnabled,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow = win;

    // Block popups and unexpected navigations; open external links in the OS browser
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (isSafeInternalUrl(url)) return { action: 'allow' };
        if (url) shell.openExternal(url);
        return { action: 'deny' };
    });

    win.webContents.on('will-navigate', (event, url) => {
        if (isSafeInternalUrl(url)) return;
        event.preventDefault();
        if (url) shell.openExternal(url);
    });

    win.loadFile('index.html');

    // Only open DevTools when explicitly requested
    const shouldOpenDevTools = devToolsEnabled && process.env.ELECTRON_OPEN_DEVTOOLS === '1';
    if (shouldOpenDevTools) {
        win.webContents.openDevTools({ mode: 'detach' });
    }

    // Remove default menu for cleaner "App" look
    win.setMenuBarVisibility(false);

    win.on('closed', () => {
        if (mainWindow === win) mainWindow = undefined;
    });
}

// Silent Printing Handler
ipcMain.on('print-receipt', (event, html) => {
    let printWin = new BrowserWindow({
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    const safeHtml = injectCspMeta(html, CSP);
    printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(safeHtml)}`);

    printWin.webContents.on('did-finish-load', () => {
        printWin.webContents.print({
            silent: true,
            printBackground: true,
            deviceName: '' // Uses default printer if empty
        }, (success, failureReason) => {
            if (!success) console.error('Print failed:', failureReason);
            printWin.close();
        });
    });
});



// Handle System Time Change
ipcMain.handle('set-system-time', async (_event, datetime) => {
    return new Promise((resolve, reject) => {
        // Expected format from renderer: MM-dd-yyyy HH:mm:ss
        const dt = String(datetime || '').trim();
        if (!/^\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2}$/.test(dt)) {
            return reject('Invalid datetime format. Expected MM-dd-yyyy HH:mm:ss');
        }

        // Defense-in-depth (dt should not contain quotes because of the regex)
        const safeDt = dt.replace(/'/g, "''");

        const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -Command \\\"Set-Date -Date ''${safeDt}''\\\"' "`;

        exec(cmd, (error) => {
            if (error) {
                console.error('Failed to set time:', error);
                reject(error.message);
            } else {
                resolve('Time update initiated');
            }
        });
    });
});

app.on('ready', () => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

/* placeholder aria-label */
