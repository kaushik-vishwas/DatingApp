export type FixedPerMinuteWindow = {
  id: string;
  label: string;
  from: string;
  to: string;
  ratePerMinute: number;
};

const IST_OFFSET_MINUTES = 330;

function parseHm(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return null;
  }
  return h * 60 + min;
}

function istMinutesSinceMidnight(d: Date): number {
  const ist = new Date(d.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

function isInWindow(mins: number, fromMin: number, toMin: number): boolean {
  if (fromMin === toMin) return false;
  if (fromMin < toMin) return mins >= fromMin && mins < toMin;
  return mins >= fromMin || mins < toMin;
}

/** Current IST window rate (matches backend receiverEarningModel service). */
export function resolveFixedRatePerMinuteAt(at: Date, windows: FixedPerMinuteWindow[]): number {
  if (!windows.length) return 0;
  const mins = istMinutesSinceMidnight(at);
  for (const w of windows) {
    const fromMin = parseHm(w.from);
    const toMin = parseHm(w.to);
    if (fromMin == null || toMin == null) continue;
    if (isInWindow(mins, fromMin, toMin)) {
      return Math.max(0, w.ratePerMinute);
    }
  }
  return Math.max(0, windows[0]?.ratePerMinute ?? 0);
}
