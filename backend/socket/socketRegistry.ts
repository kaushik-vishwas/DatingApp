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
