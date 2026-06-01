"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleReceiverAvailabilityNotifications = scheduleReceiverAvailabilityNotifications;
const mongoose_1 = __importDefault(require("mongoose"));
const CallSession_1 = __importDefault(require("../models/CallSession"));
const Receiver_1 = __importDefault(require("../models/Receiver"));
const ReceiverAvailabilityNotification_1 = __importDefault(require("../models/ReceiverAvailabilityNotification"));
const User_1 = __importDefault(require("../models/User"));
const socketRegistry_1 = require("../socket/socketRegistry");
const RECENT_CALL_WINDOW_DAYS = 14;
const USER_RECEIVER_COOLDOWN_MS = 30 * 60 * 1000;
const GROUP_WINDOW_MS = 20 * 1000;
const pendingByUserId = new Map();
function receiverOnlineTitle(names) {
    if (names.length === 1)
        return `${names[0]} is online now`;
    return `${names.length} receivers are online now`;
}
function receiverOnlineSubtitle(names) {
    if (names.length === 1)
        return `Call ${names[0]} while she is available.`;
    const preview = names.slice(0, 2).join(', ');
    const more = names.length - 2;
    return more > 0
        ? `${preview} and ${more} more are available to call.`
        : `${preview} are available to call.`;
}
async function flushUserBatch(userId) {
    const pending = pendingByUserId.get(userId);
    if (!pending)
        return;
    pendingByUserId.delete(userId);
    const receiverIds = [...pending.receiverNamesById.keys()];
    if (receiverIds.length === 0)
        return;
    const names = [...pending.receiverNamesById.values()];
    await ReceiverAvailabilityNotification_1.default.create({
        userId: new mongoose_1.default.Types.ObjectId(userId),
        receiverIds: receiverIds.map((id) => new mongoose_1.default.Types.ObjectId(id)),
        title: receiverOnlineTitle(names),
        subtitle: receiverOnlineSubtitle(names),
    });
}
function enqueueForUser(userId, receiverId, receiverName) {
    const existing = pendingByUserId.get(userId);
    if (existing) {
        existing.receiverNamesById.set(receiverId, receiverName);
        return;
    }
    const batch = {
        receiverNamesById: new Map([[receiverId, receiverName]]),
        timer: null,
    };
    batch.timer = setTimeout(() => {
        void flushUserBatch(userId);
    }, GROUP_WINDOW_MS);
    pendingByUserId.set(userId, batch);
}
/**
 * Notify recent male callers only when a receiver is BOTH online and available.
 * - Limits targets to recent call history window
 * - Applies user+receiver cooldown
 * - Groups multiple receiver-online events in a short window per user
 */
async function scheduleReceiverAvailabilityNotifications(receiverId) {
    if (!mongoose_1.default.Types.ObjectId.isValid(receiverId))
        return;
    const rid = new mongoose_1.default.Types.ObjectId(receiverId);
    const receiver = await Receiver_1.default.findById(rid).select('name accountStatus suspended isAvailable');
    if (!receiver ||
        receiver.accountStatus !== 'approved' ||
        receiver.suspended ||
        !receiver.isAvailable ||
        !(0, socketRegistry_1.isReceiverSocketConnected)(receiverId)) {
        return;
    }
    const since = new Date(Date.now() - RECENT_CALL_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const callerIds = (await CallSession_1.default.distinct('callerId', {
        receiverId: rid,
        status: 'completed',
        startedAt: { $gte: since },
    }));
    if (callerIds.length === 0)
        return;
    const callers = await User_1.default.find({
        _id: { $in: callerIds },
        gender: 'male',
        accountStatus: 'approved',
        suspended: { $ne: true },
    })
        .select('_id')
        .lean();
    if (callers.length === 0)
        return;
    const cooldownSince = new Date(Date.now() - USER_RECEIVER_COOLDOWN_MS);
    const receiverName = receiver.name?.trim() || 'A receiver';
    for (const caller of callers) {
        const uid = String(caller._id);
        const recentlyNotified = await ReceiverAvailabilityNotification_1.default.exists({
            userId: caller._id,
            receiverIds: rid,
            createdAt: { $gte: cooldownSince },
        });
        if (recentlyNotified)
            continue;
        enqueueForUser(uid, receiverId, receiverName);
    }
}
