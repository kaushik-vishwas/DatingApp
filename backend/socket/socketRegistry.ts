import type { Server } from 'socket.io';

let ioInstance: Server | null = null;

export function registerSocketIOServer(io: Server): void {
  ioInstance = io;
}

export function emitAuthSessionSuperseded(typ: 'u' | 'r', accountId: string, currentSessionVersion: number): void {
  if (!ioInstance) return;
  const room = `account:${typ}:${String(accountId).trim()}`;
  ioInstance.to(room).emit('auth:session_superseded', { currentSessionVersion });
}

export function emitReceiverApproved(accountId: string): void {
  if (!ioInstance) return;
  const room = `account:r:${String(accountId).trim()}`;
  ioInstance.to(room).emit('approved');
}

export function emitReceiverRejected(accountId: string, reason: string): void {
  if (!ioInstance) return;
  const room = `account:r:${String(accountId).trim()}`;
  ioInstance.to(room).emit('rejected', { reason });
}
