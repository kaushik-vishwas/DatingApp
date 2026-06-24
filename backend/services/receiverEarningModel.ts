import AdminSettings, { type IFixedPerMinuteWindow, type ReceiverEarningModel } from '../models/AdminSettings';

const IST_OFFSET_MINUTES = 330;

export type FixedPerMinuteSchedule = IFixedPerMinuteWindow[];

export const DEFAULT_RECEIVER_EARNING_MODEL: ReceiverEarningModel = 'score_based';

export const DEFAULT_FIXED_PER_MINUTE_WINDOWS: FixedPerMinuteSchedule = [
  { id: 'day', label: '6 AM – 9 PM', from: '06:00', to: '21:00', ratePerMinute: 1.8 },
  { id: 'evening', label: '9 PM – 11 PM', from: '21:00', to: '23:00', ratePerMinute: 1.9 },
  { id: 'night', label: '11 PM – 6 AM', from: '23:00', to: '06:00', ratePerMinute: 2 },
];

const LEGACY_FIXED_PER_MINUTE_WINDOWS: FixedPerMinuteSchedule = [
  { id: 'day', label: '6 AM – 9 PM', from: '06:00', to: '21:00', ratePerMinute: 2 },
  { id: 'evening', label: '9 PM – 11 PM', from: '21:00', to: '23:00', ratePerMinute: 2.2 },
  { id: 'night', label: '11 PM – 6 AM', from: '23:00', to: '06:00', ratePerMinute: 2.5 },
];

/** Prior 4-window defaults (auto-upgraded on read). */
const PREVIOUS_4_WINDOW_SCHEDULES: FixedPerMinuteSchedule[] = [
  [
    { id: 'morning', label: '6 AM – 9 AM', from: '06:00', to: '09:00', ratePerMinute: 1.7 },
    { id: 'day', label: '9 AM – 9 PM', from: '09:00', to: '21:00', ratePerMinute: 2 },
    { id: 'evening', label: '9 PM – 11 PM', from: '21:00', to: '23:00', ratePerMinute: 1.8 },
    { id: 'night', label: '11 PM – 6 AM', from: '23:00', to: '06:00', ratePerMinute: 2 },
  ],
  [
    { id: 'morning', label: '6 AM – 9 AM', from: '06:00', to: '09:00', ratePerMinute: 1.8 },
    { id: 'day', label: '9 AM – 9 PM', from: '09:00', to: '21:00', ratePerMinute: 2 },
    { id: 'evening', label: '9 PM – 11 PM', from: '21:00', to: '23:00', ratePerMinute: 1.9 },
    { id: 'night', label: '11 PM – 6 AM', from: '23:00', to: '06:00', ratePerMinute: 2 },
  ],
];

function matchesFixedPerMinuteSchedule(a: FixedPerMinuteSchedule, b: FixedPerMinuteSchedule): boolean {
  if (a.length !== b.length) return false;
  return a.every((w, i) => {
    const leg = b[i];
    return (
      w.id === leg.id &&
      w.from === leg.from &&
      w.to === leg.to &&
      w.ratePerMinute === leg.ratePerMinute
    );
  });
}

function isSplitMorningDaySchedule(windows: FixedPerMinuteSchedule): boolean {
  return (
    windows.length === 4 &&
    windows.some((w) => w.id === 'morning' && w.from === '06:00' && w.to === '09:00') &&
    windows.some((w) => w.id === 'day' && w.from === '09:00' && w.to === '21:00')
  );
}

function upgradeLegacyFixedPerMinuteWindows(windows: FixedPerMinuteSchedule): FixedPerMinuteSchedule {
  if (matchesFixedPerMinuteSchedule(windows, LEGACY_FIXED_PER_MINUTE_WINDOWS)) {
    return DEFAULT_FIXED_PER_MINUTE_WINDOWS.map((w) => ({ ...w }));
  }
  if (PREVIOUS_4_WINDOW_SCHEDULES.some((schedule) => matchesFixedPerMinuteSchedule(windows, schedule))) {
    return DEFAULT_FIXED_PER_MINUTE_WINDOWS.map((w) => ({ ...w }));
  }
  if (isSplitMorningDaySchedule(windows)) {
    return DEFAULT_FIXED_PER_MINUTE_WINDOWS.map((w) => ({ ...w }));
  }
  return windows;
}

export type ReceiverEarningSettings = {
  receiverEarningModel: ReceiverEarningModel;
  fixedPerMinuteWindows: FixedPerMinuteSchedule;
};

function roundInr(n: number): number {
  return Math.round(n * 100) / 100;
}

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

