import mongoose from 'mongoose';
import CallSession from '../models/CallSession';

/** Minimum connected seconds to count as a successful call (matches caller call-history UI). */
export const CALLER_MESSAGE_MIN_DURATION_SEC = 15;

export async function callerHasSuccessfulCallWithReceiver(
  callerId: mongoose.Types.ObjectId | string,
  receiverId: mongoose.Types.ObjectId | string
): Promise<boolean> {
  const uid =
    callerId instanceof mongoose.Types.ObjectId
      ? callerId
      : new mongoose.Types.ObjectId(String(callerId));
  const rid =
    receiverId instanceof mongoose.Types.ObjectId
      ? receiverId
      : new mongoose.Types.ObjectId(String(receiverId));
  if (!mongoose.Types.ObjectId.isValid(String(uid)) || !mongoose.Types.ObjectId.isValid(String(rid))) {
    return false;
  }
  const row = await CallSession.exists({
    callerId: uid,
    receiverId: rid,
    status: 'completed',
    durationSec: { $gte: CALLER_MESSAGE_MIN_DURATION_SEC },
  });
  return Boolean(row);
}
