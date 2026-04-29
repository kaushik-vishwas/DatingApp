import mongoose from 'mongoose';
import ChatBlock from '../models/ChatBlock';
import Receiver from '../models/Receiver';
import ReceiverPriorityNotification from '../models/ReceiverPriorityNotification';

const waitingReceiverIds = new Set<string>();
const busyReceiverIds = new Set<string>();
const queueActiveReceiverIds = new Set<string>();

function normalizeId(id: string): string {
  return String(id).trim();
}

export function isReceiverBusy(receiverId: string): boolean {
  return busyReceiverIds.has(normalizeId(receiverId));
}

export function tryReserveReceiver(receiverId: string): boolean {
  const rid = normalizeId(receiverId);
  if (!rid || busyReceiverIds.has(rid)) return false;
  busyReceiverIds.add(rid);
  waitingReceiverIds.delete(rid);
  return true;
}

export function releaseReceiverReservation(receiverId: string): void {
  busyReceiverIds.delete(normalizeId(receiverId));
}

export function removeReceiverFromQueue(receiverId: string): void {
  waitingReceiverIds.delete(normalizeId(receiverId));
}

export function setReceiverQueuePresence(receiverId: string, active: boolean): void {
  const rid = normalizeId(receiverId);
  if (!rid) return;
  if (active) {
    queueActiveReceiverIds.add(rid);
    return;
  }
  queueActiveReceiverIds.delete(rid);
}

export function isReceiverInQueueScreen(receiverId: string): boolean {
  return queueActiveReceiverIds.has(normalizeId(receiverId));
}

export async function syncReceiverQueueState(receiverId: string): Promise<void> {
  const rid = normalizeId(receiverId);
  if (!mongoose.Types.ObjectId.isValid(rid)) {
    waitingReceiverIds.delete(rid);
    busyReceiverIds.delete(rid);
    return;
  }
  const receiver = await Receiver.findById(rid).select('accountStatus suspended isOnline isAvailable');
  const eligible =
    Boolean(receiver) &&
    receiver!.accountStatus === 'approved' &&
    !receiver!.suspended &&
    receiver!.isOnline &&
    receiver!.isAvailable;

  if (eligible && !busyReceiverIds.has(rid)) {
    waitingReceiverIds.add(rid);
    return;
  }
  waitingReceiverIds.delete(rid);
}

export async function pickRandomQueuedReceiverForCaller(callerId: string): Promise<{
  receiverId: string;
  name: string;
  profileImage: string | null;
} | null> {
  const cid = normalizeId(callerId);
  const queueIds = [...waitingReceiverIds].filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (queueIds.length === 0) return null;

  const blockedIds = await ChatBlock.distinct('receiverId', {
    userId: new mongoose.Types.ObjectId(cid),
    receiverId: { $in: queueIds.map((id) => new mongoose.Types.ObjectId(id)) },
  });
  const blockedSet = new Set((blockedIds as mongoose.Types.ObjectId[]).map((id) => String(id)));

  const eligible = await Receiver.find({
    _id: {
      $in: queueIds
        .filter(
          (id) =>
            queueActiveReceiverIds.has(id) &&
            !blockedSet.has(id) &&
            !busyReceiverIds.has(id)
        )
        .map((id) => new mongoose.Types.ObjectId(id)),
    },
    accountStatus: 'approved',
    suspended: { $ne: true },
    isOnline: true,
    isAvailable: true,
  })
    .select('_id name profileImage')
    .lean<{ _id: mongoose.Types.ObjectId; name: string; profileImage?: string | null }[]>();

  if (eligible.length === 0) return null;
  const eligibleById = new Map(eligible.map((r) => [String(r._id), r]));
  const priorityRows = await ReceiverPriorityNotification.find({
    userId: new mongoose.Types.ObjectId(cid),
    priorityUntil: { $gt: new Date() },
    receiverId: {
      $in: [...eligibleById.keys()].map((id) => new mongoose.Types.ObjectId(id)),
    },
  })
    .sort({ lastNotifiedAt: -1 })
    .limit(5)
    .select('receiverId')
    .lean<{ receiverId: mongoose.Types.ObjectId }[]>();
  for (const row of priorityRows) {
    const prioritized = eligibleById.get(String(row.receiverId));
    if (!prioritized) continue;
    return {
      receiverId: String(prioritized._id),
      name: prioritized.name,
      profileImage: prioritized.profileImage ?? null,
    };
  }
  const chosen = eligible[Math.floor(Math.random() * eligible.length)];
  if (!chosen) return null;
  return {
    receiverId: String(chosen._id),
    name: chosen.name,
    profileImage: chosen.profileImage ?? null,
  };
}
