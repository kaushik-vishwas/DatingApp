/** UI-only validation helpers (no server round-trip for format checks). */

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  const e = normalizeEmail(email);
  if (!e) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

/** Parses DD/MM/YYYY; returns null if invalid. */
export function parseDobDDMMYYYY(s: string): Date | null {
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const y = Number(m[3]);
  const dt = new Date(y, mo, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
  return dt;
}

export function validateDobDDMMYYYY(s: string): string | null {
  if (!s.trim()) return 'Date of birth is required';
  if (!parseDobDDMMYYYY(s)) return 'Use DD/MM/YYYY with a valid date';
  return null;
}

/** At least 8 chars, one letter, one number (matches prior UI hint). */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (!/[a-zA-Z]/.test(password)) return 'Password must include a letter';
  if (!/\d/.test(password)) return 'Password must include a number';
  return null;
}

/** Indian 10-digit mobile (starts 6–9). */
export function normalizeIndianMobileDigits(input: string): string {
  const d = input.replace(/\D/g, '');
  if (d.length <= 10) return d;
  return d.slice(-10);
}

export function validateIndianMobileDigits(digits: string): string | null {
  const d = normalizeIndianMobileDigits(digits);
  if (d.length !== 10) return 'Enter a 10-digit mobile number';
  if (!/^[6-9]\d{9}$/.test(d)) return 'Enter a valid Indian mobile number';
  return null;
}

export function validateIfsc(ifsc: string): string | null {
  const u = ifsc.trim().toUpperCase();
  if (u.length !== 11) return 'IFSC must be 11 characters';
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(u)) return 'Invalid IFSC (e.g. HDFC0001234)';
  return null;
}

export function validateAccountNumberDigits(s: string): string | null {
  const d = s.replace(/\D/g, '');
  if (d.length < 9 || d.length > 18) return 'Account number must be 9–18 digits';
  return null;
}
