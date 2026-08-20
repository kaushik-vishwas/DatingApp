import Receiver from '../models/Receiver';

const PENDING_TTL_MS = 16_000;

export type PendingIncomingCall = {
  callId: string;
  fromId: string;
  fromType: 'u' | 'r';
  fromName: string;
  fromImage: string | null;
  expiresAt: Date;
};

export function pendingIncomingExpiresAt(from = Date.now()): Date {
  return new Date(from + PENDING_TTL_MS);
}

export async function setPendingIncomingCall(
  receiverId: string,
  pending: Omit<PendingIncomingCall, 'expiresAt'> & { expiresAt?: Date }
): Promise<void> {
  await Receiver.updateOne(
    { _id: receiverId },
    {
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
    }
  );
}

export async function clearPendingIncomingCall(receiverId: string, callId?: string): Promise<void> {
  if (callId) {
    await Receiver.updateOne(
      { _id: receiverId, 'pendingIncomingCall.callId': callId },
      { $unset: { pendingIncomingCall: 1 } }
    );
    return;
  }
  await Receiver.updateOne({ _id: receiverId }, { $unset: { pendingIncomingCall: 1 } });
}

export async function getLivePendingIncomingCall(
  receiverId: string
): Promise<PendingIncomingCall | null> {
  const recv = await Receiver.findById(receiverId)
    .select('pendingIncomingCall')
    .lean<{
      pendingIncomingCall?: {
        callId?: string;
        fromId?: string;
        fromType?: string;
        fromName?: string;
        fromImage?: string | null;
        expiresAt?: Date;
      } | null;
    } | null>();
  const p = recv?.pendingIncomingCall;
  const callId = typeof p?.callId === 'string' ? p.callId.trim() : '';
  const fromId = typeof p?.fromId === 'string' ? p.fromId.trim() : '';
  const expiresAt = p?.expiresAt ? new Date(p.expiresAt) : null;
  if (!callId || !fromId || !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    if (callId) await clearPendingIncomingCall(receiverId, callId);
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