function toIstDate(d: Date): Date {
  return new Date(d.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
}

function istMinutesSinceMidnight(d: Date): number {
  const ist = toIstDate(d);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

function isInWindow(mins: number, fromMin: number, toMin: number): boolean {
  if (fromMin === toMin) return false;
  if (fromMin < toMin) return mins >= fromMin && mins < toMin;
  // Wraps midnight (e.g. 23:00 – 06:00)
  return mins >= fromMin || mins < toMin;
}

export function normalizeFixedPerMinuteWindows(
  raw: unknown
): FixedPerMinuteSchedule {
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_FIXED_PER_MINUTE_WINDOWS.map((w) => ({ ...w }));
  }
  const out: FixedPerMinuteSchedule = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const from = String(r.from ?? '').trim();
    const to = String(r.to ?? '').trim();
    const rate = Number(r.ratePerMinute);
    if (!parseHm(from) || !parseHm(to) || !Number.isFinite(rate) || rate < 0) continue;
    out.push({
      id: String(r.id ?? `${from}-${to}`).trim() || `${from}-${to}`,
      label: String(r.label ?? '').trim() || `${from} – ${to}`,
      from,
      to,
      ratePerMinute: roundInr(rate),
    });
  }
  if (out.length === 0) {
    return DEFAULT_FIXED_PER_MINUTE_WINDOWS.map((w) => ({ ...w }));
  }
  return upgradeLegacyFixedPerMinuteWindows(out);
}

export function resolveFixedRatePerMinuteAt(at: Date, windows: FixedPerMinuteSchedule): number {
  const schedule =
    windows.length > 0 ? windows : DEFAULT_FIXED_PER_MINUTE_WINDOWS;
  const mins = istMinutesSinceMidnight(at);
  for (const w of schedule) {
    const fromMin = parseHm(w.from);
    const toMin = parseHm(w.to);
    if (fromMin == null || toMin == null) continue;
    if (isInWindow(mins, fromMin, toMin)) {
      return Math.max(0, w.ratePerMinute);
    }
  }
  return DEFAULT_FIXED_PER_MINUTE_WINDOWS[0].ratePerMinute;
}

/**
 * Prorate talk time across IST windows (reads current admin rates each call).
 */
export function computeProratedFixedEarningsInr(
  talkStart: Date,
  talkEnd: Date,
  windows: FixedPerMinuteSchedule
): number {
  const startMs = talkStart.getTime();
  const endMs = talkEnd.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return 0;
  }
  let total = 0;
  let cursor = startMs;
  while (cursor < endMs) {
    const sliceEnd = Math.min(cursor + 60_000, endMs);
    const fracMin = (sliceEnd - cursor) / 60_000;
    const rate = resolveFixedRatePerMinuteAt(new Date(cursor), windows);
    total += fracMin * rate;
    cursor = sliceEnd;
  }
  return roundInr(total);
}

let cachedSettings: { at: number; value: ReceiverEarningSettings } | null = null;
const CACHE_MS = 5_000;

export async function getReceiverEarningSettings(): Promise<ReceiverEarningSettings> {
  const now = Date.now();
  if (cachedSettings && now - cachedSettings.at < CACHE_MS) {
    return cachedSettings.value;
  }
  const doc = await AdminSettings.findOne({})
    .select('receiverEarningModel fixedPerMinuteWindows')
    .lean<{ receiverEarningModel?: ReceiverEarningModel; fixedPerMinuteWindows?: unknown } | null>();
  const model: ReceiverEarningModel =
    doc?.receiverEarningModel === 'fixed_per_minute' ? 'fixed_per_minute' : 'score_based';
  const value: ReceiverEarningSettings = {
    receiverEarningModel: model,
    fixedPerMinuteWindows: normalizeFixedPerMinuteWindows(doc?.fixedPerMinuteWindows),
  };
  cachedSettings = { at: now, value };
  return value;
}

export function clearReceiverEarningSettingsCache(): void {
  cachedSettings = null;
}

export function publicEarningSchedulePayload(settings: ReceiverEarningSettings): {
  receiverEarningModel: ReceiverEarningModel;
  earningRatePerMinute: number;
  fixedPerMinuteWindows: FixedPerMinuteSchedule;
  timezone: string;
} {
  const now = new Date();
  return {
    receiverEarningModel: settings.receiverEarningModel,
    earningRatePerMinute:
      settings.receiverEarningModel === 'fixed_per_minute'
        ? resolveFixedRatePerMinuteAt(now, settings.fixedPerMinuteWindows)
        : 0,
    fixedPerMinuteWindows: settings.fixedPerMinuteWindows.map((w) => ({ ...w })),
    timezone: 'Asia/Kolkata',
  };
}
