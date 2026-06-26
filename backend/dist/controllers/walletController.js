"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.creditWallet = exports.verifyRazorpayWalletPayment = exports.createRazorpayWalletOrder = exports.listWalletTopups = exports.listWalletCredits = void 0;
const crypto_1 = __importDefault(require("crypto"));
const mongoose_1 = __importDefault(require("mongoose"));
const razorpay_1 = __importDefault(require("razorpay"));
const User_1 = __importDefault(require("../models/User"));
const WalletTopup_1 = __importDefault(require("../models/WalletTopup"));
const WalletCredit_1 = __importDefault(require("../models/WalletCredit"));
const authController_1 = require("./authController");
const accountAccess_1 = require("../utils/accountAccess");
const walletRechargeFees_1 = require("../constants/walletRechargeFees");
function getRazorpay() {
    const key_id = process.env.RAZORPAY_KEY_ID?.trim();
    const key_secret = process.env.RAZORPAY_KEY_SECRET?.trim();
    if (!key_id || !key_secret)
        return null;
    return new razorpay_1.default({ key_id, key_secret });
}
function verifyPaymentSignature(orderId, paymentId, signature, secret) {
    const body = `${orderId}|${paymentId}`;
    const expected = crypto_1.default.createHmac('sha256', secret).update(body).digest('hex');
    if (signature.length !== expected.length)
        return false;
    try {
        return crypto_1.default.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(signature, 'utf8'));
    }
    catch {
        return false;
    }
}
/**
 * Validate recharge pack + payable total, then return wallet credit.
 */
function resolveWalletRecharge(payAmount, bonusPercent, walletAmountRaw) {
    const walletAmount = Number(walletAmountRaw);
    if (!Number.isFinite(walletAmount) || walletAmount <= 0)
        return null;
    if (!(0, walletRechargeFees_1.payableMatchesWalletPack)(walletAmount, payAmount))
        return null;
    return {
        walletAmount: Math.round(walletAmount),
        credit: (0, walletRechargeFees_1.walletCreditForRecharge)(walletAmount, bonusPercent),
    };
}
/**
 * GET /wallet/credits — non-Razorpay wallet credits (referral rewards, etc.) for callers.
 */
