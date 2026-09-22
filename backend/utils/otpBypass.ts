/**
 * Dev-only: when `OTP_BYPASS=true` in the active env file, skip SMS and accept any OTP.
 * Env is loaded once via `config/bootstrapEnv` before this module is imported.
 */
export function otpBypassEnabled(): boolean {
  const raw = process.env.OTP_BYPASS;
  if (raw == null) return false;
  const v = String(raw).trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}
