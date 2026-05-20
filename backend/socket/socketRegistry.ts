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

export function emitCallerApproved(accountId: string): void {
  if (!ioInstance) return;
  const room = `account:u:${String(accountId).trim()}`;
  ioInstance.to(room).emit('approved');
}

export function emitCallerRejected(accountId: string, reason: string): void {
  if (!ioInstance) return;
  const room = `account:u:${String(accountId).trim()}`;
  ioInstance.to(room).emit('rejected', { reason });
}

export function emitCallerOnlineToReceiver(
  receiverId: string,
  payload: {
    id: string;
    callerIds: string[];
    callerName: string;
    title: string;
    subtitle: string;
    at: string;
  }
): void {
  if (!ioInstance) return;
  const room = `account:r:${String(receiverId).trim()}`;
  ioInstance.to(room).emit('caller:online', payload);
}

export function emitReceiverWithdrawalUpdate(
  accountId: string,
  payload: {
    withdrawalId: string;
    amount: number;
    payoutStatus: 'processing' | 'success' | 'failed';
    message: string;
    at?: string;
  }
): void {
  if (!ioInstance) return;
  const room = `account:r:${String(accountId).trim()}`;
  ioInstance.to(room).emit('withdrawal:update', {
    ...payload,
    at: payload.at ?? new Date().toISOString(),
  });
}
