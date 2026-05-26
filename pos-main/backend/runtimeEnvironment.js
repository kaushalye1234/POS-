const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const APP_RUNTIME_FOLDER = 'FashionShaaPOS';
const BACKEND_RUNTIME_FOLDER = 'backend';
const LOG_RUNTIME_FOLDER = 'logs';

function getProgramDataDir() {
    return process.env.ProgramData || path.join('C:', 'ProgramData');
}

function getRuntimeRootDir() {
    const explicit = String(process.env.FASHION_SHAA_RUNTIME_DIR || '').trim();
    return explicit || path.join(getProgramDataDir(), APP_RUNTIME_FOLDER);
}

function getRuntimeBackendDir() {
    return path.join(getRuntimeRootDir(), BACKEND_RUNTIME_FOLDER);
}

function getRuntimeLogDir() {
    return path.join(getRuntimeRootDir(), LOG_RUNTIME_FOLDER);
}

function getRuntimeEnvPath() {
    const explicit = String(process.env.FASHION_SHAA_ENV_PATH || '').trim();
    return explicit || path.join(getRuntimeBackendDir(), '.env');
}

function getBundledEnvTemplatePath() {
    const explicit = String(process.env.FASHION_SHAA_TEMPLATE_ENV_PATH || '').trim();
    if (explicit) return explicit;

    if (process.resourcesPath) {
        return path.join(process.resourcesPath, 'templates', 'backend.env.example');
    }

    return path.join(__dirname, '.env.example');
}

function ensureRuntimeDirectories() {
    const directories = [
        getRuntimeRootDir(),
        getRuntimeBackendDir(),
        getRuntimeLogDir()
    ];

    directories.forEach((dirPath) => {
        fs.mkdirSync(dirPath, { recursive: true });
    });

    return {
        rootDir: getRuntimeRootDir(),
        backendDir: getRuntimeBackendDir(),
        logDir: getRuntimeLogDir()
    };
}

function loadEnvironment() {
    const runtimeEnvPath = getRuntimeEnvPath();
    const localEnvPath = path.join(__dirname, '.env');
    const candidates = [runtimeEnvPath, localEnvPath];

    let loadedFrom = '';

    for (const candidate of candidates) {
        if (!candidate || !fs.existsSync(candidate)) continue;
        dotenv.config({ path: candidate, override: false });
        loadedFrom = candidate;
        break;
    }

    return {
        loadedFrom,
        candidates,
        runtimeRootDir: getRuntimeRootDir(),
        runtimeBackendDir: getRuntimeBackendDir(),
        runtimeLogDir: getRuntimeLogDir(),
        runtimeEnvPath,
        bundledEnvTemplatePath: getBundledEnvTemplatePath()
    };
}

module.exports = {
    APP_RUNTIME_FOLDER,
    ensureRuntimeDirectories,
    getBundledEnvTemplatePath,
    getProgramDataDir,
    getRuntimeBackendDir,
    getRuntimeEnvPath,
    getRuntimeLogDir,
    getRuntimeRootDir,
    loadEnvironment
};
