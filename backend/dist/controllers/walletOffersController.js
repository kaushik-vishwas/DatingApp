"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listWalletOffers = listWalletOffers;
exports.listAdminWalletOffers = listAdminWalletOffers;
exports.createAdminWalletOffer = createAdminWalletOffer;
exports.updateAdminWalletOffer = updateAdminWalletOffer;
exports.deleteAdminWalletOffer = deleteAdminWalletOffer;
exports.validateOfferForOrder = validateOfferForOrder;
exports.validateOfferForCredit = validateOfferForCredit;
const WalletOffer_1 = __importDefault(require("../models/WalletOffer"));
const accountAccess_1 = require("../utils/accountAccess");
const GST_PERCENTAGE = 28;
function toWalletOfferRow(o) {
    return {
        id: String(o._id),
        amount: Number(o.amount),
        bonusPercent: Number(o.bonusPercent),
        popular: Boolean(o.popular),
        active: Boolean(o.active),
        offerBannerDataUrl: o.offerBannerDataUrl ?? null,
    };
}
function normalizeIntAmount(n) {
    const x = typeof n === 'number' ? n : Number(n);
    return Math.round(x);
}
function normalizeIntPercent(n) {
    const x = typeof n === 'number' ? n : Number(n);
    return Math.round(x);
}
async function listWalletOffers(req, res) {
    try {
        if (req.accountKind !== 'user') {
            res.status(403).json({ message: 'Only app users can view wallet offers' });
            return;
        }
        if ((0, accountAccess_1.blockCallerUntilApproved)(req, res))
            return;
        const activeOffers = await WalletOffer_1.default.find({ active: true })
            .sort({ popular: -1, amount: 1 })
            .lean();
        // Return empty array if no offers - no fallback to static offers
        if (activeOffers.length === 0) {
            res.status(200).json({ offers: [], banner: null });
            return;
        }
        const offers = activeOffers.map(toWalletOfferRow);
        // Pick a single banner for the popup: prefer popular, then first that has banner.
        const bannerCandidates = offers.filter((o) => Boolean(o.offerBannerDataUrl));
        const popularCandidate = bannerCandidates.find((o) => o.popular) ?? bannerCandidates[0] ?? null;
        const banner = popularCandidate && popularCandidate.offerBannerDataUrl
            ? {
                offerId: popularCandidate.id,
                imageDataUrl: popularCandidate.offerBannerDataUrl,
            }
            : null;
        res.status(200).json({ offers, banner });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ message: msg || 'Server error' });
    }
}
async function listAdminWalletOffers(_req, res) {
    try {
        const offers = await WalletOffer_1.default.find({})
            .sort({ active: -1, popular: -1, amount: 1 })
            .lean()
            .then((rows) => rows.map(toWalletOfferRow));
        res.status(200).json({ offers });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ message: msg || 'Server error' });
    }
}
async function createAdminWalletOffer(req, res) {
    try {
        const amount = normalizeIntAmount(req.body?.amount);
        const bonusPercent = normalizeIntPercent(req.body?.bonusPercent);
        const popular = Boolean(req.body?.popular ?? false);
        const active = Boolean(req.body?.active ?? true);
        const offerBannerDataUrlRaw = req.body?.offerBannerDataUrl;
        const offerBannerDataUrl = typeof offerBannerDataUrlRaw === 'string' ? offerBannerDataUrlRaw : null;
        if (!Number.isFinite(amount) || !Number.isFinite(bonusPercent)) {
            res.status(400).json({ message: 'amount and bonusPercent must be numbers' });
            return;
        }
        await WalletOffer_1.default.create({
            amount,
            bonusPercent,
            popular,
            active,
            offerBannerDataUrl,
        });
        const offers = await WalletOffer_1.default.find({}).lean().then((rows) => rows.map(toWalletOfferRow));
        res.status(200).json({ offers });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Unique violation
        if (String(msg).includes('E11000')) {
            res.status(409).json({ message: 'Offer with same amount & bonus already exists' });
            return;
        }
        res.status(500).json({ message: msg || 'Server error' });
    }
}
async function updateAdminWalletOffer(req, res) {
    try {
        const id = req.params.id;
        const patch = {};
        if (typeof req.body.amount !== 'undefined')
            patch.amount = normalizeIntAmount(req.body.amount);
        if (typeof req.body.bonusPercent !== 'undefined')
            patch.bonusPercent = normalizeIntPercent(req.body.bonusPercent);
        if (typeof req.body.popular !== 'undefined')
            patch.popular = Boolean(req.body.popular);
        if (typeof req.body.active !== 'undefined')
            patch.active = Boolean(req.body.active);
        if (typeof req.body.offerBannerDataUrl !== 'undefined') {
            patch.offerBannerDataUrl =
                typeof req.body.offerBannerDataUrl === 'string' ? req.body.offerBannerDataUrl : null;
        }
        await WalletOffer_1.default.findByIdAndUpdate(id, patch, { new: false });
        const offers = await WalletOffer_1.default.find({}).lean().then((rows) => rows.map(toWalletOfferRow));
        res.status(200).json({ offers });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ message: msg || 'Server error' });
    }
}
async function deleteAdminWalletOffer(req, res) {
    try {
        const id = req.params.id;
        await WalletOffer_1.default.findByIdAndDelete(id);
        const offers = await WalletOffer_1.default.find({}).lean().then((rows) => rows.map(toWalletOfferRow));
        res.status(200).json({ offers });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ message: msg || 'Server error' });
    }
}
/**
 * Validate offer for order creation (checks active offers only)
 */
async function validateOfferForOrder(amountRaw, bonusRaw) {
    const amount = normalizeIntAmount(amountRaw);
    const bonusPercent = normalizeIntPercent(bonusRaw);
    // Check if this exact offer exists and is active
    const activeOffer = await WalletOffer_1.default.findOne({
        amount,
        bonusPercent,
        active: true
    }).lean();
    return !!activeOffer;
}
/**
 * Validate offer for credit (checks both active and inactive offers for existing records)
 */
async function validateOfferForCredit(amountRaw, bonusRaw) {
    const amount = normalizeIntAmount(amountRaw);
    const bonusPercent = normalizeIntPercent(bonusRaw);
    // Check if this exact offer exists in database (active or inactive)
    const offer = await WalletOffer_1.default.findOne({
        amount,
        bonusPercent
    }).lean();
    return !!offer;
}
