import type { Request, Response } from 'express';
import type { ReceiverDocument } from '../models/Receiver';
import type { UserDocument } from '../models/User';

export const PAUSED_MSG = 'Your account access is paused. Contact support if you need help.';

/**
 * Block app-user API routes unless profile is complete and access is allowed.
 * Callers: `pending_profile` = still onboarding; otherwise only `suspended` gates access.
 */
export function blockCallerUntilApproved(req: Request, res: Response): boolean {
  if (req.accountKind !== 'user') return false;
  const u = req.user as UserDocument | undefined;
  if (!u) {
    res.status(401).json({ message: 'Not authorized' });
    return true;
  }
  if (u.accountStatus === 'pending_profile') {
    res.status(403).json({ message: 'Finish setting up your profile first.' });
    return true;
  }
  if (u.suspended || u.accountStatus !== 'approved') {
    res.status(403).json({ message: PAUSED_MSG });
    return true;
  }
  return false;
}

/** Block receiver chat until admin has approved their KYC profile. */
export function blockReceiverUntilApproved(req: Request, res: Response): boolean {
  if (req.accountKind !== 'receiver') return false;
  const r = req.receiver as ReceiverDocument | undefined;
  if (!r) {
    res.status(401).json({ message: 'Not authorized' });
    return true;
  }
  if (r.accountStatus !== 'approved') {
    res.status(403).json({ message: 'Your account is pending admin approval.' });
    return true;
  }
  if (r.suspended) {
    res.status(403).json({ message: PAUSED_MSG });
    return true;
  }
  return false;
}
