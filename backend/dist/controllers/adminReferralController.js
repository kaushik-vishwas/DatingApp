"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listReferralAlerts = void 0;
const Receiver_1 = __importDefault(require("../models/Receiver"));
const ReferralAlert_1 = __importDefault(require("../models/ReferralAlert"));
/**
 * GET /admin/referral-alerts — duplicate-phone and burst flags, plus receiver delete requests.
 */
const listReferralAlerts = async (_req, res) => {
    try {
        const [alerts, deletionRequests] = await Promise.all([
            ReferralAlert_1.default.find()
                .sort({ createdAt: -1 })
                .limit(100)
                .select('type referrerKind referrerPhone referredPhoneKey referralCode message createdAt')
                .lean(),
            Receiver_1.default.find({ accountDeletionRequestedAt: { $ne: null } })
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
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('listReferralAlerts error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.listReferralAlerts = listReferralAlerts;
