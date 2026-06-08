import mongoose from 'mongoose';
import type { Server } from 'socket.io';

let ioInstance: Server | null = null;

export function registerSocketIOServer(io: Server): void {
  ioInstance = io;
}

function accountRoom(typ: 'u' | 'r', accountId: string): string {
  const s = String(accountId).trim();
  if (mongoose.Types.ObjectId.isValid(s)) {
    return `account:${typ}:${new mongoose.Types.ObjectId(s).toString()}`;
  }
  return `account:${typ}:${s}`;
}

export function isAccountSocketConnected(typ: 'u' | 'r', accountId: string): boolean {
  if (!ioInstance) return false;
  const room = accountRoom(typ, accountId);
  return (ioInstance.sockets.adapter.rooms.get(room)?.size ?? 0) > 0;
}

export function isReceiverSocketConnected(receiverId: string): boolean {
  return isAccountSocketConnected('r', receiverId);
}

/** Receiver account rooms with at least one connected socket. */
export function getConnectedReceiverIds(): Set<string> {
  const ids = new Set<string>();
  if (!ioInstance) return ids;
  const prefix = 'account:r:';
  for (const roomName of ioInstance.sockets.adapter.rooms.keys()) {
    if (roomName.startsWith(prefix)) {
      ids.add(roomName.slice(prefix.length));
    }
  }
  return ids;
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

/** Notify both call participants that the voice session ended (REST fallback when socket `call:end` is missed). */
export function emitCallEndedToParticipants(
  callId: string,
  callerId: string,
  receiverId: string,
  fromType: 'u' | 'r',
  fromId: string
): void {
  if (!ioInstance) return;
  const payload = {
    callId: String(callId).trim(),
    fromType,
    fromId: String(fromId).trim(),
  };
  if (!payload.callId) return;
  ioInstance.to(accountRoom('u', callerId)).emit('call:ended', payload);
  ioInstance.to(accountRoom('r', receiverId)).emit('call:ended', payload);
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
