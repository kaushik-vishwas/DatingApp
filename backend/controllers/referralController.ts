import type { Request, Response } from 'express';
import type { UserDocument } from '../models/User';
import type { ReceiverDocument } from '../models/Receiver';
import {
  buildReferralShareUrl,
  ensureReferralCodeForAccount,
  findReferrerByCode,
  getReferralStatsForAccount,
  isValidReferralCodeFormat,
} from '../services/referralService';
import { REFERRAL_REWARD_MATRIX_INR } from '../constants/referralRewards';

/**
 * GET /profile/referral — caller/receiver referral code, share URL, and reward stats.
 */
export const getMyReferralProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const kind = req.accountKind;
    if (kind !== 'user' && kind !== 'receiver') {
      res.status(403).json({ message: 'Not authorized' });
      return;
    }

    const accountId =
      kind === 'user'
        ? String((req.user as UserDocument | undefined)?._id ?? '')
        : String((req.receiver as ReceiverDocument | undefined)?._id ?? '');

    if (!accountId) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    const referralCode = await ensureReferralCodeForAccount(kind, accountId);
    const stats = await getReferralStatsForAccount(kind, accountId);
    const role = kind === 'user' ? 'caller' : 'receiver';

    res.status(200).json({
      referralCode,
      shareUrl: buildReferralShareUrl(referralCode),
      role,
      rewardMatrixInr: REFERRAL_REWARD_MATRIX_INR[role],
      stats,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('getMyReferralProfile error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

/**
 * GET /profile/referral/validate/:code — public-ish validation for signup (no auth required).
 */
export const validateReferralCode = async (req: Request<{ code: string }>, res: Response): Promise<void> => {
  try {
    const code = String(req.params.code ?? '').trim().toUpperCase();
    if (!isValidReferralCodeFormat(code)) {
      res.status(400).json({ valid: false, message: 'Invalid referral code format' });
      return;
    }
    const referrer = await findReferrerByCode(code);
    if (!referrer) {
      res.status(404).json({ valid: false, message: 'Referral code not found' });
      return;
    }
    res.status(200).json({ valid: true, referrerRole: referrer.role });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('validateReferralCode error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};