const listWalletCredits = async (req, res) => {
    try {
        if (req.accountKind !== 'user') {
            res.status(403).json({ message: 'Only app users can view wallet credits' });
            return;
        }
        const authUser = req.user;
        if (!authUser?._id) {
            res.status(401).json({ message: 'Not authorized' });
            return;
        }
        if ((0, accountAccess_1.blockCallerUntilApproved)(req, res))
            return;
        const rows = await WalletCredit_1.default.find({ userId: authUser._id })
            .sort({ createdAt: -1 })
            .limit(100)
            .select('source amountInr description referralId createdAt')
            .lean();
        res.status(200).json({
            credits: rows.map((r) => ({
                id: String(r._id),
                source: r.source,
                amountInr: r.amountInr,
                description: r.description,
                referralId: r.referralId ? String(r.referralId) : null,
                createdAt: r.createdAt.toISOString(),
            })),
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('listWalletCredits error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.listWalletCredits = listWalletCredits;
/**
 * GET /wallet/topups — list successful wallet recharges for the signed-in caller.
 */
const listWalletTopups = async (req, res) => {
    try {
        if (req.accountKind !== 'user') {
            res.status(403).json({ message: 'Only app users can view wallet transactions' });
            return;
        }
        const authUser = req.user;
        if (!authUser?._id) {
            res.status(401).json({ message: 'Not authorized' });
            return;
        }
        if ((0, accountAccess_1.blockCallerUntilApproved)(req, res))
            return;
        const rows = await WalletTopup_1.default.find({ userId: authUser._id })
            .sort({ createdAt: -1 })
            .limit(100)
            .select('razorpayOrderId razorpayPaymentId payAmount bonusPercent creditAdded createdAt')
            .lean();
        res.status(200).json({
            topups: rows.map((r) => ({
                id: String(r._id),
                razorpayOrderId: r.razorpayOrderId,
                razorpayPaymentId: r.razorpayPaymentId,
                payAmount: r.payAmount,
                bonusPercent: r.bonusPercent,
                creditAdded: r.creditAdded,
                createdAt: r.createdAt.toISOString(),
            })),
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('listWalletTopups error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.listWalletTopups = listWalletTopups;
/**
 * POST /wallet/razorpay-order — create Razorpay order (amount = payAmount in paise).
 */
const createRazorpayWalletOrder = async (req, res) => {
    try {
        if (req.accountKind !== 'user') {
            res.status(403).json({ message: 'Only app users can recharge wallet' });
            return;
        }
        const authUser = req.user;
        if (!authUser?._id) {
            res.status(401).json({ message: 'Not authorized' });
            return;
        }
        if ((0, accountAccess_1.blockCallerUntilApproved)(req, res))
            return;
        const rz = getRazorpay();
        if (!rz) {
            res.status(503).json({ message: 'Wallet payments are not configured on the server' });
            return;
        }
        const payAmount = Number(req.body.payAmount);
        const bonusPercent = Number(req.body.bonusPercent);
        if (!Number.isFinite(payAmount) || !Number.isFinite(bonusPercent)) {
            res.status(400).json({ message: 'payAmount and bonusPercent must be numbers' });
            return;
        }
        const resolved = resolveWalletRecharge(payAmount, bonusPercent, req.body.walletAmount);
        if (!resolved) {
            res.status(400).json({ message: 'Invalid wallet recharge amount' });
            return;
        }
        const { validateOfferForOrder } = await Promise.resolve().then(() => __importStar(require('./walletOffersController')));
        const isValidOffer = await validateOfferForOrder(resolved.walletAmount, bonusPercent);
        if (!isValidOffer) {
            res.status(400).json({ message: 'Invalid wallet offer' });
            return;
        }
        const amountPaise = Math.round(payAmount * 100);
        if (amountPaise < 100) {
            res.status(400).json({ message: 'Amount too small' });
            return;
        }
        const uid = String(authUser._id);
        const receipt = `w${uid.slice(-10)}${Date.now()}`.replace(/[^a-zA-Z0-9]/g, '').slice(0, 40);
        const order = await rz.orders.create({
            amount: amountPaise,
            currency: 'INR',
            receipt,
            notes: {
                userId: uid,
                payAmount: String(Math.round(payAmount)),
                bonusPercent: String(Math.round(bonusPercent)),
            },
        });
        res.status(200).json({
            orderId: order.id,
            amount: amountPaise,
            currency: order.currency ?? 'INR',
            keyId: process.env.RAZORPAY_KEY_ID,
            businessName: process.env.RAZORPAY_BUSINESS_NAME?.trim() || 'Nesthama',
            prefillContact: authUser.phone ?? '',
            prefillName: authUser.name ?? 'User',
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('createRazorpayWalletOrder error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.createRazorpayWalletOrder = createRazorpayWalletOrder;
/**
 * POST /wallet/razorpay-verify — verify signature, then credit wallet (idempotent by payment id).
 */
const verifyRazorpayWalletPayment = async (req, res) => {
    try {
        if (req.accountKind !== 'user') {
            res.status(403).json({ message: 'Only app users can recharge wallet' });
            return;
        }
        const authUser = req.user;
        if (!authUser?._id) {
            res.status(401).json({ message: 'Not authorized' });
            return;
        }
        if ((0, accountAccess_1.blockCallerUntilApproved)(req, res))
            return;
        const rz = getRazorpay();
        const secret = process.env.RAZORPAY_KEY_SECRET?.trim();
        if (!rz || !secret) {
            res.status(503).json({ message: 'Wallet payments are not configured on the server' });
            return;
        }
        const orderId = typeof req.body.razorpay_order_id === 'string' ? req.body.razorpay_order_id.trim() : '';
        const paymentId = typeof req.body.razorpay_payment_id === 'string' ? req.body.razorpay_payment_id.trim() : '';
        const signature = typeof req.body.razorpay_signature === 'string' ? req.body.razorpay_signature.trim() : '';
        const payAmount = Number(req.body.payAmount);
        const bonusPercent = Number(req.body.bonusPercent);
        if (!orderId || !paymentId || !signature) {
            res.status(400).json({ message: 'Missing Razorpay payment fields' });
            return;
        }
        if (!Number.isFinite(payAmount) || !Number.isFinite(bonusPercent)) {
            res.status(400).json({ message: 'payAmount and bonusPercent must be numbers' });
            return;
        }
        const resolved = resolveWalletRecharge(payAmount, bonusPercent, req.body.walletAmount);
        if (!resolved) {
            res.status(400).json({ message: 'Invalid wallet recharge amount' });
            return;
        }
        const { validateOfferForCredit } = await Promise.resolve().then(() => __importStar(require('./walletOffersController')));
        const isValidOffer = await validateOfferForCredit(resolved.walletAmount, bonusPercent);
        if (!isValidOffer) {
            res.status(400).json({ message: 'Invalid wallet offer' });
            return;
        }
        if (!verifyPaymentSignature(orderId, paymentId, signature, secret)) {
            res.status(400).json({ message: 'Invalid payment signature' });
            return;
        }
        const existing = await WalletTopup_1.default.findOne({ razorpayPaymentId: paymentId });
        if (existing) {
            if (String(existing.userId) !== String(authUser._id)) {
                res.status(403).json({ message: 'Payment does not belong to this account' });
                return;
            }
            const user = await User_1.default.findById(authUser._id);
            if (!user) {
                res.status(404).json({ message: 'User not found' });
                return;
            }
            res.status(200).json({
                message: 'Wallet already credited for this payment',
                creditAdded: existing.creditAdded,
                user: (0, authController_1.toApiUser)(user),
            });
            return;
        }
        const order = await rz.orders.fetch(orderId);
        if (!order || String(order.notes?.userId ?? '') !== String(authUser._id)) {
            res.status(400).json({ message: 'Order does not match your account' });
            return;
        }
        const expectedPaise = Math.round(payAmount * 100);
        if (Number(order.amount) !== expectedPaise) {
            res.status(400).json({ message: 'Order amount mismatch' });
            return;
        }
        const payment = await rz.payments.fetch(paymentId);
        if (String(payment.order_id) !== orderId) {
            res.status(400).json({ message: 'Payment does not match order' });
            return;
        }
        if (payment.status !== 'captured' && payment.status !== 'authorized') {
            res.status(400).json({ message: `Payment not complete (status: ${payment.status})` });
            return;
        }
        // Calculate credit using the helper function
        const credit = resolved.credit;
        const userRow = await User_1.default.findById(authUser._id);
        if (!userRow) {
            res.status(404).json({ message: 'User not found' });
            return;
        }
        const payRounded = Math.round(payAmount * 100) / 100;
        const bonusRounded = Math.round(bonusPercent * 100) / 100;
        const session = await mongoose_1.default.startSession();
        try {
            await session.withTransaction(async () => {
                await WalletTopup_1.default.create([
                    {
                        userId: userRow._id,
                        razorpayOrderId: orderId,
                        razorpayPaymentId: paymentId,
                        payAmount: payRounded,
                        bonusPercent: bonusRounded,
                        creditAdded: credit,
                    },
                ], { session });
                await User_1.default.updateOne({ _id: authUser._id }, { $inc: { walletBalance: credit } }, { session });
            });
        }
        catch (e) {
            const code = e?.code;
            if (code === 11000) {
                const dup = await WalletTopup_1.default.findOne({ razorpayPaymentId: paymentId });
                const u2 = await User_1.default.findById(authUser._id);
                if (dup && u2 && String(dup.userId) === String(authUser._id)) {
                    res.status(200).json({
                        message: 'Wallet already credited for this payment',
                        creditAdded: dup.creditAdded,
                        user: (0, authController_1.toApiUser)(u2),
                    });
                    return;
                }
            }
            throw e;
        }
        finally {
            await session.endSession();
        }
        const fresh = await User_1.default.findById(authUser._id);
        if (!fresh) {
            res.status(500).json({ message: 'User missing after credit' });
            return;
        }
        res.status(200).json({
            message: 'Wallet credited',
            creditAdded: credit,
            user: (0, authController_1.toApiUser)(fresh),
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('verifyRazorpayWalletPayment error:', msg);
        if (err?.error?.code === 'BAD_REQUEST_ERROR') {
            res.status(400).json({ message: msg || 'Invalid Razorpay request' });
            return;
        }
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.verifyRazorpayWalletPayment = verifyRazorpayWalletPayment;
/**
 * POST /wallet/credit — dev / emergency only when Razorpay keys are not set (do not use in production).
 */
const creditWallet = async (req, res) => {
    try {
        if (getRazorpay()) {
            res.status(403).json({ message: 'Use Razorpay checkout to add wallet balance' });
            return;
        }
        if (process.env.WALLET_ALLOW_MOCK_CREDIT?.toLowerCase() !== 'true') {
            res.status(403).json({ message: 'Mock wallet credit is disabled' });
            return;
        }
        if (req.accountKind !== 'user') {
            res.status(403).json({ message: 'Only app users can add wallet credit' });
            return;
        }
        const authUser = req.user;
        if (!authUser?._id) {
            res.status(401).json({ message: 'Not authorized' });
            return;
        }
        if ((0, accountAccess_1.blockCallerUntilApproved)(req, res))
            return;
        const payAmount = Number(req.body.payAmount);
        const bonusPercent = Number(req.body.bonusPercent);
        if (!Number.isFinite(payAmount) || !Number.isFinite(bonusPercent)) {
            res.status(400).json({ message: 'payAmount and bonusPercent must be numbers' });
            return;
        }
        const resolved = resolveWalletRecharge(payAmount, bonusPercent, req.body.walletAmount);
        if (!resolved) {
            res.status(400).json({ message: 'Invalid wallet recharge amount' });
            return;
        }
        const { validateOfferForCredit } = await Promise.resolve().then(() => __importStar(require('./walletOffersController')));
        const isValidOffer = await validateOfferForCredit(resolved.walletAmount, bonusPercent);
        if (!isValidOffer) {
            res.status(400).json({ message: 'Invalid wallet offer' });
            return;
        }
        const credit = resolved.credit;
        const user = await User_1.default.findById(authUser._id);
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }
        const prev = typeof user.walletBalance === 'number' && Number.isFinite(user.walletBalance) ? user.walletBalance : 0;
        user.walletBalance = Math.round((prev + credit) * 100) / 100;
        await user.save();
        res.status(200).json({
            message: 'Wallet credited (mock)',
            creditAdded: credit,
            user: (0, authController_1.toApiUser)(user),
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('creditWallet error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.creditWallet = creditWallet;
