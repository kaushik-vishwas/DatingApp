"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pendingIncomingExpiresAt = pendingIncomingExpiresAt;
exports.setPendingIncomingCall = setPendingIncomingCall;
exports.clearPendingIncomingCall = clearPendingIncomingCall;
exports.getLivePendingIncomingCall = getLivePendingIncomingCall;
const Receiver_1 = __importDefault(require("../models/Receiver"));
const PENDING_TTL_MS = 16_000;
function pendingIncomingExpiresAt(from = Date.now()) {
    return new Date(from + PENDING_TTL_MS);
}
async function setPendingIncomingCall(receiverId, pending) {
    await Receiver_1.default.updateOne({ _id: receiverId }, {
        $set: {
            pendingIncomingCall: {
                callId: pending.callId,
                fromId: pending.fromId,
                fromType: pending.fromType,
                fromName: pending.fromName,
                fromImage: pending.fromImage,
                expiresAt: pending.expiresAt ?? pendingIncomingExpiresAt(),
            },
        },
    });
}
async function clearPendingIncomingCall(receiverId, callId) {
    if (callId) {
        await Receiver_1.default.updateOne({ _id: receiverId, 'pendingIncomingCall.callId': callId }, { $unset: { pendingIncomingCall: 1 } });
        return;
    }
    await Receiver_1.default.updateOne({ _id: receiverId }, { $unset: { pendingIncomingCall: 1 } });
}
async function getLivePendingIncomingCall(receiverId) {
    const recv = await Receiver_1.default.findById(receiverId)
        .select('pendingIncomingCall')
        .lean();
    const p = recv?.pendingIncomingCall;
    const callId = typeof p?.callId === 'string' ? p.callId.trim() : '';
    const fromId = typeof p?.fromId === 'string' ? p.fromId.trim() : '';
    const expiresAt = p?.expiresAt ? new Date(p.expiresAt) : null;
    if (!callId || !fromId || !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
        if (callId)
            await clearPendingIncomingCall(receiverId, callId);
        return null;
    }
    return {
        callId,
        fromId,
        fromType: p?.fromType === 'r' ? 'r' : 'u',
        fromName: typeof p?.fromName === 'string' && p.fromName.trim() ? p.fromName.trim() : 'Caller',
        fromImage: p?.fromImage ?? null,
        expiresAt,
    };
}
