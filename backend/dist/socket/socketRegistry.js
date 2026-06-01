"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSocketIOServer = registerSocketIOServer;
exports.isAccountSocketConnected = isAccountSocketConnected;
exports.isReceiverSocketConnected = isReceiverSocketConnected;
exports.getConnectedReceiverIds = getConnectedReceiverIds;
exports.emitAuthSessionSuperseded = emitAuthSessionSuperseded;
exports.emitReceiverApproved = emitReceiverApproved;
exports.emitReceiverRejected = emitReceiverRejected;
exports.emitCallerApproved = emitCallerApproved;
exports.emitCallerRejected = emitCallerRejected;
exports.emitCallerOnlineToReceiver = emitCallerOnlineToReceiver;
exports.emitReceiverWithdrawalUpdate = emitReceiverWithdrawalUpdate;
const mongoose_1 = __importDefault(require("mongoose"));
let ioInstance = null;
function registerSocketIOServer(io) {
    ioInstance = io;
}
function accountRoom(typ, accountId) {
    const s = String(accountId).trim();
    if (mongoose_1.default.Types.ObjectId.isValid(s)) {
        return `account:${typ}:${new mongoose_1.default.Types.ObjectId(s).toString()}`;
    }
    return `account:${typ}:${s}`;
}
function isAccountSocketConnected(typ, accountId) {
    if (!ioInstance)
        return false;
    const room = accountRoom(typ, accountId);
    return (ioInstance.sockets.adapter.rooms.get(room)?.size ?? 0) > 0;
}
function isReceiverSocketConnected(receiverId) {
    return isAccountSocketConnected('r', receiverId);
}
/** Receiver account rooms with at least one connected socket. */
function getConnectedReceiverIds() {
    const ids = new Set();
    if (!ioInstance)
        return ids;
    const prefix = 'account:r:';
    for (const roomName of ioInstance.sockets.adapter.rooms.keys()) {
        if (roomName.startsWith(prefix)) {
            ids.add(roomName.slice(prefix.length));
        }
    }
    return ids;
}
function emitAuthSessionSuperseded(typ, accountId, currentSessionVersion) {
    if (!ioInstance)
        return;
    const room = `account:${typ}:${String(accountId).trim()}`;
    ioInstance.to(room).emit('auth:session_superseded', { currentSessionVersion });
}
function emitReceiverApproved(accountId) {
    if (!ioInstance)
        return;
    const room = `account:r:${String(accountId).trim()}`;
    ioInstance.to(room).emit('approved');
}
function emitReceiverRejected(accountId, reason) {
    if (!ioInstance)
        return;
    const room = `account:r:${String(accountId).trim()}`;
    ioInstance.to(room).emit('rejected', { reason });
}
function emitCallerApproved(accountId) {
    if (!ioInstance)
        return;
    const room = `account:u:${String(accountId).trim()}`;
    ioInstance.to(room).emit('approved');
}
function emitCallerRejected(accountId, reason) {
    if (!ioInstance)
        return;
    const room = `account:u:${String(accountId).trim()}`;
    ioInstance.to(room).emit('rejected', { reason });
}
function emitCallerOnlineToReceiver(receiverId, payload) {
    if (!ioInstance)
        return;
    const room = `account:r:${String(receiverId).trim()}`;
    ioInstance.to(room).emit('caller:online', payload);
}
function emitReceiverWithdrawalUpdate(accountId, payload) {
    if (!ioInstance)
        return;
    const room = `account:r:${String(accountId).trim()}`;
    ioInstance.to(room).emit('withdrawal:update', {
        ...payload,
        at: payload.at ?? new Date().toISOString(),
    });
}
