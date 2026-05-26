const { app, BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self' http://localhost:* http://127.0.0.1:* https:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'self'";

let mainWindow;
let backendBootPromise = null;

function resolveBackendPath(...segments) {
    const packagedCandidate = path.join(__dirname, 'backend', ...segments);
    if (fs.existsSync(packagedCandidate)) {
        return packagedCandidate;
    }

    return path.join(__dirname, '..', 'backend', ...segments);
}

const runtimeEnvironment = require(resolveBackendPath('runtimeEnvironment.js'));
const appMode = process.argv.includes('--bootstrap-admin')
    ? 'bootstrap-admin'
    : (process.argv.includes('--backend') ? 'backend' : 'frontend');
const isServiceMode = appMode !== 'frontend';

if (process.platform === 'win32') {
    app.setAppUserModelId('com.fashionshaa.pos');
}

if (!isServiceMode) {
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
}

function readCliValue(name, fallback = '') {
    const exactFlag = `--${name}`;
    const prefix = `${exactFlag}=`;

    for (let index = 0; index < process.argv.length; index += 1) {
        const arg = process.argv[index];
        if (arg.startsWith(prefix)) {
            return arg.slice(prefix.length);
        }
        if (arg === exactFlag && process.argv[index + 1]) {
            return process.argv[index + 1];
        }
    }

    return fallback;
}

function getBackendRuntimePaths() {
    const directories = runtimeEnvironment.ensureRuntimeDirectories();
    const stdoutLogPath = path.join(directories.logDir, 'backend-launch.out.log');
    const stderrLogPath = path.join(directories.logDir, 'backend-launch.err.log');

    return {
        ...directories,
        envPath: runtimeEnvironment.getRuntimeEnvPath(),
        templateEnvPath: runtimeEnvironment.getBundledEnvTemplatePath(),
        stdoutLogPath,
        stderrLogPath
    };
}

function isBackendListening({ host = '127.0.0.1', port = 5000, timeoutMs = 700 } = {}) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let settled = false;

        const finish = (result) => {
            if (settled) return;
            settled = true;
            socket.destroy();
            resolve(result);
        };

        socket.setTimeout(timeoutMs);
        socket.once('connect', () => finish(true));
        socket.once('timeout', () => finish(false));
        socket.once('error', () => finish(false));
        socket.connect(port, host);
    });
}

async function ensureBundledBackendRunning() {
    if (!app.isPackaged) return { started: false, reason: 'development-mode' };
    if (backendBootPromise) return backendBootPromise;

    backendBootPromise = (async () => {
        if (await isBackendListening()) {
            return { started: false, reason: 'already-running' };
        }

        const runtimePaths = getBackendRuntimePaths();
        const stdoutFd = fs.openSync(runtimePaths.stdoutLogPath, 'a');
        const stderrFd = fs.openSync(runtimePaths.stderrLogPath, 'a');

        try {
            const child = spawn(app.getPath('exe'), ['--backend'], {
                cwd: path.dirname(app.getPath('exe')),
                detached: true,
                env: {
                    ...process.env,
                    FASHION_SHAA_RUNTIME_DIR: runtimePaths.rootDir,
                    FASHION_SHAA_ENV_PATH: runtimePaths.envPath,
                    FASHION_SHAA_TEMPLATE_ENV_PATH: runtimePaths.templateEnvPath
                },
                stdio: ['ignore', stdoutFd, stderrFd],
                windowsHide: true
            });
            child.unref();
            return { started: true, pid: child.pid };
        } finally {
            fs.closeSync(stdoutFd);
            fs.closeSync(stderrFd);
        }
    })();

    return backendBootPromise;
}

async function runBackendServiceMode() {
    const runtimePaths = getBackendRuntimePaths();
    process.env.FASHION_SHAA_RUNTIME_DIR = runtimePaths.rootDir;
    process.env.FASHION_SHAA_ENV_PATH = runtimePaths.envPath;
    process.env.FASHION_SHAA_TEMPLATE_ENV_PATH = runtimePaths.templateEnvPath;

    const { startServer } = require(resolveBackendPath('server.js'));
    await startServer();
}

