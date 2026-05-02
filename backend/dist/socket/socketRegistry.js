"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSocketIOServer = registerSocketIOServer;
exports.emitAuthSessionSuperseded = emitAuthSessionSuperseded;
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
