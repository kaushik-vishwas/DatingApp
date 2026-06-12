import fs from 'fs';
import path from 'path';

let cachedBaseUrl: string | null = null;

/** Change URL in repo root `config/referralLanding.json` (or set REFERRAL_SHARE_BASE_URL on server). */
export function getReferralLandingBaseUrl(): string {
  if (cachedBaseUrl) return cachedBaseUrl;

  const fromEnv = process.env.REFERRAL_SHARE_BASE_URL?.trim();
  if (fromEnv) {
    cachedBaseUrl = fromEnv.replace(/\/+$/, '');
    return cachedBaseUrl;
  }

  const candidates = [
    path.join(__dirname, '..', 'config', 'referralLanding.json'),
    path.join(__dirname, '..', '..', 'config', 'referralLanding.json'),
    path.join(process.cwd(), 'config', 'referralLanding.json'),
    path.join(process.cwd(), '..', 'config', 'referralLanding.json'),
  ];

  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { referralLandingBaseUrl?: string };
      const url = String(raw.referralLandingBaseUrl ?? '').trim();
      if (url) {
        cachedBaseUrl = url.replace(/\/+$/, '');
        return cachedBaseUrl;
      }
    } catch {
      /* try next path */
    }
  }

  throw new Error(
    'referralLandingBaseUrl not configured. Set config/referralLanding.json or REFERRAL_SHARE_BASE_URL.'
  );
}
