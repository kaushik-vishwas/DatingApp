"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleCallerOnlineNotifications = scheduleCallerOnlineNotifications;
const mongoose_1 = __importDefault(require("mongoose"));
const CallSession_1 = __importDefault(require("../models/CallSession"));
const CallerOnlineNotification_1 = __importDefault(require("../models/CallerOnlineNotification"));
const Receiver_1 = __importDefault(require("../models/Receiver"));
const User_1 = __importDefault(require("../models/User"));
const socketRegistry_1 = require("../socket/socketRegistry");
const RECENT_CALL_WINDOW_DAYS = 14;
const RECEIVER_CALLER_COOLDOWN_MS = 30 * 60 * 1000;
const GROUP_WINDOW_MS = 20 * 1000;
const pendingByReceiverId = new Map();
function callerOnlineTitle(names) {
    if (names.length === 1)
        return `${names[0]} is online now`;
    return `${names.length} callers are online now`;
}
function callerOnlineSubtitle(names) {
    if (names.length === 1)
        return `Call ${names[0]} while he is available.`;
    const preview = names.slice(0, 2).join(', ');
    const more = names.length - 2;
    return more > 0
        ? `${preview} and ${more} more are available to call.`
        : `${preview} are available to call.`;
}
async function flushReceiverBatch(receiverId) {
    const pending = pendingByReceiverId.get(receiverId);
    if (!pending)
        return;
    pendingByReceiverId.delete(receiverId);
    const callerIds = [...pending.callerNamesById.keys()];
    if (callerIds.length === 0)
        return;
    const names = [...pending.callerNamesById.values()];
    const created = await CallerOnlineNotification_1.default.create({
        receiverId: new mongoose_1.default.Types.ObjectId(receiverId),
        callerIds: callerIds.map((id) => new mongoose_1.default.Types.ObjectId(id)),
        title: callerOnlineTitle(names),
        subtitle: callerOnlineSubtitle(names),
    });
    const primaryCallerId = callerIds[0] ?? '';
    const primaryName = names[0] ?? 'Caller';
    (0, socketRegistry_1.emitCallerOnlineToReceiver)(receiverId, {
        id: String(created._id),
        callerIds,
        callerName: primaryName,
        title: created.title,
        subtitle: created.subtitle,
        at: created.createdAt.toISOString(),
    });
}
function enqueueForReceiver(receiverId, callerId, callerName) {
    const existing = pendingByReceiverId.get(receiverId);
    if (existing) {
        existing.callerNamesById.set(callerId, callerName);
        return;
    }
    const batch = {
        callerNamesById: new Map([[callerId, callerName]]),
        timer: null,
    };
    batch.timer = setTimeout(() => {
        void flushReceiverBatch(receiverId);
    }, GROUP_WINDOW_MS);
    pendingByReceiverId.set(receiverId, batch);
}
/**
 * Notify receivers from recent call history when a male caller comes online.
 * Mirrors `scheduleReceiverAvailabilityNotifications` (14-day history, 30m cooldown, 20s batching).
 */
async function scheduleCallerOnlineNotifications(callerId) {
    if (!mongoose_1.default.Types.ObjectId.isValid(callerId))
        return;
    const uid = new mongoose_1.default.Types.ObjectId(callerId);
    const caller = await User_1.default.findById(uid).select('name gender accountStatus suspended');
    if (!caller ||
        caller.gender !== 'male' ||
        caller.accountStatus !== 'approved' ||
        caller.suspended) {
        return;
    }
    const since = new Date(Date.now() - RECENT_CALL_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const receiverIds = (await CallSession_1.default.distinct('receiverId', {
        callerId: uid,
        status: 'completed',
        startedAt: { $gte: since },
    }));
    if (receiverIds.length === 0)
        return;
    const receivers = await Receiver_1.default.find({
        _id: { $in: receiverIds },
        accountStatus: 'approved',
        suspended: { $ne: true },
    })
        .select('_id')
        .lean();
    if (receivers.length === 0)
        return;
    const callerName = caller.name?.trim() || 'Caller';
    const cooldownSince = new Date(Date.now() - RECEIVER_CALLER_COOLDOWN_MS);
    for (const receiver of receivers) {
        const rid = String(receiver._id);
        const recentlyNotified = await CallerOnlineNotification_1.default.exists({
            receiverId: receiver._id,
            callerIds: uid,
            createdAt: { $gte: cooldownSince },
        });
        if (recentlyNotified)
            continue;
        enqueueForReceiver(rid, callerId, callerName);
    }
}
