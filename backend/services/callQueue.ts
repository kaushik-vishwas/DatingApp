import mongoose from 'mongoose';
import CallSession from '../models/CallSession';
import Receiver from '../models/Receiver';
import { hasPendingCallInviteForReceiver } from './callInviteRegistry';
import { isReceiverSocketConnected } from '../socket/socketRegistry';

const waitingReceiverIds = new Set<string>();
const busyReceiverIds = new Set<string>();
const queueActiveReceiverIds = new Set<string>();

function normalizeId(id: string): string {
  return String(id).trim();
}

export function isReceiverBusy(receiverId: string): boolean {
  return busyReceiverIds.has(normalizeId(receiverId));
}

const busyPersistTail = new Map<string, Promise<void>>();

/**
 * Writes the in-memory busy bit. Updates for one receiver run in order, and each write
 * reads the set at send time, so an older "not busy" cannot land after a newer "busy".
 */
function persistReceiverBusyFlag(receiverId: string): void {
  const rid = normalizeId(receiverId);
  if (!rid || !mongoose.Types.ObjectId.isValid(rid)) return;
  const prev = busyPersistTail.get(rid) ?? Promise.resolve();
  const next = prev
    .catch(() => undefined)
    .then(async () => {
      const busy = busyReceiverIds.has(rid);
      await Receiver.updateOne({ _id: rid }, { $set: { isBusyOnCall: busy } }).exec();
    });
  busyPersistTail.set(rid, next);
}

function rememberReceiverBusy(receiverId: string): void {
  if (busyReceiverIds.has(receiverId)) return;
  busyReceiverIds.add(receiverId);
  waitingReceiverIds.delete(receiverId);
  persistReceiverBusyFlag(receiverId);
}

function forgetReceiverBusy(receiverId: string): void {
  const had = busyReceiverIds.delete(receiverId);
  if (had) persistReceiverBusyFlag(receiverId);
}

/**
 * Busy means a live ring on this process, or a call session that is still ongoing.
 * A saved `isBusyOnCall` with neither of those is cleared so admin does not keep showing Busy.
 */
export async function getBusyReceiverIdSet(receiverIds: string[]): Promise<Set<string>> {
  const requested: string[] = [];
  for (const raw of receiverIds) {
    const id = normalizeId(raw);
    if (id) requested.push(id);
  }

  const flagged = await Receiver.find({ isBusyOnCall: true })
    .select('_id')
    .lean<{ _id: mongoose.Types.ObjectId }[]>();
  const flaggedIds = new Set(flagged.map((row) => String(row._id)));

  const toCheck = new Set<string>([...requested, ...flaggedIds, ...busyReceiverIds]);
  const oids: mongoose.Types.ObjectId[] = [];
  for (const id of toCheck) {
    if (mongoose.Types.ObjectId.isValid(id)) oids.push(new mongoose.Types.ObjectId(id));
  }

  const ongoing =
    oids.length === 0
      ? []
      : await CallSession.find({
          receiverId: { $in: oids },
          status: 'ongoing',
        })
          .select('receiverId')
          .lean<{ receiverId: mongoose.Types.ObjectId }[]>();
  const ongoingIds = new Set(ongoing.map((row) => String(row.receiverId)));

  const live = (id: string): boolean => ongoingIds.has(id) || hasPendingCallInviteForReceiver(id);

  for (const id of toCheck) {
    if (live(id)) {
      rememberReceiverBusy(id);
      continue;
    }
    forgetReceiverBusy(id);
    if (flaggedIds.has(id)) persistReceiverBusyFlag(id);
  }

  const set = new Set<string>();
  for (const id of requested) {
    if (live(id)) set.add(id);
  }
  return set;
}

export function tryReserveReceiver(receiverId: string): boolean {
  const rid = normalizeId(receiverId);
  if (!rid || busyReceiverIds.has(rid)) return false;
  busyReceiverIds.add(rid);
  waitingReceiverIds.delete(rid);
  persistReceiverBusyFlag(rid);
  return true;
}

export function releaseReceiverReservation(receiverId: string): void {
  const rid = normalizeId(receiverId);
  busyReceiverIds.delete(rid);
  persistReceiverBusyFlag(rid);
}

/** Clears a busy reservation that is not a live ring or an ongoing call, including a leftover database flag. */
export async function releaseIfStaleReceiverBusy(receiverId: string): Promise<void> {
  const rid = normalizeId(receiverId);
  if (!rid || !mongoose.Types.ObjectId.isValid(rid)) return;
  if (hasPendingCallInviteForReceiver(rid)) return;
  const oid = new mongoose.Types.ObjectId(rid);
  const [ongoing, flagged] = await Promise.all([
    CallSession.exists({ receiverId: oid, status: 'ongoing' }),
    Receiver.exists({ _id: oid, isBusyOnCall: true }),
  ]);
  if (ongoing) {
    rememberReceiverBusy(rid);
    return;
  }
  const hadMemoryBusy = busyReceiverIds.delete(rid);
  if (hadMemoryBusy || flagged) persistReceiverBusyFlag(rid);
}

export async function releaseStaleReceiverBusyFlags(): Promise<void> {
  const snapshot = [...busyReceiverIds];
  for (const rid of snapshot) {
    await releaseIfStaleReceiverBusy(rid);
  }
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
    isReceiverSocketConnected(rid) &&
    receiver!.isAvailable;

  if (eligible && !busyReceiverIds.has(rid)) {
    waitingReceiverIds.add(rid);
    return;
  }
  waitingReceiverIds.delete(rid);
}

