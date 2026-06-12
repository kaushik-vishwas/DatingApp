import crypto from 'crypto';
import mongoose from 'mongoose';
import User from '../models/User';
import Receiver from '../models/Receiver';
import Referral, { type ReferralAccountKind } from '../models/Referral';
import WalletCredit from '../models/WalletCredit';
import ReceiverWalletCredit from '../models/ReceiverWalletCredit';
import {
  resolveReferralRewardInr,
  type ReferralPartyRole,
} from '../constants/referralRewards';
import { phoneLookupVariants } from '../utils/phoneNormalize';
import { getReferralLandingBaseUrl } from '../constants/referralLanding';

const REFERRAL_CODE_LENGTH = 8;
const REFERRAL_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export type ReferralLookupResult =
  | { kind: 'user'; id: mongoose.Types.ObjectId; phone: string; role: ReferralPartyRole }
  | { kind: 'receiver'; id: mongoose.Types.ObjectId; phone: string; role: ReferralPartyRole };

export type ApplyReferralRewardResult = {
  applied: boolean;
  reason?: string;
  rewardInr?: number;
  referralId?: string;
};

function roundInr(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalizeReferralCode(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function isValidReferralCodeFormat(code: string): boolean {
  return /^[A-Z0-9]{6,12}$/.test(code);
}

function randomReferralCodeCandidate(): string {
  const bytes = crypto.randomBytes(REFERRAL_CODE_LENGTH);
  let out = '';
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i += 1) {
    out += REFERRAL_CODE_ALPHABET[bytes[i]! % REFERRAL_CODE_ALPHABET.length];
  }
  return out;
}

async function referralCodeExists(code: string): Promise<boolean> {
  const [userHit, receiverHit] = await Promise.all([
    User.exists({ referralCode: code }),
    Receiver.exists({ referralCode: code }),
  ]);
  return Boolean(userHit || receiverHit);
}

export async function generateUniqueReferralCode(): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = randomReferralCodeCandidate();
    if (!(await referralCodeExists(code))) return code;
  }
  throw new Error('Failed to generate unique referral code');
}

export async function ensureReferralCodeForAccount(
  kind: ReferralAccountKind,
  accountId: string
): Promise<string> {
  if (!mongoose.Types.ObjectId.isValid(accountId)) {
    throw new Error('Invalid account id');
  }

  if (kind === 'user') {
    const doc = await User.findById(accountId).select('referralCode');
    if (!doc) throw new Error('Account not found');
    const existing = typeof doc.referralCode === 'string' ? doc.referralCode.trim().toUpperCase() : '';
    if (existing) return existing;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const code = await generateUniqueReferralCode();
      const updated = await User.findOneAndUpdate(
        { _id: accountId, $or: [{ referralCode: null }, { referralCode: '' }, { referralCode: { $exists: false } }] },
        { $set: { referralCode: code } },
        { new: true }
      ).select('referralCode');
      if (updated?.referralCode) return updated.referralCode;
      const fresh = await User.findById(accountId).select('referralCode');
      if (fresh?.referralCode) return fresh.referralCode;
    }
    throw new Error('Failed to assign referral code');
  }

  const doc = await Receiver.findById(accountId).select('referralCode');
  if (!doc) throw new Error('Account not found');
  const existing = typeof doc.referralCode === 'string' ? doc.referralCode.trim().toUpperCase() : '';
  if (existing) return existing;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = await generateUniqueReferralCode();
    const updated = await Receiver.findOneAndUpdate(
      { _id: accountId, $or: [{ referralCode: null }, { referralCode: '' }, { referralCode: { $exists: false } }] },
      { $set: { referralCode: code } },
      { new: true }
    ).select('referralCode');
    if (updated?.referralCode) return updated.referralCode;
    const fresh = await Receiver.findById(accountId).select('referralCode');
    if (fresh?.referralCode) return fresh.referralCode;
  }
  throw new Error('Failed to assign referral code');
}

export async function findReferrerByCode(codeRaw: unknown): Promise<ReferralLookupResult | null> {
  const code = normalizeReferralCode(codeRaw);
  if (!isValidReferralCodeFormat(code)) return null;

  const [user, receiver] = await Promise.all([
    User.findOne({ referralCode: code }).select('_id phone').lean<{ _id: mongoose.Types.ObjectId; phone: string }>(),
    Receiver.findOne({ referralCode: code })
      .select('_id phone')
      .lean<{ _id: mongoose.Types.ObjectId; phone: string }>(),
  ]);

  if (user) {
    return { kind: 'user', id: user._id, phone: user.phone, role: 'caller' };
  }
  if (receiver) {
    return { kind: 'receiver', id: receiver._id, phone: receiver.phone, role: 'receiver' };
  }
  return null;
}

function phonesMatch(a: string, b: string): boolean {
  const va = phoneLookupVariants(a);
  const vb = phoneLookupVariants(b);
  return va.some((x) => vb.includes(x));
}

function referredRoleFromKind(kind: ReferralAccountKind): ReferralPartyRole {
  return kind === 'user' ? 'caller' : 'receiver';
}

