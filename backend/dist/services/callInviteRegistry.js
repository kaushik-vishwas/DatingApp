"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPendingCallInvite = registerPendingCallInvite;
exports.unregisterPendingCallInvite = unregisterPendingCallInvite;
exports.hasPendingCallInviteForReceiver = hasPendingCallInviteForReceiver;
/**
 * Receivers with an in-memory call invite in chatSocket (ringing or in-call until `call:end`).
 * Used to tell whether an in-process invite explains `busyReceiverIds` vs a stale flag.
 * Tracked per call so ending one call never clears a newer invite to the same receiver.
 */
const callIdsByReceiverId = new Map();
function norm(id) {
    return String(id).trim();
}
function registerPendingCallInvite(receiverId, callId) {
    const rid = norm(receiverId);
    const calls = callIdsByReceiverId.get(rid) ?? new Set();
    calls.add(norm(callId));
    callIdsByReceiverId.set(rid, calls);
}
function unregisterPendingCallInvite(receiverId, callId) {
    const rid = norm(receiverId);
    const calls = callIdsByReceiverId.get(rid);
    if (!calls)
        return;
    calls.delete(norm(callId));
    if (calls.size === 0)
        callIdsByReceiverId.delete(rid);
}
function hasPendingCallInviteForReceiver(receiverId) {
    return (callIdsByReceiverId.get(norm(receiverId))?.size ?? 0) > 0;
}
