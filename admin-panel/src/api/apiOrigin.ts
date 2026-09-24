/** Production admin API (hosted build, mode production). */
export const PROD_API_ORIGIN = 'https://backend.nesthamapp.com';

/** Test / staging admin API (hosted build, mode test). */
export const TEST_API_ORIGIN = 'https://testbackend.nesthamapp.com';

const LOCAL_PROD_PORT = 5000;
const LOCAL_TEST_PORT = 5001;

export function normalizeApiOrigin(raw: string): string {
  let u = raw.trim().replace(/\/+$/, '');
  if (u.endsWith('/auth')) {
    u = u.slice(0, -5).replace(/\/+$/, '');
  }
  return u;
}

/**
 * Admin panel API origin.
 *
 * - `npm run dev` → `backend/.env` (`VITE_API_URL` or http://127.0.0.1:5000)
 * - `npm run dev:test` → `backend/.env.test` (`VITE_API_URL` or http://127.0.0.1:5001)
 * - `npm run build` → production URL
 * - `npm run build:test` → test URL
 */
export function getAdminApiOrigin(): string {
  const fromEnv = import.meta.env.VITE_API_URL?.trim();
  if (fromEnv) return normalizeApiOrigin(fromEnv);

  if (import.meta.env.PROD) {
    return import.meta.env.MODE === 'test'
      ? normalizeApiOrigin(TEST_API_ORIGIN)
      : normalizeApiOrigin(PROD_API_ORIGIN);
  }

  if (import.meta.env.MODE === 'test') {
    return normalizeApiOrigin(`http://127.0.0.1:${LOCAL_TEST_PORT}`);
  }

  return normalizeApiOrigin(`http://127.0.0.1:${LOCAL_PROD_PORT}`);
}

let loggedApiOrigin = false;

export function logAdminApiOriginOnce(): void {
  if (!import.meta.env.DEV || loggedApiOrigin) return;
  loggedApiOrigin = true;
  const source = import.meta.env.VITE_API_URL?.trim()
    ? 'VITE_API_URL'
    : import.meta.env.MODE === 'test'
      ? 'local test fallback'
      : 'local prod fallback';
  console.log(`[ADMIN API] ${getAdminApiOrigin()} (mode=${import.meta.env.MODE}, ${source})`);
}