async function runBootstrapAdminMode() {
    const runtimePaths = getBackendRuntimePaths();
    process.env.FASHION_SHAA_RUNTIME_DIR = runtimePaths.rootDir;
    process.env.FASHION_SHAA_ENV_PATH = runtimePaths.envPath;
    process.env.FASHION_SHAA_TEMPLATE_ENV_PATH = runtimePaths.templateEnvPath;

    const { bootstrapAdmin } = require(resolveBackendPath('scripts', 'bootstrap-admin.js'));
    const summary = await bootstrapAdmin({
        username: readCliValue('admin-username', process.env.FASHION_SHAA_ADMIN_USERNAME || 'admin'),
        password: readCliValue('admin-password', process.env.FASHION_SHAA_ADMIN_PASSWORD || 'adminpassword'),
        pin: readCliValue('admin-pin', process.env.FASHION_SHAA_ADMIN_PIN || '1234'),
        employeeId: readCliValue('admin-employee-id', process.env.FASHION_SHAA_ADMIN_EMPLOYEE_ID || 'E001')
    });

    const resultFile = readCliValue('result-file', '');
    if (resultFile) {
        fs.writeFileSync(resultFile, JSON.stringify(summary, null, 2), 'utf8');
    }

    process.stdout.write(`${JSON.stringify(summary)}\n`);
    app.exit(0);
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
    // FIXED: Add domain allowlist for security
    const ALLOWED_DOMAINS = [
        'https://example.com',
        'https://help.example.com',
        'https://support.example.com'
    ];
    
    function isAllowedUrl(url) {
        try {
            const parsed = new URL(url);
            return ALLOWED_DOMAINS.some(allowed => parsed.href.startsWith(allowed));
        } catch {
            return false;
        }
    }
    
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (isSafeInternalUrl(url)) return { action: 'allow' };
        if (url && isAllowedUrl(url)) shell.openExternal(url);
        return { action: 'deny' };
    });

    win.webContents.on('will-navigate', (event, url) => {
        if (isSafeInternalUrl(url)) return;
        event.preventDefault();
        if (url && isAllowedUrl(url)) shell.openExternal(url);
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
ipcMain.handle('print-receipt', async (_event, html) => {
    return await new Promise((resolve) => {
        let printWin = null;
        let settled = false;

        const finish = (result) => {
            if (settled) return;
            settled = true;

            try {
                if (printWin && !printWin.isDestroyed()) {
                    printWin.close();
                }
            } catch {
                // Ignore close errors during shutdown.
            }

            resolve(result);
        };

        try {
            printWin = new BrowserWindow({
                show: false,
                width: 420,
                height: 760,
                backgroundColor: '#ffffff',
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true
                }
            });

            const safeHtml = injectCspMeta(html, CSP);
            printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(safeHtml)}`);

            printWin.webContents.on('did-fail-load', (_loadEvent, errorCode, errorDescription) => {
                console.error('Receipt window failed to load:', errorCode, errorDescription);
                finish({ started: false, reason: errorDescription || `Load failed (${errorCode})` });
            });

            printWin.webContents.on('did-finish-load', async () => {
                try {
                    await printWin.webContents.executeJavaScript(`
                        (async () => {
                            if (document.fonts && document.fonts.ready) {
                                try { await document.fonts.ready; } catch {}
                            }
                            return {
                                bodyText: document.body ? document.body.innerText : '',
                                htmlLength: document.documentElement ? document.documentElement.outerHTML.length : 0
                            };
                        })();
                    `);
                } catch (error) {
                    console.error('Print document readiness check failed:', error);
                }

                setTimeout(() => {
                    try {
                        printWin.webContents.print({
                            silent: true,
                            printBackground: true,
                            deviceName: '' // Uses default printer if empty
                        }, (success, failureReason) => {
                            if (!success) {
                                console.error('Print failed:', failureReason);
                            }

                            finish({
                                started: success,
                                reason: failureReason || ''
                            });
                        });
                    } catch (error) {
                        console.error('Print dispatch threw before starting:', error);
                        finish({ started: false, reason: error?.message || String(error) });
                    }
                }, 250);
            });
        } catch (error) {
            console.error('Receipt print window could not be created:', error);
            finish({ started: false, reason: error?.message || String(error) });
        }
    });
});



// Handle System Time Change
// SECURITY FIX: Removed PowerShell execution due to security risks (RCE, privilege escalation)
// If this feature is absolutely required, use a signed, dedicated admin helper executable instead
// For now, this endpoint is disabled and returns an error
ipcMain.handle('set-system-time', async (_event, _datetime) => {
    return new Promise((_resolve, reject) => {
        reject('System time modification feature has been disabled for security reasons. Contact your administrator if you need this functionality.');
    });
});

app.whenReady().then(async () => {
    if (appMode === 'backend') {
        try {
            await runBackendServiceMode();
        } catch (error) {
            console.error('Bundled backend failed to start:', error);
            app.exit(1);
        }
        return;
    }

    if (appMode === 'bootstrap-admin') {
        try {
            await runBootstrapAdminMode();
        } catch (error) {
            console.error('Admin bootstrap failed:', error);
            app.exit(1);
        }
        return;
    }

    try {
        await ensureBundledBackendRunning();
    } catch (error) {
        console.error('Failed to ensure bundled backend is running:', error);
    }

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

if (!isServiceMode) {
    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit();
    });
}
