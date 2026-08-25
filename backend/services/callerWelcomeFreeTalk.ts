import mongoose from 'mongoose';
import User from '../models/User';
import WalletCredit from '../models/WalletCredit';
import {
  CALLER_WELCOME_FREE_TALK_INR,
  CALLER_WELCOME_FREE_TALK_MINUTES,
} from '../constants/callerWelcomeFreeTalk';

function roundInr(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * One-time wallet credit for new callers (2 min × ₹/min rate).
 * Idempotent: skips if a welcome_free_talk credit already exists for this user.
 */
export async function grantCallerWelcomeFreeTalk(userId: string): Promise<{
  granted: boolean;
  amountInr: number;
  reason?: string;
}> {
  const uid = String(userId ?? '').trim();
  if (!uid || !mongoose.Types.ObjectId.isValid(uid)) {
    return { granted: false, amountInr: 0, reason: 'invalid_user' };
  }

  const amountInr = roundInr(CALLER_WELCOME_FREE_TALK_INR);
  if (amountInr <= 0) {
    return { granted: false, amountInr: 0, reason: 'zero_amount' };
  }

  const existing = await WalletCredit.exists({
    userId: new mongoose.Types.ObjectId(uid),
    source: 'welcome_free_talk',
  });
  if (existing) {
    return { granted: false, amountInr, reason: 'already_granted' };
  }

  const session = await mongoose.startSession();
  try {
    let granted = false;
    await session.withTransaction(async () => {
      const dup = await WalletCredit.exists({
        userId: new mongoose.Types.ObjectId(uid),
        source: 'welcome_free_talk',
      }).session(session);
      if (dup) return;

      await WalletCredit.create(
        [
          {
            userId: new mongoose.Types.ObjectId(uid),
            source: 'welcome_free_talk',
            amountInr,
            referralId: null,
            description: `Welcome free talk — ${CALLER_WELCOME_FREE_TALK_MINUTES} min`,
          },
        ],
        { session }
      );
      await User.updateOne({ _id: uid }, { $inc: { walletBalance: amountInr } }, { session });
      granted = true;
    });
    return { granted, amountInr, reason: granted ? undefined : 'already_granted' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[welcome-free-talk] grant error:', msg);
    return { granted: false, amountInr, reason: 'error' };
  } finally {
    session.endSession();
  }
}
