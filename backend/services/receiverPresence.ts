import Receiver from '../models/Receiver';
import { isReceiverSocketConnected } from '../socket/socketRegistry';
import { finalizeReceiverOnlineSession } from './receiverScore';
import { syncReceiverQueueState } from './callQueue';

/** Keep receivers visible as online on discover after background/minimize socket loss (all Android OEMs). */
export const RECEIVER_DISCOVER_GRACE_MS = 5 * 60 * 1000;

const discoverGraceUntilByReceiverId = new Map<string, number>();
const discoverGraceExpireTimers = new Map<string, NodeJS.Timeout>();

function normalizeReceiverId(receiverId: string): string {
  return String(receiverId).trim();
}

export function isReceiverInDiscoverGrace(receiverId: string): boolean {
  const rid = normalizeReceiverId(receiverId);
  const until = discoverGraceUntilByReceiverId.get(rid);
  return typeof until === 'number' && Date.now() < until;
}

/** Socket connected now, or within the 5-minute post-disconnect grace while Go Online is on. */
export function isReceiverDiscoverPresenceLive(receiverId: string): boolean {
  const rid = normalizeReceiverId(receiverId);
  return isReceiverSocketConnected(rid) || isReceiverInDiscoverGrace(rid);
}

export function clearReceiverDiscoverGrace(receiverId: string): void {
  const rid = normalizeReceiverId(receiverId);
  discoverGraceUntilByReceiverId.delete(rid);
  const timer = discoverGraceExpireTimers.get(rid);
  if (timer) {
    clearTimeout(timer);
    discoverGraceExpireTimers.delete(rid);
  }
}

export function armReceiverDiscoverGrace(receiverId: string): void {
  const rid = normalizeReceiverId(receiverId);
  if (!rid) return;
  const until = Date.now() + RECEIVER_DISCOVER_GRACE_MS;
  discoverGraceUntilByReceiverId.set(rid, until);

  const prev = discoverGraceExpireTimers.get(rid);
  if (prev) clearTimeout(prev);

  discoverGraceExpireTimers.set(
    rid,
    setTimeout(() => {
      discoverGraceUntilByReceiverId.delete(rid);
      discoverGraceExpireTimers.delete(rid);
      void syncReceiverPresenceInDatabase(rid);
    }, RECEIVER_DISCOVER_GRACE_MS)
  );
}

/**
 * DB `isOnline` reflects Go Online (`isAvailable`) plus live socket or 5-minute background grace.
 * Callers discover uses `isReceiverDiscoverPresenceLive` for the online badge.
 */
export async function syncReceiverPresenceInDatabase(receiverId: string): Promise<void> {
  const rid = normalizeReceiverId(receiverId);
  if (!rid) return;

  const receiver = await Receiver.findById(rid).select('isAvailable onlineSince isOnline');
  if (!receiver) return;

  const socketLive = isReceiverSocketConnected(rid);
  const graceLive = isReceiverInDiscoverGrace(rid);
  const presenceLive = socketLive || graceLive;
  const shouldBeOnline = presenceLive && Boolean(receiver.isAvailable);
  const wasOnline = Boolean(receiver.isOnline);
  const onlineSince = receiver.onlineSince;

  if (shouldBeOnline && !wasOnline) {
    receiver.isOnline = true;
    if (!(onlineSince instanceof Date)) {
      receiver.onlineSince = new Date();
    }
    await receiver.save();
    await syncReceiverQueueState(rid);
    return;
  }

  if (!shouldBeOnline && wasOnline) {
    receiver.isOnline = false;
    receiver.onlineSince = null;
    await receiver.save();
    if (onlineSince instanceof Date) {
      await finalizeReceiverOnlineSession({
        receiverId: rid,
        onlineSince,
        endedAt: new Date(),
      });
    }
    await syncReceiverQueueState(rid);
    return;
  }

  if (shouldBeOnline !== wasOnline) {
    receiver.isOnline = shouldBeOnline;
    await receiver.save();
  }
  await syncReceiverQueueState(rid);
}

/** Whether callers should treat this receiver as logged-in right now. */
export function isReceiverLoggedInForDiscover(receiverId: string): boolean {
  return isReceiverDiscoverPresenceLive(receiverId);
}

/** Callable on discover: Go Online switch on (socket optional while app is backgrounded). */
export function isReceiverDiscoverAvailable(
  receiverId: string,
  isAvailableFlag: boolean
): boolean {
  return isAvailableFlag;
}
