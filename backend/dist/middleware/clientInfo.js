"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LAST_CLIENT_RING_REFRESH_MS = exports.DEVICE_HEADER = void 0;
exports.parseClientInfo = parseClientInfo;
exports.recordReceiverLastClient = recordReceiverLastClient;
exports.trackClientInfo = trackClientInfo;
const Receiver_1 = __importDefault(require("../models/Receiver"));
const appVersionGate_1 = require("./appVersionGate");
exports.DEVICE_HEADER = 'x-device';
/** Normal app traffic refreshes the stored device at most once a day (or when it changes). */
const LAST_CLIENT_REFRESH_MS = 24 * 60 * 60 * 1000;
/** Ring acks refresh it hourly so ring events always carry a recent device. */
exports.LAST_CLIENT_RING_REFRESH_MS = 60 * 60 * 1000;
const MAX_FIELD_LENGTH = 60;
function cleanField(value) {
    return String(value ?? '')
        .replace(/[^\x20-\x7E]/g, '')
        .trim()
        .slice(0, MAX_FIELD_LENGTH);
}
/** Parses "mfr=Xiaomi; model=Redmi Note 12; os=14; sdk=34" + X-App-Version. Null when absent. */
function parseClientInfo(req) {
    const raw = req.headers[exports.DEVICE_HEADER];
    const header = Array.isArray(raw) ? raw[0] : raw;
    if (typeof header !== 'string' || !header.trim())
        return null;
    const parts = {};
    for (const piece of header.slice(0, 200).split(';')) {
        const eq = piece.indexOf('=');
        if (eq <= 0)
            continue;
        parts[piece.slice(0, eq).trim().toLowerCase()] = piece.slice(eq + 1);
    }
    const sdk = Number(parts.sdk);
    return {
        mfr: cleanField(parts.mfr),
        model: cleanField(parts.model),
        os: cleanField(parts.os),
        sdk: Number.isFinite(sdk) && sdk > 0 ? Math.floor(sdk) : null,
        appVersionCode: (0, appVersionGate_1.parseAppVersionCode)(req.headers[appVersionGate_1.APP_VERSION_HEADER]),
    };
}
function signature(info) {
    return [info.mfr, info.model, info.os, info.sdk ?? '', info.appVersionCode ?? ''].join('|');
}
/** receiverId → last write attempt (this process) so busy request streams skip the DB entirely. */
const recentWrites = new Map();
const MAX_TRACKED = 20_000;
/**
 * Stores the receiver's device when it is missing, changed, or older than [maxAgeMs].
 * Best-effort: never throws.
 */
async function recordReceiverLastClient(receiverId, info, maxAgeMs = LAST_CLIENT_REFRESH_MS) {
    const id = String(receiverId).trim();
    if (!id)
        return;
    const sig = signature(info);
    const now = Date.now();
    const prev = recentWrites.get(id);
    if (prev && prev.sig === sig && now - prev.at < maxAgeMs)
        return;
    if (recentWrites.size >= MAX_TRACKED)
        recentWrites.clear();
    recentWrites.set(id, { sig, at: now });
    try {
        await Receiver_1.default.updateOne({
            _id: id,
            $or: [
                { lastClient: null },
                { 'lastClient.seenAt': { $lt: new Date(now - maxAgeMs) } },
                { 'lastClient.mfr': { $ne: info.mfr } },
                { 'lastClient.model': { $ne: info.model } },
                { 'lastClient.os': { $ne: info.os } },
                { 'lastClient.appVersionCode': { $ne: info.appVersionCode } },
            ],
        }, { $set: { lastClient: { ...info, seenAt: new Date(now) } } });
    }
    catch (err) {
        console.warn('recordReceiverLastClient failed', {
            receiverId: id,
            error: err instanceof Error ? err.message : String(err),
        });
    }
}
/** Never blocks a request: after the response, remembers the signed-in receiver's device. */
function trackClientInfo(req, res, next) {
    const info = parseClientInfo(req);
    if (info) {
        res.on('finish', () => {
            if (req.accountKind !== 'receiver' || !req.receiver?._id)
                return;
            void recordReceiverLastClient(String(req.receiver._id), info);
        });
    }
    next();
}
