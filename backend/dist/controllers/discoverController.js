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
exports.listReceiversForCaller = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const discoverReceiverFilter_1 = require("../services/discoverReceiverFilter");
const Receiver_1 = __importStar(require("../models/Receiver"));
const ChatBlock_1 = __importDefault(require("../models/ChatBlock"));
const ReceiverRating_1 = __importDefault(require("../models/ReceiverRating"));
const accountAccess_1 = require("../utils/accountAccess");
const callQueue_1 = require("../services/callQueue");
const socketRegistry_1 = require("../socket/socketRegistry");
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
function toCard(r, ratingByReceiverId, busyByReceiverId, connectedReceiverIds) {
    const o = r.toObject();
    const rating = ratingByReceiverId.get(String(r._id));
    const id = String(r._id);
    const socketLive = connectedReceiverIds.has(id);
    const switchOn = Boolean(o.isAvailable);
    const discoverAvailable = switchOn;
    /** Online on discover only when Go Online is on and the receiver app has an active socket. */
    const discoverOnline = switchOn && socketLive;
    return {
        _id: id,
        name: o.name,
        age: o.age ?? null,
        state: o.state ?? null,
        interests: Array.isArray(o.interests) ? o.interests.map(String) : [],
        languages: Array.isArray(o.languages) ? o.languages.map(String) : [],
        profileImage: o.profileImage ?? null,
        audioCallRate: Receiver_1.RECEIVER_AUDIO_CALL_RATE_INR_PER_MIN,
        updatedAt: iso(o.updatedAt),
        gender: o.gender === 'male' || o.gender === 'female' || o.gender === 'other' ? o.gender : null,
        isAvailable: discoverAvailable,
        isOnline: discoverOnline,
        isBusyOnCall: busyByReceiverId.has(id),
        ratingAvg: rating ? Math.round(rating.avg * 10) / 10 : 0,
        ratingCount: rating?.count ?? 0,
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
            .select('name age state interests languages profileImage audioCallRate updatedAt gender isAvailable isOnline')
            .sort({ updatedAt: -1 })
            .limit(limit)
            .exec();
        const receiverIds = receivers.map((r) => new mongoose_1.default.Types.ObjectId(String(r._id)));
        const ratingRows = receiverIds.length === 0
            ? []
            : await ReceiverRating_1.default.aggregate([
                { $match: { receiverId: { $in: receiverIds } } },
                {
                    $group: {
                        _id: '$receiverId',
                        avg: { $avg: '$rating' },
                        count: { $sum: 1 },
                    },
                },
                {
                    $project: {
                        _id: 0,
                        receiverId: '$_id',
                        avg: 1,
                        count: 1,
                    },
                },
            ]);
        const ratingByReceiverId = new Map(ratingRows.map((row) => [String(row.receiverId), { avg: row.avg, count: row.count }]));
        const busyByReceiverId = new Set(receivers.map((r) => String(r._id)).filter((id) => (0, callQueue_1.isReceiverBusy)(id)));
        const connectedReceiverIds = (0, socketRegistry_1.getConnectedReceiverIds)();
        res.status(200).json({
            receivers: receivers.map((r) => toCard(r, ratingByReceiverId, busyByReceiverId, connectedReceiverIds)),
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('listReceiversForCaller error:', msg);
        res.status(500).json({ message: msg || 'Server error' });
    }
};
exports.listReceiversForCaller = listReceiversForCaller;
