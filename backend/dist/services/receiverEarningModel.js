"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_FIXED_PER_MINUTE_WINDOWS = exports.DEFAULT_RECEIVER_EARNING_MODEL = void 0;
exports.normalizeFixedPerMinuteWindows = normalizeFixedPerMinuteWindows;
exports.resolveFixedRatePerMinuteAt = resolveFixedRatePerMinuteAt;
exports.computeProratedFixedEarningsInr = computeProratedFixedEarningsInr;
exports.getReceiverEarningSettings = getReceiverEarningSettings;
exports.clearReceiverEarningSettingsCache = clearReceiverEarningSettingsCache;
exports.publicEarningSchedulePayload = publicEarningSchedulePayload;
const AdminSettings_1 = __importDefault(require("../models/AdminSettings"));
const IST_OFFSET_MINUTES = 330;
exports.DEFAULT_RECEIVER_EARNING_MODEL = 'score_based';
exports.DEFAULT_FIXED_PER_MINUTE_WINDOWS = [
    { id: 'day', label: '6 AM – 9 PM', from: '06:00', to: '21:00', ratePerMinute: 2 },
    { id: 'evening', label: '9 PM – 11 PM', from: '21:00', to: '23:00', ratePerMinute: 2.2 },
    { id: 'night', label: '11 PM – 6 AM', from: '23:00', to: '06:00', ratePerMinute: 2.5 },
];
function roundInr(n) {
    return Math.round(n * 100) / 100;
}
function parseHm(value) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim());
    if (!m)
        return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) {
        return null;
    }
    return h * 60 + min;
}
function toIstDate(d) {
    return new Date(d.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
}
function istMinutesSinceMidnight(d) {
    const ist = toIstDate(d);
    return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}
function isInWindow(mins, fromMin, toMin) {
    if (fromMin === toMin)
        return false;
    if (fromMin < toMin)
        return mins >= fromMin && mins < toMin;
    // Wraps midnight (e.g. 23:00 – 06:00)
    return mins >= fromMin || mins < toMin;
}
function normalizeFixedPerMinuteWindows(raw) {
    if (!Array.isArray(raw) || raw.length === 0) {
        return exports.DEFAULT_FIXED_PER_MINUTE_WINDOWS.map((w) => ({ ...w }));
    }
    const out = [];
    for (const row of raw) {
        if (!row || typeof row !== 'object')
            continue;
        const r = row;
        const from = String(r.from ?? '').trim();
        const to = String(r.to ?? '').trim();
        const rate = Number(r.ratePerMinute);
        if (!parseHm(from) || !parseHm(to) || !Number.isFinite(rate) || rate < 0)
            continue;
        out.push({
            id: String(r.id ?? `${from}-${to}`).trim() || `${from}-${to}`,
            label: String(r.label ?? '').trim() || `${from} – ${to}`,
            from,
            to,
            ratePerMinute: roundInr(rate),
        });
    }
    return out.length > 0 ? out : exports.DEFAULT_FIXED_PER_MINUTE_WINDOWS.map((w) => ({ ...w }));
}
function resolveFixedRatePerMinuteAt(at, windows) {
    const schedule = windows.length > 0 ? windows : exports.DEFAULT_FIXED_PER_MINUTE_WINDOWS;
    const mins = istMinutesSinceMidnight(at);
    for (const w of schedule) {
        const fromMin = parseHm(w.from);
        const toMin = parseHm(w.to);
        if (fromMin == null || toMin == null)
            continue;
        if (isInWindow(mins, fromMin, toMin)) {
            return Math.max(0, w.ratePerMinute);
        }
    }
    return exports.DEFAULT_FIXED_PER_MINUTE_WINDOWS[0].ratePerMinute;
}
/**
 * Prorate talk time across IST windows (reads current admin rates each call).
 */
function computeProratedFixedEarningsInr(talkStart, talkEnd, windows) {
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
let cachedSettings = null;
const CACHE_MS = 5_000;
async function getReceiverEarningSettings() {
    const now = Date.now();
    if (cachedSettings && now - cachedSettings.at < CACHE_MS) {
        return cachedSettings.value;
    }
    const doc = await AdminSettings_1.default.findOne({})
        .select('receiverEarningModel fixedPerMinuteWindows')
        .lean();
    const model = doc?.receiverEarningModel === 'fixed_per_minute' ? 'fixed_per_minute' : 'score_based';
    const value = {
        receiverEarningModel: model,
        fixedPerMinuteWindows: normalizeFixedPerMinuteWindows(doc?.fixedPerMinuteWindows),
    };
    cachedSettings = { at: now, value };
    return value;
}
function clearReceiverEarningSettingsCache() {
    cachedSettings = null;
}
function publicEarningSchedulePayload(settings) {
    const now = new Date();
    return {
        receiverEarningModel: settings.receiverEarningModel,
        earningRatePerMinute: settings.receiverEarningModel === 'fixed_per_minute'
            ? resolveFixedRatePerMinuteAt(now, settings.fixedPerMinuteWindows)
            : 0,
        fixedPerMinuteWindows: settings.fixedPerMinuteWindows.map((w) => ({ ...w })),
        timezone: 'Asia/Kolkata',
    };
}
