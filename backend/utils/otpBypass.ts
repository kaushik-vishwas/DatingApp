import { loadEnv } from '../config/loadEnv';

let envEnsured = false;

function ensureEnvLoaded(): void {
  if (envEnsured) return;
  loadEnv();
  envEnsured = true;
}

/**
 * Dev-only: when `OTP_BYPASS=true` in backend/.env, skip SMS and accept any OTP.
 * Trims value so Windows CRLF / trailing spaces cannot silently disable bypass.
 */
export function otpBypassEnabled(): boolean {
  ensureEnvLoaded();
  const raw = process.env.OTP_BYPASS;
  if (raw == null) return false;
  const v = String(raw).trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}
