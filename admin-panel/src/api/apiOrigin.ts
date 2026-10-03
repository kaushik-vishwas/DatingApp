/**
 * Edit these two by hand. In each group, keep one line active and comment the others.
 * The endpoint is the API the admin panel calls. The env file is the backend file to start with it.
 */

const ADMIN_ENV_FILE = '.env';
// const ADMIN_ENV_FILE = '.env.test';

const ADMIN_API_ENDPOINT = 'https://backend.nesthamapp.com';
// const ADMIN_API_ENDPOINT = 'https://testbackend.nesthamapp.com';
// const ADMIN_API_ENDPOINT = 'http://localhost:5000';
// const ADMIN_API_ENDPOINT = 'http://localhost:5001';

export function normalizeApiOrigin(raw: string): string {
  let u = raw.trim().replace(/\/+$/, '');
  if (u.endsWith('/auth')) {
    u = u.slice(0, -5).replace(/\/+$/, '');
  }
  return u;
}

/** Admin panel API origin. */
export function getAdminApiOrigin(): string {
  return normalizeApiOrigin(ADMIN_API_ENDPOINT);
}

let loggedApiOrigin = false;

export function logAdminApiOriginOnce(): void {
  if (!import.meta.env.DEV || loggedApiOrigin) return;
  loggedApiOrigin = true;
  console.log(`[ADMIN API] ${getAdminApiOrigin()} (env=${ADMIN_ENV_FILE})`);
}
