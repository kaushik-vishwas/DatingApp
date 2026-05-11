"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PAUSED_MSG = void 0;
exports.blockCallerUntilApproved = blockCallerUntilApproved;
exports.blockReceiverUntilApproved = blockReceiverUntilApproved;
exports.PAUSED_MSG = 'Your account access is paused. Contact support if you need help.';
/**
 * Block app-user API routes unless profile is complete and access is allowed.
 * Callers: `pending_profile` = still onboarding; otherwise only `suspended` gates access.
 */
function blockCallerUntilApproved(req, res) {
    if (req.accountKind !== 'user')
        return false;
    const u = req.user;
    if (!u) {
        res.status(401).json({ message: 'Not authorized' });
        return true;
    }
    if (u.accountStatus === 'pending_profile') {
        res.status(403).json({ message: 'Finish setting up your profile first.' });
        return true;
    }
    if (u.suspended || u.accountStatus !== 'approved') {
        res.status(403).json({ message: exports.PAUSED_MSG });
        return true;
    }
    return false;
}
/** Receiver access gate: no admin-approval wait; only suspended accounts are blocked. */
function blockReceiverUntilApproved(req, res) {
    if (req.accountKind !== 'receiver')
        return false;
    const r = req.receiver;
    if (!r) {
        res.status(401).json({ message: 'Not authorized' });
        return true;
    }
    if (r.suspended) {
        res.status(403).json({ message: exports.PAUSED_MSG });
        return true;
    }
    return false;
}
