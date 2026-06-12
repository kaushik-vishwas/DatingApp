"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAdminEarningsWithdrawal = exports.updateAdminEarningsPayoutDetails = exports.getAdminEarningsDashboard = void 0;
const AdminSettings_1 = __importDefault(require("../models/AdminSettings"));
const AdminWithdrawalRequest_1 = __importDefault(require("../models/AdminWithdrawalRequest"));
const adminEarningsService_1 = require("../services/adminEarningsService");
const razorpayXPayoutService_1 = require("../services/razorpayXPayoutService");
function roundInr(n) {
    return Math.round(n * 100) / 100;
}
function safeTrim(s) {
    return typeof s === 'string' ? s.trim() : '';
}
function isValidUpi(upi) {
    return /^[a-z0-9._-]{2,256}@[a-z]{3,}$/i.test(upi);
}
function isValidPhone(phone) {
    return /^[6-9]\d{9}$/.test(phone.replace(/\D/g, '').slice(-10));
}
function toInrAmount(raw) {
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n) || n < 1)
        return null;
    return roundInr(n);
}
async function getOrCreateAdminSettings() {
    const existing = await AdminSettings_1.default.findOne({});
    if (existing)
        return existing;
    return AdminSettings_1.default.create({});
}
function payoutPayload(settings) {
    return {
        upiId: safeTrim(settings.adminEarningsPayout?.upiId),
        payeeName: safeTrim(settings.adminEarningsPayout?.payeeName),
        contactPhone: safeTrim(settings.adminEarningsPayout?.contactPhone),
        configured: Boolean(isValidUpi(safeTrim(settings.adminEarningsPayout?.upiId)) &&
            safeTrim(settings.adminEarningsPayout?.payeeName) &&
            isValidPhone(safeTrim(settings.adminEarningsPayout?.contactPhone))),
    };
}
/**
 * GET /admin/earnings — platform margin summary, payout details, recent withdrawals.
 */
const getAdminEarningsDashboard = async (req, res) => {
    try {
        const [snapshot, settings, withdrawals] = await Promise.all([
            (0, adminEarningsService_1.getAdminEarningsSnapshot)(),
            getOrCreateAdminSettings(),
            AdminWithdrawalRequest_1.default.find({})
                .sort({ createdAt: -1 })
                .limit(25)
                .lean(),
        ]);
        res.status(200).json({
            earnings: {
                lifetime: snapshot.lifetime,
                today: snapshot.today,
                thisWeek: snapshot.thisWeek,
                withdrawableInr: snapshot.withdrawableInr,
                withdrawnInr: snapshot.withdrawnInr,
                reservedInr: snapshot.reservedInr,
            },
            payout: payoutPayload(settings),
            withdrawals: withdrawals.map((row) => ({
                id: String(row._id),
                amount: roundInr(row.amount),
                status: row.status,
                payoutStatus: row.payoutStatus,
                payoutUtr: row.payoutUtr,
                payoutError: row.payoutError,
                upiId: row.upiId,
                createdAt: row.createdAt.toISOString(),
            })),
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('getAdminEarningsDashboard error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.getAdminEarningsDashboard = getAdminEarningsDashboard;
/**
 * PATCH /admin/earnings/payout-details — save admin UPI payout details.
 */
const updateAdminEarningsPayoutDetails = async (req, res) => {
    try {
        const upiId = safeTrim(req.body.upiId).toLowerCase();
        const payeeName = safeTrim(req.body.payeeName);
        const contactPhone = safeTrim(req.body.contactPhone).replace(/\D/g, '').slice(-10);
        if (!isValidUpi(upiId)) {
            res.status(400).json({ message: 'Enter a valid UPI ID (example: name@bank)' });
            return;
        }
        if (!payeeName || payeeName.length < 2) {
            res.status(400).json({ message: 'Payee name is required' });
            return;
        }
        if (!isValidPhone(contactPhone)) {
            res.status(400).json({ message: 'Enter a valid 10-digit Indian mobile number for Razorpay contact' });
            return;
        }
        const settings = await AdminSettings_1.default.findOneAndUpdate({}, {
            $set: {
                adminEarningsPayout: {
                    upiId,
                    payeeName,
                    contactPhone,
                },
            },
        }, { upsert: true, new: true });
        res.status(200).json({
            message: 'Admin payout details saved',
            payout: payoutPayload(settings),
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('updateAdminEarningsPayoutDetails error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.updateAdminEarningsPayoutDetails = updateAdminEarningsPayoutDetails;
/**
 * POST /admin/earnings/withdraw — withdraw platform earnings to saved UPI.
 */
const createAdminEarningsWithdrawal = async (req, res) => {
    try {
        if (!req.admin?._id) {
            res.status(401).json({ message: 'Not authorized' });
            return;
        }
        const amount = toInrAmount(req.body.amount);
        if (amount === null) {
            res.status(400).json({ message: 'amount must be at least ₹1' });
            return;
        }
        const settings = await getOrCreateAdminSettings();
        const payout = payoutPayload(settings);
        if (!payout.configured) {
            res.status(400).json({ message: 'Save admin UPI payout details before withdrawing' });
            return;
        }
        const snapshot = await (0, adminEarningsService_1.getAdminEarningsSnapshot)();
        if (amount > snapshot.withdrawableInr) {
            res.status(400).json({ message: 'Insufficient withdrawable admin earnings' });
            return;
        }
        const withdrawal = await AdminWithdrawalRequest_1.default.create({
            adminId: req.admin._id,
            amount,
            status: 'approved',
            upiId: payout.upiId,
            payeeName: payout.payeeName,
            contactPhone: payout.contactPhone,
            payoutStatus: 'processing',
            payoutReferenceId: `awd_${Date.now().toString(36)}`,
        });
        void (0, razorpayXPayoutService_1.trackAndFinalizeAdminRazorpayXPayout)(String(withdrawal._id)).catch((e) => {
            const msg = e instanceof Error ? e.message : String(e);
            console.error('admin payout tracker error:', msg);
        });
        const refreshed = await (0, adminEarningsService_1.getAdminEarningsSnapshot)();
        res.status(200).json({
            message: 'Withdrawal started. Payment is processing via RazorpayX.',
            withdrawal: {
                id: String(withdrawal._id),
                amount: roundInr(withdrawal.amount),
                payoutStatus: withdrawal.payoutStatus,
                createdAt: withdrawal.createdAt.toISOString(),
            },
            withdrawableInr: refreshed.withdrawableInr,
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('createAdminEarningsWithdrawal error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.createAdminEarningsWithdrawal = createAdminEarningsWithdrawal;
