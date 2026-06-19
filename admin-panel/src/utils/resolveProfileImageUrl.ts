/** Matches app storage: `preset:male:3`, `preset:female:15`, etc. */
const PRESET_ID_RE = /^preset:(male|female):(\d+)$/i;

const MALE_PRESET_MAX = 39;
const FEMALE_PRESET_MAX = 27;

function withCacheBust(url: string, cacheKey?: string | null): string {
  if (!cacheKey?.trim()) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${encodeURIComponent(cacheKey.trim())}`;
}

/**
 * Resolve bundled preset ids to a URL the admin panel can load from `/public/presets`.
 * HTTPS URLs pass through unchanged. Unknown values return null (no broken links).
 */
export function resolveAdminProfileImageUrl(
  profileImage: string | null | undefined,
  cacheKey?: string | null
): string | null {
  if (!profileImage?.trim()) return null;
  const raw = profileImage.trim();

  const match = PRESET_ID_RE.exec(raw);
  if (match) {
    const gender = match[1].toLowerCase() as 'male' | 'female';
    const index = parseInt(match[2], 10);
    if (!Number.isFinite(index) || index < 1) return null;
    const max = gender === 'male' ? MALE_PRESET_MAX : FEMALE_PRESET_MAX;
    const n = Math.min(index, max);
    const prefix = gender === 'male' ? 'boyavt' : 'girlavt';
    const ext = gender === 'male' ? 'jpeg' : 'png';
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    return `${base}/presets/${gender}/${prefix}${n}.${ext}`;
  }

  if (/^https?:\/\//i.test(raw)) return withCacheBust(raw, cacheKey);
  return null;
}

export function isPresetProfileImage(profileImage: string | null | undefined): boolean {
  return Boolean(profileImage?.trim().startsWith('preset:'));
}
