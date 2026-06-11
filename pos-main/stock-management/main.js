const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { exec, spawn } = require('child_process');
const fs = require('fs');

function startBackendServer() {
    const backendPath = path.join(__dirname, '..', 'backend');
    const serverScript = path.join(backendPath, 'server.js');

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
    app.setAppUserModelId('com.fashionshaa.stockmanagement');
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

    return `<!doctype html><html><head>${meta}</head><body>${html}</body></html>`;
}

function createWindow() {
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

    const devServerUrl = process.env.STOCK_UI_DEV_SERVER_URL;
    const reactIndex = path.join(__dirname, 'dist', 'index.html');

    if (!app.isPackaged && devServerUrl) {
        win.loadURL(devServerUrl);
    } else if (fs.existsSync(reactIndex)) {
        win.loadFile(reactIndex);
    } else {
        win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Fashion Shaa Stock Management</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: Arial, sans-serif; background: #f7f8fb; color: #142033; }
    main { max-width: 520px; padding: 24px; border: 1px solid #d8e0ea; border-radius: 8px; background: #fff; box-shadow: 0 18px 45px rgba(20, 32, 51, 0.08); }
    code { background: #eef2f6; border-radius: 6px; padding: 2px 6px; }
  </style>
</head>
<body>
  <main>
    <h1>React build missing</h1>
    <p>Run <code>npm run build</code> in the stock-management folder, then restart the app.</p>
  </main>
</body>
</html>` )}`);
    }

    const shouldOpenDevTools = devToolsEnabled && process.env.ELECTRON_OPEN_DEVTOOLS === '1';
    if (shouldOpenDevTools) {
        win.webContents.openDevTools({ mode: 'detach' });
    }

    win.setMenuBarVisibility(false);

    win.on('closed', () => {
        if (mainWindow === win) mainWindow = undefined;
    });
}

// Persistent safeStorage Token Handlers
const { safeStorage } = require('electron');

const tokenPath = path.join(app.getPath('userData'), 'session.bin');

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

ipcMain.handle('get-sync-diagnostics', async () => {
    const appData = app.getPath('appData');
    const simplePosUserData = path.join(appData, 'simple-pos');
    const itemsCachePath = path.join(simplePosUserData, 'items_cache.json');
    const pendingSalesPath = path.join(simplePosUserData, 'pending_sales.json');

    let pendingSalesCount = 0;
    let cachedItems = [];

    if (fs.existsSync(pendingSalesPath)) {
        try {
            const raw = fs.readFileSync(pendingSalesPath, 'utf8');
            const data = JSON.parse(raw);
            pendingSalesCount = Array.isArray(data) ? data.length : 0;
        } catch (e) {
            console.error('Failed to read pending sales:', e);
        }
    }

    if (fs.existsSync(itemsCachePath)) {
        try {
            const raw = fs.readFileSync(itemsCachePath, 'utf8');
            cachedItems = JSON.parse(raw);
        } catch (e) {
            console.error('Failed to read items cache:', e);
        }
    }

    return {
        pendingSalesCount,
        cachedItemsCount: Array.isArray(cachedItems) ? cachedItems.length : 0,
        cachedItems: Array.isArray(cachedItems) ? cachedItems : []
    };
});

ipcMain.handle('write-simple-pos-items-cache', (_, data) => {
    const appData = app.getPath('appData');
    const simplePosUserData = path.join(appData, 'simple-pos');
    const itemsCachePath = path.join(simplePosUserData, 'items_cache.json');
    try {
        if (!fs.existsSync(simplePosUserData)) {
            fs.mkdirSync(simplePosUserData, { recursive: true });
        }
        fs.writeFileSync(itemsCachePath, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error('Failed to write simple-pos items cache:', e);
        return false;
    }
});

ipcMain.handle('get-printers', async (event) => {
    try {
        return await event.sender.getPrintersAsync();
    } catch (e) {
        console.error('Failed to get printers:', e);
        return [];
    }
});
const ThermalPrinter = require('node-thermal-printer').printer;
const PrinterTypes = require('node-thermal-printer').types;

ipcMain.handle('print-thermal-label', async (event, data) => {
    try {
        const printer = new ThermalPrinter({
            type: PrinterTypes.EPSON,        // Try EPSON first for Xprinter
            interface: `win32://${data.printerName || 'XP-410B'}`,
            characterSet: 'SLOVENIA',
            removeSpecialCharacters: false,
            lineCharacter: "-"
        });

        printer.alignCenter();
        printer.println("FASHION SHAA");
        printer.println(data.sku);
        printer.println(data.name);
        printer.printBarcode(data.barcode, "CODE128");
        printer.println(`Rs. ${data.price}`);
        printer.cut();

        await printer.execute();
        return { success: true };
    } catch (error) {
        console.error('Thermal Print Error:', error);
        return { success: false, error: error.message };
    }
});

const STANDARD_PAGE_SIZES = new Set(['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'Legal', 'Letter', 'Tabloid']);

function normalizePositiveInteger(value, minimum = 1) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Math.max(minimum, Math.round(numeric));
}

function normalizePageSize(pageSize) {
    if (typeof pageSize === 'string' && STANDARD_PAGE_SIZES.has(pageSize)) {
        return pageSize;
    }

    if (!pageSize || typeof pageSize !== 'object') return null;

    const width = normalizePositiveInteger(pageSize.width, 353);
    const height = normalizePositiveInteger(pageSize.height, 353);
    if (!width || !height) return null;

    return { width, height };
}

function normalizeMargins(margins) {
    if (!margins || typeof margins !== 'object') return null;

    const marginType = margins.marginType || 'default';
    if (!['default', 'none', 'printableArea', 'custom'].includes(marginType)) return null;

    const normalized = { marginType };
    if (marginType === 'custom') {
        for (const key of ['top', 'bottom', 'left', 'right']) {
            const value = normalizePositiveInteger(margins[key], 0);
            normalized[key] = value == null ? 0 : value;
        }
    }

    return normalized;
}

// Barcode Sticker printing handler
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
            printOptions.landscape = Boolean(options.landscape);
        }

        if (options.preferCSSPageSize !== undefined) {
            printOptions.preferCSSPageSize = Boolean(options.preferCSSPageSize);
        }

        const pageSize = normalizePageSize(options.pageSize);
        if (pageSize) {
            printOptions.pageSize = pageSize;
        }

        const margins = normalizeMargins(options.margins);
        if (margins) {
            printOptions.margins = margins;
        }

        const scaleFactor = normalizePositiveInteger(options.scaleFactor);
        if (scaleFactor) {
            printOptions.scaleFactor = scaleFactor;
        }
    }

    printWin.webContents.on('did-finish-load', () => {
        printWin.webContents.print(printOptions, (success, failureReason) => {
            if (!success) console.error('Print failed:', failureReason);
            printWin.close();
        });
    });
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