export async function applyReferralRewardOnSignup(params: {
  referralCode?: unknown;
  referredKind: ReferralAccountKind;
  referredId: string;
  referredPhone: string;
}): Promise<ApplyReferralRewardResult> {
  const code = normalizeReferralCode(params.referralCode);
  if (!code) {
    return { applied: false, reason: 'no_code' };
  }
  if (!isValidReferralCodeFormat(code)) {
    console.warn('[referral] invalid code format', { code: code.slice(0, 12) });
    return { applied: false, reason: 'invalid_code' };
  }
  if (!mongoose.Types.ObjectId.isValid(params.referredId)) {
    return { applied: false, reason: 'invalid_referred_id' };
  }

  const referrer = await findReferrerByCode(code);
  if (!referrer) {
    console.warn('[referral] code not found', { code });
    return { applied: false, reason: 'code_not_found' };
  }

  if (String(referrer.id) === params.referredId && referrer.kind === params.referredKind) {
    console.warn('[referral] self referral blocked', { referredId: params.referredId });
    return { applied: false, reason: 'self_referral' };
  }

  if (phonesMatch(referrer.phone, params.referredPhone)) {
    console.warn('[referral] same phone referral blocked', { referredPhone: params.referredPhone });
    return { applied: false, reason: 'same_phone' };
  }

  const referredRole = referredRoleFromKind(params.referredKind);
  const rewardInr = roundInr(resolveReferralRewardInr(referrer.role, referredRole));
  if (rewardInr <= 0) {
    return { applied: false, reason: 'zero_reward' };
  }

  const description =
    referredRole === 'caller'
      ? `Referral reward — new caller joined (${code})`
      : `Referral reward — new receiver joined (${code})`;

  const session = await mongoose.startSession();
  try {
    let referralId: string | undefined;
    await session.withTransaction(async () => {
      const referral = await Referral.create(
        [
          {
            referralCode: code,
            referrerKind: referrer.kind,
            referrerId: referrer.id,
            referredKind: params.referredKind,
            referredId: new mongoose.Types.ObjectId(params.referredId),
            referredPhone: params.referredPhone,
            rewardInr,
            status: 'rewarded',
            rejectReason: null,
            rewardedAt: new Date(),
            walletCreditKind: referrer.kind,
            walletCreditId: null,
          },
        ],
        { session }
      );
      const referralDoc = referral[0];
      if (!referralDoc) throw new Error('Referral row missing after create');
      referralId = String(referralDoc._id);

      if (referrer.kind === 'user') {
        const credit = await WalletCredit.create(
          [
            {
              userId: referrer.id,
              source: 'referral_reward',
              amountInr: rewardInr,
              referralId: referralDoc._id,
              description,
            },
          ],
          { session }
        );
        const creditDoc = credit[0];
        if (!creditDoc) throw new Error('Wallet credit row missing after create');
        await User.updateOne({ _id: referrer.id }, { $inc: { walletBalance: rewardInr } }, { session });
        referralDoc.walletCreditId = creditDoc._id;
        await referralDoc.save({ session });
      } else {
        const credit = await ReceiverWalletCredit.create(
          [
            {
              receiverId: referrer.id,
              source: 'referral_reward',
              amountInr: rewardInr,
              referralId: referralDoc._id,
              description,
            },
          ],
          { session }
        );
        const creditDoc = credit[0];
        if (!creditDoc) throw new Error('Receiver wallet credit row missing after create');
        await Receiver.updateOne({ _id: referrer.id }, { $inc: { walletBalance: rewardInr } }, { session });
        referralDoc.walletCreditId = creditDoc._id;
        await referralDoc.save({ session });
      }
    });

    console.log('[referral] reward applied', {
      referralId,
      referrerKind: referrer.kind,
      referrerId: String(referrer.id),
      referredKind: params.referredKind,
      referredId: params.referredId,
      rewardInr,
      code,
    });

    return { applied: true, rewardInr, referralId };
  } catch (err: unknown) {
    const codeNum = (err as { code?: number })?.code;
    if (codeNum === 11000) {
      console.warn('[referral] duplicate referred account — reward already granted', {
        referredKind: params.referredKind,
        referredId: params.referredId,
      });
      return { applied: false, reason: 'already_rewarded' };
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[referral] applyReferralRewardOnSignup error:', msg, {
      referredKind: params.referredKind,
      referredId: params.referredId,
      code,
    });
    return { applied: false, reason: 'internal_error' };
  } finally {
    await session.endSession();
  }
}

export async function getReferralStatsForAccount(
  kind: ReferralAccountKind,
  accountId: string
): Promise<{ totalReferred: number; totalRewardInr: number }> {
  if (!mongoose.Types.ObjectId.isValid(accountId)) {
    return { totalReferred: 0, totalRewardInr: 0 };
  }
  const [agg] = await Referral.aggregate<{ totalReferred: number; totalRewardInr: number }>([
    {
      $match: {
        referrerKind: kind,
        referrerId: new mongoose.Types.ObjectId(accountId),
        status: 'rewarded',
      },
    },
    {
      $group: {
        _id: null,
        totalReferred: { $sum: 1 },
        totalRewardInr: { $sum: '$rewardInr' },
      },
    },
  ]);
  return {
    totalReferred: agg?.totalReferred ?? 0,
    totalRewardInr: roundInr(agg?.totalRewardInr ?? 0),
  };
}

export function buildReferralShareUrl(referralCode: string): string {
  const base = getReferralLandingBaseUrl();
  return `${base}/${encodeURIComponent(referralCode)}`;
}
