import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

export type AppEnvName = 'production' | 'test';

let loadedEnvPath: string | null = null;
let loadedAppEnv: AppEnvName | null = null;

function resolveBackendRoot(): string {
  return path.basename(path.dirname(__dirname)) === 'dist'
    ? path.resolve(__dirname, '..', '..')
    : path.resolve(__dirname, '..');
}

function normalizeAppEnv(raw: string | undefined): AppEnvName | null {
  const value = raw?.trim().toLowerCase();
  if (!value) return null;
  if (value === 'test' || value === 'testing' || value === 'staging') return 'test';
  if (value === 'production' || value === 'prod') return 'production';
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
export function resolveEnvFilePath(backendRoot = resolveBackendRoot()): string {
  const explicit = process.env.DOTENV_CONFIG_PATH?.trim();
  if (explicit) {
    return path.isAbsolute(explicit) ? explicit : path.join(backendRoot, explicit);
  }

  const appEnv = normalizeAppEnv(process.env.APP_ENV ?? process.env.ENVIRONMENT);
  if (appEnv === 'test') {
    return path.join(backendRoot, '.env.test');
  }

  return path.join(backendRoot, '.env');
}

export function getLoadedEnvPath(): string | null {
  return loadedEnvPath;
}

export function getLoadedAppEnv(): AppEnvName | null {
  return loadedAppEnv;
}

/**
 * Load backend environment once per process.
 * Production default: `backend/.env`
 * Test: set `APP_ENV=test` or `DOTENV_CONFIG_PATH=.env.test` before start (PM2 / npm script).
 */
export function loadEnv(): void {
  if (loadedEnvPath) return;

  const backendRoot = resolveBackendRoot();
  const envPath = resolveEnvFilePath(backendRoot);
  const appEnv = normalizeAppEnv(process.env.APP_ENV ?? process.env.ENVIRONMENT);

  if (!fs.existsSync(envPath)) {
    if (appEnv === 'test') {
      throw new Error(
        `[env] APP_ENV=test but env file not found: ${envPath}. Create backend/.env.test or set DOTENV_CONFIG_PATH.`
      );
    }
    console.warn(
      `[env] No env file at ${envPath}. Continuing with existing process environment variables.`
    );
    loadedEnvPath = envPath;
    loadedAppEnv = 'production';
    return;
  }

  const result = dotenv.config({ path: envPath, override: true });
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
