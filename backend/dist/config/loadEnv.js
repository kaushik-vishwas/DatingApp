"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveEnvFilePath = resolveEnvFilePath;
exports.getLockedEnvFilePath = getLockedEnvFilePath;
exports.getLoadedEnvPath = getLoadedEnvPath;
exports.getLoadedAppEnv = getLoadedAppEnv;
exports.getServerPort = getServerPort;
exports.loadEnv = loadEnv;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const BACKEND_ROOT = resolveBackendRoot();
/** Resolved once when this module is first evaluated — before any dotenv load. */
const LOCKED_ENV_FILE_PATH = resolveEnvFilePath(BACKEND_ROOT);
let loadedEnvPath = null;
let loadedAppEnv = null;
let snapshottedPort = null;
let envLoadComplete = false;
function resolveBackendRoot() {
    return path_1.default.basename(path_1.default.dirname(__dirname)) === 'dist'
        ? path_1.default.resolve(__dirname, '..', '..')
        : path_1.default.resolve(__dirname, '..');
}
function normalizeAppEnv(raw) {
    const value = raw?.trim().toLowerCase();
    if (!value)
        return null;
    if (value === 'test' || value === 'testing' || value === 'staging')
        return 'test';
    if (value === 'production' || value === 'prod')
        return 'production';
    return null;
}
function readAppEnvFromProcess() {
    const fromAppEnv = normalizeAppEnv(process.env.APP_ENV ?? process.env.ENVIRONMENT);
    if (fromAppEnv)
        return fromAppEnv;
    // PM2 often sets NODE_ENV=test without APP_ENV — treat that as the test profile.
    if (process.env.NODE_ENV?.trim().toLowerCase() === 'test')
        return 'test';
    return null;
}
/**
 * Resolve which env file to load.
 *
 * Priority:
 * 1. `DOTENV_CONFIG_PATH` — absolute path or relative to backend root (PM2-friendly)
 * 2. `APP_ENV=test` / `ENVIRONMENT=test` / `NODE_ENV=test` → `.env.test`
 * 3. default → `.env` (production)
 */
function resolveEnvFilePath(backendRoot = BACKEND_ROOT) {
    const explicit = process.env.DOTENV_CONFIG_PATH?.trim();
    if (explicit) {
        return path_1.default.isAbsolute(explicit) ? explicit : path_1.default.join(backendRoot, explicit);
    }
    if (readAppEnvFromProcess() === 'test') {
        return path_1.default.join(backendRoot, '.env.test');
    }
    return path_1.default.join(backendRoot, '.env');
}
function getLockedEnvFilePath() {
    return LOCKED_ENV_FILE_PATH;
}
function getLoadedEnvPath() {
    return loadedEnvPath;
}
function getLoadedAppEnv() {
    return loadedAppEnv;
}
/** Port captured when the env file was loaded — immune to later dotenv reloads. */
function getServerPort() {
    if (snapshottedPort != null)
        return snapshottedPort;
    const raw = process.env.PORT?.trim();
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 5000;
}
function patchDotenvAgainstReload(lockedPath) {
    const originalConfig = dotenv_1.default.config.bind(dotenv_1.default);
    const locked = path_1.default.resolve(lockedPath);
    dotenv_1.default.config = ((options) => {
        const requested = options?.path ? path_1.default.resolve(String(options.path)) : null;
        if (envLoadComplete) {
            if (!requested || requested === locked) {
                return { parsed: {}, error: undefined };
            }
            console.warn(`[env] Blocked dotenv reload of ${requested} — process is locked to ${locked}`);
            return { parsed: {}, error: undefined };
        }
        return originalConfig(options);
    });
}
/**
 * Load backend environment once per process.
 * Production default: `backend/.env`
 * Test: set `APP_ENV=test`, `NODE_ENV=test`, or `DOTENV_CONFIG_PATH=.env.test` before start.
 */
function loadEnv() {
    if (envLoadComplete)
        return;
    const envPath = LOCKED_ENV_FILE_PATH;
    const appEnv = readAppEnvFromProcess();
    if (!fs_1.default.existsSync(envPath)) {
        if (appEnv === 'test' || envPath.endsWith('.env.test')) {
            throw new Error(`[env] Test env file not found: ${envPath}. Create backend/.env.test or set DOTENV_CONFIG_PATH.`);
        }
        console.warn(`[env] No env file at ${envPath}. Continuing with existing process environment variables.`);
        loadedEnvPath = envPath;
        loadedAppEnv = 'production';
        snapshottedPort = getServerPort();
        envLoadComplete = true;
        patchDotenvAgainstReload(envPath);
        return;
    }
    const result = dotenv_1.default.config({ path: envPath, override: true });
    if (result.error) {
        throw new Error(`[env] Failed to load ${envPath}: ${result.error.message}`);
    }
    loadedEnvPath = envPath;
    loadedAppEnv =
        appEnv ?? (envPath.endsWith('.env.test') ? 'test' : 'production');
    if (typeof process.env.OTP_BYPASS === 'string') {
        process.env.OTP_BYPASS = process.env.OTP_BYPASS.trim();
    }
    snapshottedPort = getServerPort();
    envLoadComplete = true;
    patchDotenvAgainstReload(envPath);
    // Pin path for any code that re-resolves via DOTENV_CONFIG_PATH later in the same process.
    process.env.DOTENV_CONFIG_PATH = envPath;
    console.log(`[env] Loaded ${envPath} (APP_ENV=${loadedAppEnv}, PORT=${snapshottedPort})`);
}
