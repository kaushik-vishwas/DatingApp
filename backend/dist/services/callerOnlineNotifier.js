"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleCallerOnlineNotifications = scheduleCallerOnlineNotifications;
const mongoose_1 = __importDefault(require("mongoose"));
const CallerOnlineNotification_1 = __importDefault(require("../models/CallerOnlineNotification"));
const Receiver_1 = __importDefault(require("../models/Receiver"));
const expoPush_1 = require("./expoPush");
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
    try {
        const receiver = await Receiver_1.default.findById(receiverId)
            .select('expoPushToken')
            .lean();
        const token = receiver?.expoPushToken?.trim() ?? '';
        if (!token)
            return;
        void (0, expoPush_1.sendOnlinePresencePush)({
            expoPushToken: token,
            title: created.title,
            body: created.subtitle,
            data: {
                type: 'caller_online',
            },
        });
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('caller online presence push error:', msg);
    }
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
 * Disabled — receivers should not get "caller is online" alerts.
 */
async function scheduleCallerOnlineNotifications(_callerId) {
    return;
}
