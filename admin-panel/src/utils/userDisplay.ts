/** Row label for app users table (page-relative). */
export function appUserRowCode(page: number, limit: number, index: number): string {
  return `U${String((page - 1) * limit + index + 1).padStart(3, '0')}`;
}

export function formatJoinedDate(iso?: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export function formatPhoneIN(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length >= 10) {
    const last = d.slice(-10);
    return `+91 ${last.slice(0, 5)} ${last.slice(5)}`;
  }
  return phone;
}
