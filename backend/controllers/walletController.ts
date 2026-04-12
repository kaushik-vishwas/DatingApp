import type { Request, Response } from 'express';
import User, { type UserDocument } from '../models/User';
import { toApiUser } from './authController';

/** Allowed (pay INR, bonus %) — must match client wallet grid. */
const ALLOWED_PACKAGES = new Set([
  '50-5',
  '50-15',
  '140-20',
  '200-25',
  '300-35',
  '500-35',
  '900-35',
  '1900-40',
  '9800-40',
  '15000-45',
]);

/**
 * POST /wallet/credit — app users only. Simulates payment: credits wallet by pay × (1 + bonus%).
 */
export const creditWallet = async (
  req: Request<{}, {}, { payAmount?: unknown; bonusPercent?: unknown }>,
  res: Response
): Promise<void> => {
  try {
    if (req.accountKind !== 'user') {
      res.status(403).json({ message: 'Only app users can add wallet credit' });
      return;
    }

    const authUser = req.user as UserDocument | undefined;
    if (!authUser?._id) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    const payAmount = Number(req.body.payAmount);
    const bonusPercent = Number(req.body.bonusPercent);
    if (!Number.isFinite(payAmount) || !Number.isFinite(bonusPercent)) {
      res.status(400).json({ message: 'payAmount and bonusPercent must be numbers' });
      return;
    }

    const key = `${Math.round(payAmount)}-${Math.round(bonusPercent)}`;
    if (!ALLOWED_PACKAGES.has(key)) {
      res.status(400).json({ message: 'Invalid wallet package' });
      return;
    }

    const credit = Math.round(payAmount * (1 + bonusPercent / 100) * 100) / 100;

    const user = await User.findById(authUser._id);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const prev = typeof user.walletBalance === 'number' && Number.isFinite(user.walletBalance) ? user.walletBalance : 0;
    user.walletBalance = Math.round((prev + credit) * 100) / 100;
    await user.save();

    res.status(200).json({
      message: 'Wallet credited',
      creditAdded: credit,
      user: toApiUser(user),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('creditWallet error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};
