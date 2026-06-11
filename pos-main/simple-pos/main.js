const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { exec, spawn } = require('child_process');

function startBackendServer() {
    const backendPath = path.join(__dirname, '..', 'backend');
    const serverScript = path.join(backendPath, 'server.js');
    const fs = require('fs');

    if (fs.existsSync(serverScript)) {
        console.log('Spawning backend server child process...');
        try {
            const outLog = fs.openSync(path.join(backendPath, 'backend-runtime.out.log'), 'a');
            const errLog = fs.openSync(path.join(backendPath, 'backend-runtime.err.log'), 'a');

            const child = spawn('node', ['server.js'], {
                cwd: backendPath,
                detached: true,
                stdio: ['ignore', outLog, errLog]
            });

            child.unref();
        } catch (e) {
            console.error('Failed to spawn backend process:', e);
        }
    } else {
        console.warn('Backend server script not found at:', serverScript);
    }
}

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
ipcMain.on('print-receipt', (event, html, options) => {
    let printWin = new BrowserWindow({
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    const safeHtml = injectCspMeta(html, CSP);
    printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(safeHtml)}`);

    let printOptions = {
        silent: true,
        printBackground: true,
        deviceName: ''
    };

    if (typeof options === 'string') {
        printOptions.deviceName = options;
    } else if (options && typeof options === 'object') {
        printOptions.deviceName = options.printerName || '';
        if (options.landscape !== undefined) {
            printOptions.landscape = options.landscape;
        }
    }

    printWin.webContents.on('did-finish-load', () => {
        printWin.webContents.print(printOptions, (success, failureReason) => {
            if (!success) console.error('Print failed:', failureReason);
            printWin.close();
        });
    });
});



// Persistent safeStorage Token Handlers
const { safeStorage } = require('electron');
const fs = require('fs');
const tokenPath = path.join(app.getPath('userData'), 'session.bin');
const itemsCachePath = path.join(app.getPath('userData'), 'items_cache.json');
const pendingSalesPath = path.join(app.getPath('userData'), 'pending_sales.json');

ipcMain.handle('set-auth-token', (_, token) => {
    if (!safeStorage.isEncryptionAvailable()) return;
    const encrypted = safeStorage.encryptString(token);
    fs.writeFileSync(tokenPath, encrypted);
});

ipcMain.handle('get-auth-token', () => {
    if (!fs.existsSync(tokenPath)) return '';
    if (!safeStorage.isEncryptionAvailable()) return '';
    const encrypted = fs.readFileSync(tokenPath);
    try {
        return safeStorage.decryptString(encrypted);
    } catch {
        return '';
    }
});

ipcMain.handle('delete-auth-token', () => {
    if (fs.existsSync(tokenPath)) fs.unlinkSync(tokenPath);
});

ipcMain.handle('read-items-cache', () => {
    if (!fs.existsSync(itemsCachePath)) return [];
    try {
        const raw = fs.readFileSync(itemsCachePath, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        console.error('Failed to read items cache:', e);
        return [];
    }
});

ipcMain.handle('write-items-cache', (_, data) => {
    try {
        fs.writeFileSync(itemsCachePath, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error('Failed to write items cache:', e);
        return false;
    }
});

ipcMain.handle('read-pending-sales', () => {
    if (!fs.existsSync(pendingSalesPath)) return [];
    try {
        const raw = fs.readFileSync(pendingSalesPath, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        console.error('Failed to read pending sales:', e);
        return [];
    }
});

ipcMain.handle('write-pending-sales', (_, data) => {
    try {
        fs.writeFileSync(pendingSalesPath, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error('Failed to write pending sales:', e);
        return false;
    }
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
const ThermalPrinter = require('node-thermal-printer').printer;
const PrinterTypes = require('node-thermal-printer').types;

ipcMain.handle('print-thermal-label', async (event, data) => {
    try {
        const printer = new ThermalPrinter({
            type: PrinterTypes.XPRINTER,           // Best for XP-410B
            interface: `win32://${data.printerName || 'XP-410B'}`,
            characterSet: 'ISO8859_1',
            removeSpecialCharacters: false,
            lineCharacter: "-",
        });

        printer.alignCenter();
        printer.setTypeFontA();
        printer.println("FASHION SHAA");
        printer.println(data.sku || "");

        if (data.name) {
            printer.println(data.name.substring(0, 25));
        }

        // Print Barcode
        if (data.barcode) {
            printer.printBarcode(data.barcode, "CODE128", { height: 60, width: 2 });
        }

        printer.println(`Rs. ${Number(data.price || 0).toLocaleString('en-LK')}`);
        printer.cut();
        printer.beep();

        const result = await printer.execute();
        return { success: true, message: "Printed successfully" };

    } catch (error) {
        console.error("Thermal Print Error:", error);
        return { success: false, error: error.message };
    }
});

app.on('ready', () => {
    startBackendServer();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

/* placeholder aria-label */
