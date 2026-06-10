"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RECEIVER_DISCOVER_GRACE_MS = void 0;
exports.isReceiverInDiscoverGrace = isReceiverInDiscoverGrace;
exports.isReceiverDiscoverPresenceLive = isReceiverDiscoverPresenceLive;
exports.armReceiverDiscoverGraceImmediate = armReceiverDiscoverGraceImmediate;
exports.clearReceiverDiscoverGrace = clearReceiverDiscoverGrace;
exports.armReceiverDiscoverGrace = armReceiverDiscoverGrace;
exports.touchReceiverBackgroundPresence = touchReceiverBackgroundPresence;
exports.touchReceiverForegroundPresence = touchReceiverForegroundPresence;
exports.syncReceiverPresenceInDatabase = syncReceiverPresenceInDatabase;
exports.isReceiverLoggedInForDiscover = isReceiverLoggedInForDiscover;
exports.isReceiverDiscoverAvailable = isReceiverDiscoverAvailable;
const Receiver_1 = __importDefault(require("../models/Receiver"));
const socketRegistry_1 = require("../socket/socketRegistry");
const receiverScore_1 = require("./receiverScore");
const callQueue_1 = require("./callQueue");
/** Keep receivers visible as online on discover after background/minimize socket loss (all Android OEMs). */
exports.RECEIVER_DISCOVER_GRACE_MS = 5 * 60 * 1000;
const discoverGraceUntilByReceiverId = new Map();
const discoverGraceExpireTimers = new Map();
function normalizeReceiverId(receiverId) {
    return String(receiverId).trim();
}
function graceUntilDate(untilMs) {
    return new Date(untilMs);
}
function isDbGraceLive(discoverGraceUntil) {
    return discoverGraceUntil instanceof Date && discoverGraceUntil.getTime() > Date.now();
}
function isReceiverInDiscoverGrace(receiverId, discoverGraceUntil) {
    const rid = normalizeReceiverId(receiverId);
    const until = discoverGraceUntilByReceiverId.get(rid);
    if (typeof until === 'number' && Date.now() < until)
        return true;
    if (isDbGraceLive(discoverGraceUntil))
        return true;
    return false;
}
/** Socket connected now, or within the 5-minute post-disconnect grace while Go Online is on. */
function isReceiverDiscoverPresenceLive(receiverId, discoverGraceUntil) {
    const rid = normalizeReceiverId(receiverId);
    return (0, socketRegistry_1.isReceiverSocketConnected)(rid) || isReceiverInDiscoverGrace(rid, discoverGraceUntil);
}
function scheduleGraceExpiry(rid) {
    const prev = discoverGraceExpireTimers.get(rid);
    if (prev)
        clearTimeout(prev);
    discoverGraceExpireTimers.set(rid, setTimeout(() => {
        discoverGraceUntilByReceiverId.delete(rid);
        discoverGraceExpireTimers.delete(rid);
        void Receiver_1.default.findByIdAndUpdate(rid, { discoverGraceUntil: null }).exec();
        void syncReceiverPresenceInDatabase(rid);
    }, exports.RECEIVER_DISCOVER_GRACE_MS));
}
/** Synchronous in-memory + DB grace arm — safe to call from socket disconnect before any await. */
function armReceiverDiscoverGraceImmediate(receiverId) {
    const rid = normalizeReceiverId(receiverId);
    if (!rid)
        return 0;
    const until = Date.now() + exports.RECEIVER_DISCOVER_GRACE_MS;
    discoverGraceUntilByReceiverId.set(rid, until);
    scheduleGraceExpiry(rid);
    void Receiver_1.default.findByIdAndUpdate(rid, { discoverGraceUntil: graceUntilDate(until) }).exec();
    return until;
}
function clearReceiverDiscoverGrace(receiverId) {
    const rid = normalizeReceiverId(receiverId);
    discoverGraceUntilByReceiverId.delete(rid);
    const timer = discoverGraceExpireTimers.get(rid);
    if (timer) {
        clearTimeout(timer);
        discoverGraceExpireTimers.delete(rid);
    }
    void Receiver_1.default.findByIdAndUpdate(rid, { discoverGraceUntil: null }).exec();
}
function armReceiverDiscoverGrace(receiverId) {
    return armReceiverDiscoverGraceImmediate(receiverId);
}
/** Client-driven (minimize): arm grace before the socket disconnect reaches the server. */
async function touchReceiverBackgroundPresence(receiverId) {
    const rid = normalizeReceiverId(receiverId);
    const receiver = await Receiver_1.default.findById(rid).select('isAvailable').lean();
    if (!receiver?.isAvailable) {
        clearReceiverDiscoverGrace(rid);
        await syncReceiverPresenceInDatabase(rid);
        return { ok: false, graceUntilMs: 0, reason: 'isAvailable_false' };
    }
    const graceUntilMs = armReceiverDiscoverGraceImmediate(rid);
    await syncReceiverPresenceInDatabase(rid);
    return { ok: true, graceUntilMs };
}
/** App returned foreground with a live socket — drop grace so presence tracks the real connection. */
async function touchReceiverForegroundPresence(receiverId) {
    const rid = normalizeReceiverId(receiverId);
    if ((0, socketRegistry_1.isReceiverSocketConnected)(rid)) {
        clearReceiverDiscoverGrace(rid);
    }
    await syncReceiverPresenceInDatabase(rid);
}
/**
 * DB `isOnline` reflects Go Online (`isAvailable`) plus live socket or 5-minute background grace.
 * Callers discover uses `isReceiverDiscoverPresenceLive` for the online badge.
 */
async function syncReceiverPresenceInDatabase(receiverId) {
    const rid = normalizeReceiverId(receiverId);
    if (!rid)
        return;
    const receiver = await Receiver_1.default.findById(rid).select('isAvailable onlineSince isOnline discoverGraceUntil');
    if (!receiver)
        return;
    const socketLive = (0, socketRegistry_1.isReceiverSocketConnected)(rid);
    const graceLive = isReceiverInDiscoverGrace(rid, receiver.discoverGraceUntil);
    const presenceLive = socketLive || graceLive;
    const shouldBeOnline = presenceLive && Boolean(receiver.isAvailable);
    const wasOnline = Boolean(receiver.isOnline);
    const onlineSince = receiver.onlineSince;
    if (shouldBeOnline && !wasOnline) {
        receiver.isOnline = true;
        if (!(onlineSince instanceof Date)) {
            receiver.onlineSince = new Date();
        }
        await receiver.save();
        await (0, callQueue_1.syncReceiverQueueState)(rid);
        return;
    }
    if (!shouldBeOnline && wasOnline) {
        receiver.isOnline = false;
        receiver.onlineSince = null;
        await receiver.save();
        if (onlineSince instanceof Date) {
            await (0, receiverScore_1.finalizeReceiverOnlineSession)({
                receiverId: rid,
                onlineSince,
                endedAt: new Date(),
            });
        }
        await (0, callQueue_1.syncReceiverQueueState)(rid);
        return;
    }
    if (shouldBeOnline !== wasOnline) {
        receiver.isOnline = shouldBeOnline;
        await receiver.save();
    }
    await (0, callQueue_1.syncReceiverQueueState)(rid);
}
/** Whether callers should treat this receiver as logged-in right now. */
function isReceiverLoggedInForDiscover(receiverId, discoverGraceUntil) {
    return isReceiverDiscoverPresenceLive(receiverId, discoverGraceUntil);
}
/** Callable on discover: Go Online switch on (socket optional while app is backgrounded). */
function isReceiverDiscoverAvailable(receiverId, isAvailableFlag) {
    return isAvailableFlag;
}
