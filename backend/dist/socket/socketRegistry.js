"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSocketIOServer = registerSocketIOServer;
exports.emitAuthSessionSuperseded = emitAuthSessionSuperseded;
exports.emitReceiverApproved = emitReceiverApproved;
exports.emitReceiverRejected = emitReceiverRejected;
exports.emitCallerApproved = emitCallerApproved;
exports.emitCallerRejected = emitCallerRejected;
exports.emitReceiverWithdrawalUpdate = emitReceiverWithdrawalUpdate;
let ioInstance = null;
function registerSocketIOServer(io) {
    ioInstance = io;
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
function emitReceiverWithdrawalUpdate(accountId, payload) {
    if (!ioInstance)
        return;
    const room = `account:r:${String(accountId).trim()}`;
    ioInstance.to(room).emit('withdrawal:update', {
        ...payload,
        at: payload.at ?? new Date().toISOString(),
    });
}
