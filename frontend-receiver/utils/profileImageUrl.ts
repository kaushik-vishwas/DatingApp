/**
 * Bundled avatars are stored as stable ids (`preset:male:1`, etc.) and must not be uploaded.
 * Metro dev URLs for require() assets must never be saved as-is — use preset id or upload.
 */

import { isCallerAvatarPresetId } from '../constants/userOnboarding';

const PRIVATE_OR_LOCAL_HOST = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/i;

function isMetroOrDevAssetUrl(uri: string): boolean {
  const u = uri.trim().toLowerCase();
  return (
    u.includes('unstable_path') ||
    u.includes('/assets/?') ||
    u.includes('expo-development-client') ||
    u.includes('.exp.direct')
  );
}

/**
 * Returns true when the client must upload to Cloudinary (local file, content URI, Metro URL, or non-public http(s)).
 */
export function shouldUploadProfileImageToCloudinary(uri: string): boolean {
  const raw = uri.trim();
  if (!raw) return true;

  if (isCallerAvatarPresetId(raw) || raw.startsWith('preset:')) {
    return false;
  }

  if (
    raw.startsWith('file:') ||
    raw.startsWith('content:') ||
    raw.startsWith('ph://') ||
    raw.startsWith('assets-library:') ||
    raw.startsWith('asset:')
  ) {
    return true;
  }

  // Cleartext HTTP is almost always Metro / LAN — never treat as public CDN.
  if (raw.startsWith('http:')) return true;

  if (!raw.startsWith('https:')) return true;

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname;
    if (host === 'localhost' || PRIVATE_OR_LOCAL_HOST.test(host)) return true;
    const port = parsed.port;
    if (port === '8081' || port === '19000' || port === '19001') return true;
    if (isMetroOrDevAssetUrl(raw)) return true;
  } catch {
    return true;
  }

  return false;
}
