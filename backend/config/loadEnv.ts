import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

/**
 * Loads `backend/.env` next to this package root, whether this file runs from
 * `backend/config` (ts-node/tsx) or `backend/dist/config` (compiled `node dist/...`).
 */
export function loadEnv(): void {
  const backendRoot =
    path.basename(path.dirname(__dirname)) === 'dist'
      ? path.resolve(__dirname, '..', '..')
      : path.resolve(__dirname, '..');
  const envPath = path.join(backendRoot, '.env');

  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true });
  } else {
    dotenv.config({ override: true });
  }

  // Normalize flags that are often broken by Windows CRLF / trailing spaces in .env.
  if (typeof process.env.OTP_BYPASS === 'string') {
    process.env.OTP_BYPASS = process.env.OTP_BYPASS.trim();
  }
}
