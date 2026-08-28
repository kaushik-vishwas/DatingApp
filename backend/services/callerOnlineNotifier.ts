import mongoose from 'mongoose';
import CallSession from '../models/CallSession';
import CallerOnlineNotification from '../models/CallerOnlineNotification';
import Receiver from '../models/Receiver';
import User from '../models/User';
import { sendOnlinePresencePush } from './expoPush';
import { emitCallerOnlineToReceiver } from '../socket/socketRegistry';

const RECENT_CALL_WINDOW_DAYS = 14;
const RECEIVER_CALLER_COOLDOWN_MS = 30 * 60 * 1000;
const GROUP_WINDOW_MS = 20 * 1000;

type PendingReceiverBatch = {
  callerNamesById: Map<string, string>;
  timer: NodeJS.Timeout | null;
};

const pendingByReceiverId = new Map<string, PendingReceiverBatch>();

function callerOnlineTitle(names: string[]): string {
  if (names.length === 1) return `${names[0]} is online now`;
  return `${names.length} callers are online now`;
}

function callerOnlineSubtitle(names: string[]): string {
  if (names.length === 1) return `Call ${names[0]} while he is available.`;
  const preview = names.slice(0, 2).join(', ');
  const more = names.length - 2;
  return more > 0
    ? `${preview} and ${more} more are available to call.`
    : `${preview} are available to call.`;
}

async function flushReceiverBatch(receiverId: string): Promise<void> {
  const pending = pendingByReceiverId.get(receiverId);
  if (!pending) return;
  pendingByReceiverId.delete(receiverId);

  const callerIds = [...pending.callerNamesById.keys()];
  if (callerIds.length === 0) return;
  const names = [...pending.callerNamesById.values()];

  const created = await CallerOnlineNotification.create({
    receiverId: new mongoose.Types.ObjectId(receiverId),
    callerIds: callerIds.map((id) => new mongoose.Types.ObjectId(id)),
    title: callerOnlineTitle(names),
    subtitle: callerOnlineSubtitle(names),
  });

  const primaryCallerId = callerIds[0] ?? '';
  const primaryName = names[0] ?? 'Caller';
  emitCallerOnlineToReceiver(receiverId, {
    id: String(created._id),
    callerIds,
    callerName: primaryName,
    title: created.title,
    subtitle: created.subtitle,
    at: created.createdAt.toISOString(),
  });

  try {
    const receiver = await Receiver.findById(receiverId)
      .select('expoPushToken')
      .lean<{ expoPushToken?: string | null } | null>();
    const token = receiver?.expoPushToken?.trim() ?? '';
    if (!token) return;
    void sendOnlinePresencePush({
      expoPushToken: token,
      title: created.title,
      body: created.subtitle,
      data: {
        type: 'caller_online',
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('caller online presence push error:', msg);
  }
}

function enqueueForReceiver(receiverId: string, callerId: string, callerName: string): void {
  const existing = pendingByReceiverId.get(receiverId);
  if (existing) {
    existing.callerNamesById.set(callerId, callerName);
    return;
  }

  const batch: PendingReceiverBatch = {
    callerNamesById: new Map([[callerId, callerName]]),
    timer: null,
  };

  batch.timer = setTimeout(() => {
    void flushReceiverBatch(receiverId);
  }, GROUP_WINDOW_MS);

  pendingByReceiverId.set(receiverId, batch);
}

/**
 * Notify receivers from recent call history when a male caller comes online.
 * Disabled — receivers should not get "caller is online" alerts.
 */
export async function scheduleCallerOnlineNotifications(_callerId: string): Promise<void> {
  return;
}
