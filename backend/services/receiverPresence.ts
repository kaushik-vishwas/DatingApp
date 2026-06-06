import Receiver from '../models/Receiver';
import { isReceiverSocketConnected } from '../socket/socketRegistry';
import { finalizeReceiverOnlineSession } from './receiverScore';
import { syncReceiverQueueState } from './callQueue';

/**
 * DB `isOnline` reflects an active socket plus Go Online (`isAvailable`).
 * Callers discover presence uses live sockets separately; this keeps admin/queue state accurate.
 */
export async function syncReceiverPresenceInDatabase(receiverId: string): Promise<void> {
  const rid = String(receiverId).trim();
  if (!rid) return;

  const receiver = await Receiver.findById(rid).select('isAvailable onlineSince isOnline');
  if (!receiver) return;

  const socketLive = isReceiverSocketConnected(rid);
  const shouldBeOnline = socketLive && Boolean(receiver.isAvailable);
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
  return isReceiverSocketConnected(receiverId);
}

/** Callable on discover: Go Online switch on (socket optional while app is backgrounded). */
export function isReceiverDiscoverAvailable(
  receiverId: string,
  isAvailableFlag: boolean
): boolean {
  return isAvailableFlag;
}
