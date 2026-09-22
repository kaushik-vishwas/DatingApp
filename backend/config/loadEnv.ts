import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

export type AppEnvName = 'production' | 'test';

const BACKEND_ROOT = resolveBackendRoot();
/** Resolved once when this module is first evaluated — before any dotenv load. */
const LOCKED_ENV_FILE_PATH = resolveEnvFilePath(BACKEND_ROOT);

let loadedEnvPath: string | null = null;
let loadedAppEnv: AppEnvName | null = null;
let snapshottedPort: number | null = null;
let envLoadComplete = false;

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

function readAppEnvFromProcess(): AppEnvName | null {
  const fromAppEnv = normalizeAppEnv(process.env.APP_ENV ?? process.env.ENVIRONMENT);
  if (fromAppEnv) return fromAppEnv;
  // PM2 often sets NODE_ENV=test without APP_ENV — treat that as the test profile.
  if (process.env.NODE_ENV?.trim().toLowerCase() === 'test') return 'test';
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
export function resolveEnvFilePath(backendRoot = BACKEND_ROOT): string {
  const explicit = process.env.DOTENV_CONFIG_PATH?.trim();
  if (explicit) {
    return path.isAbsolute(explicit) ? explicit : path.join(backendRoot, explicit);
  }

  if (readAppEnvFromProcess() === 'test') {
    return path.join(backendRoot, '.env.test');
  }

  return path.join(backendRoot, '.env');
}

export function getLockedEnvFilePath(): string {
  return LOCKED_ENV_FILE_PATH;
}

export function getLoadedEnvPath(): string | null {
  return loadedEnvPath;
}

export function getLoadedAppEnv(): AppEnvName | null {
  return loadedAppEnv;
}

/** Port captured when the env file was loaded — immune to later dotenv reloads. */
export function getServerPort(): number {
  if (snapshottedPort != null) return snapshottedPort;
  const raw = process.env.PORT?.trim();
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5000;
}

function patchDotenvAgainstReload(lockedPath: string): void {
  const originalConfig = dotenv.config.bind(dotenv);
  const locked = path.resolve(lockedPath);

  dotenv.config = ((options?: dotenv.DotenvConfigOptions) => {
    const requested = options?.path ? path.resolve(String(options.path)) : null;
    if (envLoadComplete) {
      if (!requested || requested === locked) {
        return { parsed: {}, error: undefined };
      }
      console.warn(
        `[env] Blocked dotenv reload of ${requested} — process is locked to ${locked}`
      );
      return { parsed: {}, error: undefined };
    }
    return originalConfig(options);
  }) as typeof dotenv.config;
}

/**
 * Load backend environment once per process.
 * Production default: `backend/.env`
 * Test: set `APP_ENV=test`, `NODE_ENV=test`, or `DOTENV_CONFIG_PATH=.env.test` before start.
 */
export function loadEnv(): void {
  if (envLoadComplete) return;

  const envPath = LOCKED_ENV_FILE_PATH;
  const appEnv = readAppEnvFromProcess();

  if (!fs.existsSync(envPath)) {
    if (appEnv === 'test' || envPath.endsWith('.env.test')) {
      throw new Error(
        `[env] Test env file not found: ${envPath}. Create backend/.env.test or set DOTENV_CONFIG_PATH.`
      );
    }
    console.warn(
      `[env] No env file at ${envPath}. Continuing with existing process environment variables.`
    );
    loadedEnvPath = envPath;
    loadedAppEnv = 'production';
    snapshottedPort = getServerPort();
    envLoadComplete = true;
    patchDotenvAgainstReload(envPath);
    return;
  }

  const result = dotenv.config({ path: envPath, override: true });
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

  console.log(
    `[env] Loaded ${envPath} (APP_ENV=${loadedAppEnv}, PORT=${snapshottedPort})`
  );
}
