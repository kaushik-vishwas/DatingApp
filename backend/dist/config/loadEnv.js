"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveEnvFilePath = resolveEnvFilePath;
exports.getLoadedEnvPath = getLoadedEnvPath;
exports.getLoadedAppEnv = getLoadedAppEnv;
exports.loadEnv = loadEnv;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
let loadedEnvPath = null;
let loadedAppEnv = null;
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
/**
 * Resolve which env file to load.
 *
 * Priority:
 * 1. `DOTENV_CONFIG_PATH` — absolute path or relative to backend root (PM2-friendly)
 * 2. `APP_ENV=test` (or `ENVIRONMENT=test`) → `.env.test`
 * 3. default → `.env` (production)
 */
function resolveEnvFilePath(backendRoot = resolveBackendRoot()) {
    const explicit = process.env.DOTENV_CONFIG_PATH?.trim();
    if (explicit) {
        return path_1.default.isAbsolute(explicit) ? explicit : path_1.default.join(backendRoot, explicit);
    }
    const appEnv = normalizeAppEnv(process.env.APP_ENV ?? process.env.ENVIRONMENT);
    if (appEnv === 'test') {
        return path_1.default.join(backendRoot, '.env.test');
    }
    return path_1.default.join(backendRoot, '.env');
}
function getLoadedEnvPath() {
    return loadedEnvPath;
}
function getLoadedAppEnv() {
    return loadedAppEnv;
}
/**
 * Load backend environment once per process.
 * Production default: `backend/.env`
 * Test: set `APP_ENV=test` or `DOTENV_CONFIG_PATH=.env.test` before start (PM2 / npm script).
 */
function loadEnv() {
    if (loadedEnvPath)
        return;
    const backendRoot = resolveBackendRoot();
    const envPath = resolveEnvFilePath(backendRoot);
    const appEnv = normalizeAppEnv(process.env.APP_ENV ?? process.env.ENVIRONMENT);
    if (!fs_1.default.existsSync(envPath)) {
        if (appEnv === 'test') {
            throw new Error(`[env] APP_ENV=test but env file not found: ${envPath}. Create backend/.env.test or set DOTENV_CONFIG_PATH.`);
        }
        console.warn(`[env] No env file at ${envPath}. Continuing with existing process environment variables.`);
        loadedEnvPath = envPath;
        loadedAppEnv = 'production';
        return;
    }
    const result = dotenv_1.default.config({ path: envPath, override: true });
    if (result.error) {
        throw new Error(`[env] Failed to load ${envPath}: ${result.error.message}`);
    }
    loadedEnvPath = envPath;
    loadedAppEnv = appEnv ?? (envPath.endsWith('.env.test') ? 'test' : 'production');
    // Normalize flags that are often broken by Windows CRLF / trailing spaces in .env.
    if (typeof process.env.OTP_BYPASS === 'string') {
        process.env.OTP_BYPASS = process.env.OTP_BYPASS.trim();
    }
    const port = process.env.PORT?.trim() || '5000';
    console.log(`[env] Loaded ${envPath} (APP_ENV=${loadedAppEnv}, PORT=${port})`);
}
