"use strict";
/**
 * Bridge from REST controllers to the in-memory call-invite state owned by `socket/chatSocket.ts`.
 * Native Android code (no JS running) uses these to decline an invite and to acknowledge that
 * the incoming-call notification actually rang on the device.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCallInviteActions = registerCallInviteActions;
exports.declineInviteByReceiver = declineInviteByReceiver;
exports.acknowledgeInviteRinging = acknowledgeInviteRinging;
exports.markInviteSeenByReceiver = markInviteSeenByReceiver;
exports.hasLiveInviteForReceiver = hasLiveInviteForReceiver;
exports.markReceiverRingAckCapable = markReceiverRingAckCapable;
exports.isReceiverRingAckCapable = isReceiverRingAckCapable;
let handlers = null;
function registerCallInviteActions(next) {
    handlers = next;
}
function declineInviteByReceiver(callId, receiverId) {
    return handlers?.declineByReceiver(callId, receiverId) ?? { ok: false, error: 'Unavailable' };
}
function acknowledgeInviteRinging(callId, receiverId) {
    return handlers?.acknowledgeRinging(callId, receiverId) ?? { ok: false, error: 'Unavailable' };
}
/** Receiver opened the incoming call (native notification tap, before JS / socket are up). */
function markInviteSeenByReceiver(callId, receiverId, foreground) {
    return (handlers?.markSeenByReceiver(callId, receiverId, foreground) ?? { ok: false, error: 'Unavailable' });
}
/** An unanswered-or-live invite from [callerId] is ringing / connected to [receiverId] right now. */
function hasLiveInviteForReceiver(callId, receiverId, callerId) {
    return handlers?.hasLiveInviteForReceiver(callId, receiverId, callerId) ?? false;
}
/**
 * Receivers whose app has sent at least one native ring ack (this server process). Only these are
 * held to the ack deadline — old app builds and iOS never ack and must not be marked unreachable.
 */
const ringAckCapableReceivers = new Set();
function markReceiverRingAckCapable(receiverId) {
    ringAckCapableReceivers.add(String(receiverId).trim());
}
function isReceiverRingAckCapable(receiverId) {
    return ringAckCapableReceivers.has(String(receiverId).trim());
}
