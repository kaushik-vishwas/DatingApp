import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

/**
 * Loads the nearest `.env` walking up from `process.cwd()`, preferring the one
 * closest to the filesystem root (so repo-root `.env` wins over `backend/.env`).
 */
export function loadEnv(): void {
  let dir = path.resolve(process.cwd());
  let chosen: string | null = null;

  for (let i = 0; i < 8; i++) {
    const p = path.join(dir, '.env');
    if (fs.existsSync(p)) {
      chosen = p;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  if (chosen) {
    dotenv.config({ path: chosen });
    return;
  }
  dotenv.config();
}
