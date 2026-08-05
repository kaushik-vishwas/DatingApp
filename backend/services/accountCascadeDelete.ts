import mongoose from 'mongoose';
import CallSession from '../models/CallSession';
import ChatBlock from '../models/ChatBlock';
import ChatMessage from '../models/ChatMessage';
import ChatReadState from '../models/ChatReadState';
import CallerAppStoreReview from '../models/CallerAppStoreReview';
import CallerOnlineNotification from '../models/CallerOnlineNotification';
import Receiver from '../models/Receiver';
import ReceiverAvailabilityNotification from '../models/ReceiverAvailabilityNotification';
import ReceiverDailyScore from '../models/ReceiverDailyScore';
import ReceiverPriorityNotification from '../models/ReceiverPriorityNotification';
import ReceiverRating from '../models/ReceiverRating';
import ReceiverWalletCredit from '../models/ReceiverWalletCredit';
import Referral from '../models/Referral';
import User from '../models/User';
import UserReport from '../models/UserReport';
import WalletCredit from '../models/WalletCredit';
import WalletTopup from '../models/WalletTopup';
import WithdrawalRequest from '../models/WithdrawalRequest';
import { clearReceiverDiscoverGrace } from './receiverPresence';
import { releaseReceiverReservation, removeReceiverFromQueue } from './callQueue';

function asObjectId(id: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(String(id).trim());
}

/**
 * Deletes all Mongo rows tied to a receiver, then the Receiver document.
 * Does not touch unrelated callers/receivers (array refs are $pull'd).
 */
export async function cascadeDeleteReceiverAccount(receiverId: string): Promise<void> {
  const rid = asObjectId(receiverId);
  const idStr = String(rid);

  // In-memory runtime presence / queue (safe no-ops if absent).
  try {
    clearReceiverDiscoverGrace(idStr);
    releaseReceiverReservation(idStr);
    removeReceiverFromQueue(idStr);
  } catch {
    // ignore
  }

  await Promise.all([
    ChatMessage.deleteMany({ receiverId: rid }),
    ChatBlock.deleteMany({ receiverId: rid }),
    ChatReadState.deleteMany({ receiverId: rid }),
    CallSession.deleteMany({ receiverId: rid }),
    WithdrawalRequest.deleteMany({ receiverId: rid }),
    ReceiverWalletCredit.deleteMany({ receiverId: rid }),
    ReceiverDailyScore.deleteMany({ receiverId: rid }),
    ReceiverRating.deleteMany({ receiverId: rid }),
    CallerOnlineNotification.deleteMany({ receiverId: rid }),
    ReceiverPriorityNotification.deleteMany({ receiverId: rid }),
    UserReport.deleteMany({
      $or: [
        { reporterKind: 'receiver', reporterId: rid },
        { reportedKind: 'receiver', reportedId: rid },
      ],
    }),
    Referral.deleteMany({
      $or: [
        { referrerKind: 'receiver', referrerId: rid },
        { referredKind: 'receiver', referredId: rid },
      ],
    }),
    ReceiverAvailabilityNotification.updateMany(
      { receiverIds: rid },
      { $pull: { receiverIds: rid } }
    ),
  ]);

  // Drop empty availability notification shells left after $pull.
  await ReceiverAvailabilityNotification.deleteMany({ receiverIds: { $size: 0 } });

  await Receiver.deleteOne({ _id: rid });
}

/**
 * Deletes all Mongo rows tied to a caller (User), then the User document.
 * Does not touch unrelated receivers (array refs are $pull'd).
 */
export async function cascadeDeleteUserAccount(userId: string): Promise<void> {
  const uid = asObjectId(userId);

  await Promise.all([
    ChatMessage.deleteMany({ userId: uid }),
    ChatBlock.deleteMany({ userId: uid }),
    ChatReadState.deleteMany({ userId: uid }),
    CallSession.deleteMany({ callerId: uid }),
    WalletTopup.deleteMany({ userId: uid }),
    WalletCredit.deleteMany({ userId: uid }),
    CallerAppStoreReview.deleteMany({ userId: uid }),
    ReceiverRating.deleteMany({ raterId: uid }),
    ReceiverPriorityNotification.deleteMany({ userId: uid }),
    ReceiverAvailabilityNotification.deleteMany({ userId: uid }),
    UserReport.deleteMany({
      $or: [
        { reporterKind: 'user', reporterId: uid },
        { reportedKind: 'user', reportedId: uid },
      ],
    }),
    Referral.deleteMany({
      $or: [
        { referrerKind: 'user', referrerId: uid },
        { referredKind: 'user', referredId: uid },
      ],
    }),
    CallerOnlineNotification.updateMany({ callerIds: uid }, { $pull: { callerIds: uid } }),
  ]);

  await CallerOnlineNotification.deleteMany({ callerIds: { $size: 0 } });

  await User.deleteOne({ _id: uid });
}
