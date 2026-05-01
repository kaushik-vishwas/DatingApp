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

/**
 * Pick a random receiver who can take a call right now: approved, online, available,
 * not busy, not blocked by this caller. Does not require "queue" or Go Online screen.
 */
export async function pickRandomQueuedReceiverForCaller(callerId: string): Promise<{
  receiverId: string;
  name: string;
  profileImage: string | null;
  audioCallRate: number | null;
} | null> {
  const cid = normalizeId(callerId);
  if (!mongoose.Types.ObjectId.isValid(cid)) return null;

  const baseFilter = {
    accountStatus: 'approved' as const,
    suspended: { $ne: true },
    isOnline: true,
    isAvailable: true,
  };

  const candidates = await Receiver.find(baseFilter)
    .select('_id name profileImage audioCallRate')
    .lean<{
      _id: mongoose.Types.ObjectId;
      name: string;
      profileImage?: string | null;
      audioCallRate?: number | null;
    }[]>();

  const eligibleRows = candidates.filter((r) => {
    const id = String(r._id);
    return !busyReceiverIds.has(id);
  });
  if (eligibleRows.length === 0) return null;

  const eligibleIds = eligibleRows.map((r) => r._id);
  const blockedIds = await ChatBlock.distinct('receiverId', {
    userId: new mongoose.Types.ObjectId(cid),
    receiverId: { $in: eligibleIds },
  });
  const blockedSet = new Set((blockedIds as mongoose.Types.ObjectId[]).map((id) => String(id)));

  const eligible = eligibleRows.filter((r) => !blockedSet.has(String(r._id)));
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
      audioCallRate:
        typeof prioritized.audioCallRate === 'number' && Number.isFinite(prioritized.audioCallRate)
          ? prioritized.audioCallRate
          : null,
    };
  }
  const chosen = eligible[Math.floor(Math.random() * eligible.length)];
  if (!chosen) return null;
  return {
    receiverId: String(chosen._id),
    name: chosen.name,
    profileImage: chosen.profileImage ?? null,
    audioCallRate:
      typeof chosen.audioCallRate === 'number' && Number.isFinite(chosen.audioCallRate)
        ? chosen.audioCallRate
        : null,
  };
}
