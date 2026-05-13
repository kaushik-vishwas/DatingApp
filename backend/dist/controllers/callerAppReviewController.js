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
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertMyCallerAppReview = exports.getMyCallerAppReview = void 0;
const CallerAppStoreReview_1 = __importStar(require("../models/CallerAppStoreReview"));
const getMyCallerAppReview = async (req, res) => {
    try {
        if (req.accountKind !== 'user' || !req.user?._id) {
            res.status(403).json({ message: 'Only app users can view this rating' });
            return;
        }
        const doc = await CallerAppStoreReview_1.default.findOne({ userId: req.user._id })
            .select('stars review createdAt updatedAt')
            .lean();
        if (!doc) {
            res.status(200).json({ exists: false, stars: null, review: null, createdAt: null, updatedAt: null });
            return;
        }
        res.status(200).json({
            exists: true,
            stars: doc.stars,
            review: doc.review ?? '',
            createdAt: doc.createdAt?.toISOString() ?? null,
            updatedAt: doc.updatedAt?.toISOString() ?? null,
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('getMyCallerAppReview error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.getMyCallerAppReview = getMyCallerAppReview;
const upsertMyCallerAppReview = async (req, res) => {
    try {
        if (req.accountKind !== 'user' || !req.user?._id) {
            res.status(403).json({ message: 'Only app users can submit a rating' });
            return;
        }
        const stars = Number(req.body.stars);
        const reviewRaw = typeof req.body.review === 'string' ? req.body.review.trim() : '';
        const review = reviewRaw.slice(0, CallerAppStoreReview_1.MAX_REVIEW_LEN);
        if (!Number.isFinite(stars) || stars < 1 || stars > 5 || !Number.isInteger(stars)) {
            res.status(400).json({ message: 'stars must be an integer from 1 to 5' });
            return;
        }
        const rounded = Math.round(stars);
        await CallerAppStoreReview_1.default.findOneAndUpdate({ userId: req.user._id }, { $set: { stars: rounded, review } }, { upsert: true, new: true, setDefaultsOnInsert: true });
        res.status(200).json({ ok: true });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('upsertMyCallerAppReview error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.upsertMyCallerAppReview = upsertMyCallerAppReview;
