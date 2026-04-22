"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listReceiversForCaller = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const discoverReceiverFilter_1 = require("../services/discoverReceiverFilter");
const Receiver_1 = __importDefault(require("../models/Receiver"));
const ChatBlock_1 = __importDefault(require("../models/ChatBlock"));
const accountAccess_1 = require("../utils/accountAccess");
function iso(d) {
    return d.toISOString();
}
/** Express `req.query` values are often `string | string[] | undefined`. */
function firstQueryString(val) {
    if (val === undefined || val === null)
        return '';
    if (Array.isArray(val))
        return firstQueryString(val[0]);
    return String(val).trim();
}
function parseIntQuery(val) {
    const s = firstQueryString(val);
    if (!s)
        return NaN;
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : NaN;
}
function toCard(r) {
    const o = r.toObject();
    return {
        _id: String(r._id),
        name: o.name,
        age: o.age ?? null,
        state: o.state ?? null,
        interests: Array.isArray(o.interests) ? o.interests.map(String) : [],
        languages: Array.isArray(o.languages) ? o.languages.map(String) : [],
        profileImage: o.profileImage ?? null,
        audioCallRate: typeof o.audioCallRate === 'number' && Number.isFinite(o.audioCallRate) ? o.audioCallRate : null,
        updatedAt: iso(o.updatedAt),
        gender: o.gender === 'male' || o.gender === 'female' || o.gender === 'other' ? o.gender : null,
    };
}
/**
 * GET /discover/receivers — approved receivers for callers only.
 * Query: language, q, gender (case-insensitive), langs (comma-separated), minAge/maxAge (optional, 18–50, strict).
 */
const listReceiversForCaller = async (req, res) => {
    try {
        if (req.accountKind !== 'user') {
            res.status(403).json({ message: 'Only app users can browse receivers' });
            return;
        }
        if ((0, accountAccess_1.blockCallerUntilApproved)(req, res))
            return;
        const minAgeRaw = parseIntQuery(req.query.minAge);
        const maxAgeRaw = parseIntQuery(req.query.maxAge);
        const limitRaw = parseIntQuery(req.query.limit);
        const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50));
        const filter = (0, discoverReceiverFilter_1.buildDiscoverReceiverFilter)({
            language: firstQueryString(req.query.language),
            q: firstQueryString(req.query.q),
            gender: firstQueryString(req.query.gender),
            langsRaw: firstQueryString(req.query.langs),
            minAge: minAgeRaw,
            maxAge: maxAgeRaw,
        });
        const uid = new mongoose_1.default.Types.ObjectId(String(req.user._id));
        const blockedReceiverIds = await ChatBlock_1.default.distinct('receiverId', { userId: uid });
        const blockClause = blockedReceiverIds.length > 0
            ? { _id: { $nin: blockedReceiverIds } }
            : {};
        const receivers = await Receiver_1.default.find({ ...filter, ...blockClause })
            .select('name age state interests languages profileImage audioCallRate updatedAt gender')
            .sort({ updatedAt: -1 })
            .limit(limit)
            .exec();
        res.status(200).json({
            receivers: receivers.map((r) => toCard(r)),
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('listReceiversForCaller error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.listReceiversForCaller = listReceiversForCaller;
