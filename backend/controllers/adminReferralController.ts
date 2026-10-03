import type { Request, Response } from 'express';
import Receiver from '../models/Receiver';
import ReferralAlert from '../models/ReferralAlert';

/**
 * GET /admin/referral-alerts — duplicate-phone and burst flags, plus receiver delete requests.
 */
export const listReferralAlerts = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [alerts, deletionRequests] = await Promise.all([
      ReferralAlert.find()
        .sort({ createdAt: -1 })
        .limit(100)
        .select('type referrerKind referrerPhone referredPhoneKey referralCode message createdAt')
        .lean(),
      Receiver.find({ accountDeletionRequestedAt: { $ne: null } })
        .sort({ accountDeletionRequestedAt: -1 })
        .limit(100)
        .select('name phone accountStatus accountDeletionReason accountDeletionRequestedAt')
        .lean(),
    ]);

    res.status(200).json({
      alerts: alerts.map((row) => ({
        _id: String(row._id),
        type: row.type,
        referrerKind: row.referrerKind,
        referrerPhone: row.referrerPhone,
        referredPhone: row.referredPhoneKey,
        referralCode: row.referralCode,
        message: row.message,
        createdAt: row.createdAt,
      })),
      deletionRequests: deletionRequests.map((row) => ({
        _id: String(row._id),
        name: row.name,
        phone: row.phone,
        accountStatus: row.accountStatus,
        reason: row.accountDeletionReason ?? '',
        requestedAt: row.accountDeletionRequestedAt,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('listReferralAlerts error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};
