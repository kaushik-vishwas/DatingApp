import mongoose from 'mongoose';
import CallSession from '../models/CallSession';
import CallerOnlineNotification from '../models/CallerOnlineNotification';
import Receiver from '../models/Receiver';
import User from '../models/User';
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
 * Mirrors `scheduleReceiverAvailabilityNotifications` (14-day history, 30m cooldown, 20s batching).
 */
export async function scheduleCallerOnlineNotifications(callerId: string): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(callerId)) return;
  const uid = new mongoose.Types.ObjectId(callerId);

  const caller = await User.findById(uid).select('name gender accountStatus suspended');
  if (
    !caller ||
    caller.gender !== 'male' ||
    caller.accountStatus !== 'approved' ||
    caller.suspended
  ) {
    return;
  }

  const since = new Date(Date.now() - RECENT_CALL_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const receiverIds = (await CallSession.distinct('receiverId', {
    callerId: uid,
    status: 'completed',
    startedAt: { $gte: since },
  })) as mongoose.Types.ObjectId[];
  if (receiverIds.length === 0) return;

  const receivers = await Receiver.find({
    _id: { $in: receiverIds },
    accountStatus: 'approved',
    suspended: { $ne: true },
  })
    .select('_id')
    .lean<{ _id: mongoose.Types.ObjectId }[]>();
  if (receivers.length === 0) return;

  const callerName = caller.name?.trim() || 'Caller';
  const cooldownSince = new Date(Date.now() - RECEIVER_CALLER_COOLDOWN_MS);

  for (const receiver of receivers) {
    const rid = String(receiver._id);
    const recentlyNotified = await CallerOnlineNotification.exists({
      receiverId: receiver._id,
      callerIds: uid,
      createdAt: { $gte: cooldownSince },
    });
    if (recentlyNotified) continue;
    enqueueForReceiver(rid, callerId, callerName);
  }
}
