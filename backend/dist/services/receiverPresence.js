"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncReceiverPresenceInDatabase = syncReceiverPresenceInDatabase;
exports.isReceiverLoggedInForDiscover = isReceiverLoggedInForDiscover;
exports.isReceiverDiscoverAvailable = isReceiverDiscoverAvailable;
const Receiver_1 = __importDefault(require("../models/Receiver"));
const socketRegistry_1 = require("../socket/socketRegistry");
const receiverScore_1 = require("./receiverScore");
const callQueue_1 = require("./callQueue");
/**
 * DB `isOnline` reflects an active socket plus Go Online (`isAvailable`).
 * Callers discover presence uses live sockets separately; this keeps admin/queue state accurate.
 */
async function syncReceiverPresenceInDatabase(receiverId) {
    const rid = String(receiverId).trim();
    if (!rid)
        return;
    const receiver = await Receiver_1.default.findById(rid).select('isAvailable onlineSince isOnline');
    if (!receiver)
        return;
    const socketLive = (0, socketRegistry_1.isReceiverSocketConnected)(rid);
    const shouldBeOnline = socketLive && Boolean(receiver.isAvailable);
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
function isReceiverLoggedInForDiscover(receiverId) {
    return (0, socketRegistry_1.isReceiverSocketConnected)(receiverId);
}
/** Callable on discover: logged in (socket) and Go Online switch on in DB. */
function isReceiverDiscoverAvailable(receiverId, isAvailableFlag) {
    return isAvailableFlag && (0, socketRegistry_1.isReceiverSocketConnected)(receiverId);
}
