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

function persistReceiverBusyFlag(receiverId: string, busy: boolean): void {
  const rid = normalizeId(receiverId);
  if (!rid || !mongoose.Types.ObjectId.isValid(rid)) return;
  void Receiver.updateOne({ _id: rid }, { $set: { isBusyOnCall: busy } }).exec();
}

/** In-memory invite/reservation, plus an actual ongoing voice session. */
export async function getBusyReceiverIdSet(receiverIds: string[]): Promise<Set<string>> {
  const set = new Set<string>();
  const oids: mongoose.Types.ObjectId[] = [];
  for (const raw of receiverIds) {
    const id = normalizeId(raw);
    if (!id) continue;
    if (busyReceiverIds.has(id) || hasPendingCallInviteForReceiver(id)) set.add(id);
    if (mongoose.Types.ObjectId.isValid(id)) oids.push(new mongoose.Types.ObjectId(id));
  }
  if (oids.length === 0) return set;
  const [ongoing, busyRows] = await Promise.all([
    CallSession.find({
      receiverId: { $in: oids },
      status: 'ongoing',
    })
      .select('receiverId')
      .lean<{ receiverId: mongoose.Types.ObjectId }[]>(),
    Receiver.find({
      _id: { $in: oids },
      isBusyOnCall: true,
    })
      .select('_id')
      .lean<{ _id: mongoose.Types.ObjectId }[]>(),
  ]);
  for (const row of ongoing) set.add(String(row.receiverId));
  for (const row of busyRows) set.add(String(row._id));
  return set;
}

export function tryReserveReceiver(receiverId: string): boolean {
  const rid = normalizeId(receiverId);
  if (!rid || busyReceiverIds.has(rid)) return false;
  busyReceiverIds.add(rid);
  waitingReceiverIds.delete(rid);
  persistReceiverBusyFlag(rid, true);
  return true;
}

export function releaseReceiverReservation(receiverId: string): void {
  const rid = normalizeId(receiverId);
  busyReceiverIds.delete(rid);
  persistReceiverBusyFlag(rid, false);
}

/** Clears in-memory "busy" when it is not backed by an ongoing session or an active socket invite. */
export async function releaseIfStaleReceiverBusy(receiverId: string): Promise<void> {
  const rid = normalizeId(receiverId);
  if (!rid || !mongoose.Types.ObjectId.isValid(rid)) return;
  if (!busyReceiverIds.has(rid)) return;
  if (hasPendingCallInviteForReceiver(rid)) return;
  const ongoing = await CallSession.exists({
    receiverId: new mongoose.Types.ObjectId(rid),
    status: 'ongoing',
  });
  if (!ongoing) {
    busyReceiverIds.delete(rid);
    persistReceiverBusyFlag(rid, false);
  }
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

