"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCallerAppStoreReviews = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const CallerAppStoreReview_1 = __importDefault(require("../models/CallerAppStoreReview"));
const User_1 = __importDefault(require("../models/User"));
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/**
 * GET /admin/caller-app-reviews — list caller “Rate us” reviews (one per user).
 */
const listCallerAppStoreReviews = async (req, res) => {
    try {
        const q = String(req.query.q ?? '').trim();
        const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10) || 50));
        const filter = {};
        if (q) {
            const rx = new RegExp(escapeRegex(q), 'i');
            const matchingUsers = await User_1.default.find({
                $or: [{ name: rx }, { email: rx }, { phone: rx }],
            })
                .select('_id')
                .lean();
            const ids = matchingUsers.map((u) => u._id);
            if (ids.length) {
                filter.$or = [{ review: rx }, { userId: { $in: ids } }];
            }
            else {
                filter.review = rx;
            }
        }
        const [total, rows] = await Promise.all([
            CallerAppStoreReview_1.default.countDocuments(filter),
            CallerAppStoreReview_1.default.find(filter)
                .sort({ updatedAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
        ]);
        const userIds = [...new Set(rows.map((r) => String(r.userId)))];
        const users = userIds.length > 0
            ? await User_1.default.find({ _id: { $in: userIds.map((id) => new mongoose_1.default.Types.ObjectId(id)) } })
                .select('name email phone')
                .lean()
            : [];
        const uMap = new Map(users.map((u) => [String(u._id), u]));
        const reviews = rows.map((r) => {
            const u = uMap.get(String(r.userId));
            return {
                _id: String(r._id),
                userId: String(r.userId),
                userName: u?.name ?? 'Unknown',
                email: u?.email ?? '',
                phone: u?.phone ?? '',
                stars: r.stars,
                review: (r.review ?? '').trim() || '—',
                createdAt: r.createdAt?.toISOString() ?? '',
                updatedAt: r.updatedAt?.toISOString() ?? '',
            };
        });
        res.status(200).json({
            reviews,
            total,
            page,
            limit,
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('listCallerAppStoreReviews error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.listCallerAppStoreReviews = listCallerAppStoreReviews;
