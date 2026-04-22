/** Local calendar helpers — labels sent as `YYYY-MM-DD` must match what the user picked. */

export function formatDateOnlyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function ageFromLocalCalendarBirthDate(dob: Date, now: Date = new Date()): number {
  let age = now.getFullYear() - dob.getFullYear();
  const md = now.getMonth() - dob.getMonth();
  if (md < 0 || (md === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

export function parseDateOnlyLocalToDate(iso: string): Date | null {
  const s = iso.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

export function maxDobDateForMinAge(minAge: number, now: Date = new Date()): Date {
  const d = new Date(now.getFullYear() - minAge, now.getMonth(), now.getDate());
  return d;
}

export function minDobDateForMaxAge(maxAge: number, now: Date = new Date()): Date {
  return new Date(now.getFullYear() - maxAge, now.getMonth(), now.getDate());
}
