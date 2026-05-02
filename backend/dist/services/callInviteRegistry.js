"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPendingCallInvite = registerPendingCallInvite;
exports.unregisterPendingCallInvite = unregisterPendingCallInvite;
exports.hasPendingCallInviteForReceiver = hasPendingCallInviteForReceiver;
/**
 * Receivers with an in-memory call invite in chatSocket (ringing or in-call until `call:end`).
 * Used to tell whether an in-process invite explains `busyReceiverIds` vs a stale flag.
 */
const receiverIds = new Set();
function norm(id) {
    return String(id).trim();
}
function registerPendingCallInvite(receiverId) {
    receiverIds.add(norm(receiverId));
}
function unregisterPendingCallInvite(receiverId) {
    receiverIds.delete(norm(receiverId));
}
function hasPendingCallInviteForReceiver(receiverId) {
    return receiverIds.has(norm(receiverId));
}
