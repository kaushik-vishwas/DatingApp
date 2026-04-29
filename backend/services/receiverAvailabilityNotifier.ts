import mongoose from 'mongoose';
import CallSession from '../models/CallSession';
import Receiver from '../models/Receiver';
import ReceiverAvailabilityNotification from '../models/ReceiverAvailabilityNotification';
import User from '../models/User';

const RECENT_CALL_WINDOW_DAYS = 14;
const USER_RECEIVER_COOLDOWN_MS = 30 * 60 * 1000;
const GROUP_WINDOW_MS = 20 * 1000;

type PendingUserBatch = {
  receiverNamesById: Map<string, string>;
  timer: NodeJS.Timeout | null;
};

const pendingByUserId = new Map<string, PendingUserBatch>();

function receiverOnlineTitle(names: string[]): string {
  if (names.length === 1) return `${names[0]} is online now`;
  return `${names.length} receivers are online now`;
}

function receiverOnlineSubtitle(names: string[]): string {
  if (names.length === 1) return `Call ${names[0]} while she is available.`;
  const preview = names.slice(0, 2).join(', ');
  const more = names.length - 2;
  return more > 0
    ? `${preview} and ${more} more are available to call.`
    : `${preview} are available to call.`;
}

async function flushUserBatch(userId: string): Promise<void> {
  const pending = pendingByUserId.get(userId);
  if (!pending) return;
  pendingByUserId.delete(userId);

  const receiverIds = [...pending.receiverNamesById.keys()];
  if (receiverIds.length === 0) return;
  const names = [...pending.receiverNamesById.values()];

  await ReceiverAvailabilityNotification.create({
    userId: new mongoose.Types.ObjectId(userId),
    receiverIds: receiverIds.map((id) => new mongoose.Types.ObjectId(id)),
    title: receiverOnlineTitle(names),
    subtitle: receiverOnlineSubtitle(names),
  });
}

function enqueueForUser(userId: string, receiverId: string, receiverName: string): void {
  const existing = pendingByUserId.get(userId);
  if (existing) {
    existing.receiverNamesById.set(receiverId, receiverName);
    return;
  }

  const batch: PendingUserBatch = {
    receiverNamesById: new Map([[receiverId, receiverName]]),
    timer: null,
  };

  batch.timer = setTimeout(() => {
    void flushUserBatch(userId);
  }, GROUP_WINDOW_MS);

  pendingByUserId.set(userId, batch);
}

/**
 * Notify recent male callers only when a receiver is BOTH online and available.
 * - Limits targets to recent call history window
 * - Applies user+receiver cooldown
 * - Groups multiple receiver-online events in a short window per user
 */
export async function scheduleReceiverAvailabilityNotifications(
  receiverId: string
): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(receiverId)) return;
  const rid = new mongoose.Types.ObjectId(receiverId);

  const receiver = await Receiver.findById(rid).select(
    'name accountStatus suspended isOnline isAvailable'
  );
  if (
    !receiver ||
    receiver.accountStatus !== 'approved' ||
    receiver.suspended ||
    !receiver.isOnline ||
    !receiver.isAvailable
  ) {
    return;
  }

  const since = new Date(Date.now() - RECENT_CALL_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const callerIds = (await CallSession.distinct('callerId', {
    receiverId: rid,
    status: 'completed',
    startedAt: { $gte: since },
  })) as mongoose.Types.ObjectId[];
  if (callerIds.length === 0) return;

  const callers = await User.find({
    _id: { $in: callerIds },
    gender: 'male',
    accountStatus: 'approved',
    suspended: { $ne: true },
  })
    .select('_id')
    .lean<{ _id: mongoose.Types.ObjectId }[]>();
  if (callers.length === 0) return;

  const cooldownSince = new Date(Date.now() - USER_RECEIVER_COOLDOWN_MS);
  const receiverName = receiver.name?.trim() || 'A receiver';

  for (const caller of callers) {
    const uid = String(caller._id);
    const recentlyNotified = await ReceiverAvailabilityNotification.exists({
      userId: caller._id,
      receiverIds: rid,
      createdAt: { $gte: cooldownSince },
    });
    if (recentlyNotified) continue;
    enqueueForUser(uid, receiverId, receiverName);
  }
}
