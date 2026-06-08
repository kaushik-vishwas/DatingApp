import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { buildDiscoverReceiverFilter } from '../services/discoverReceiverFilter';
import Receiver, {
  RECEIVER_AUDIO_CALL_RATE_INR_PER_MIN,
  type ReceiverDocument,
} from '../models/Receiver';
import ChatBlock from '../models/ChatBlock';
import ReceiverRating from '../models/ReceiverRating';
import { blockCallerUntilApproved } from '../utils/accountAccess';
import { isReceiverBusy } from '../services/callQueue';
import { isReceiverDiscoverPresenceLive } from '../services/receiverPresence';

function iso(d: Date): string {
  return d.toISOString();
}

/** Express `req.query` values are often `string | string[] | undefined`. */
function firstQueryString(val: unknown): string {
  if (val === undefined || val === null) return '';
  if (Array.isArray(val)) return firstQueryString(val[0]);
  return String(val).trim();
}

function parseIntQuery(val: unknown): number {
  const s = firstQueryString(val);
  if (!s) return NaN;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : NaN;
}

export type DiscoverReceiverCard = {
  _id: string;
  name: string;
  age: number | null;
  state: string | null;
  interests: string[];
  languages: string[];
  profileImage: string | null;
  audioCallRate: number | null;
  updatedAt: string;
  gender: 'male' | 'female' | 'other' | null;
  isAvailable: boolean;
  isOnline: boolean;
  isBusyOnCall: boolean;
  ratingAvg: number;
  ratingCount: number;
};

function toCard(
  r: ReceiverDocument,
  ratingByReceiverId: Map<string, { avg: number; count: number }>,
  busyByReceiverId: Set<string>
): DiscoverReceiverCard {
  const o = r.toObject();
  const rating = ratingByReceiverId.get(String(r._id));
  const id = String(r._id);
  const switchOn = Boolean(o.isAvailable);
  const discoverAvailable = switchOn;
  /** Online when Go Online is on and socket is live, or within 5 min after minimize/background disconnect. */
  const discoverOnline = switchOn && isReceiverDiscoverPresenceLive(id);
  return {
    _id: id,
    name: o.name,
    age: o.age ?? null,
    state: o.state ?? null,
    interests: Array.isArray(o.interests) ? o.interests.map(String) : [],
    languages: Array.isArray(o.languages) ? o.languages.map(String) : [],
    profileImage: o.profileImage ?? null,
    audioCallRate: RECEIVER_AUDIO_CALL_RATE_INR_PER_MIN,
    updatedAt: iso(o.updatedAt),
    gender:
      o.gender === 'male' || o.gender === 'female' || o.gender === 'other' ? o.gender : null,
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
export const listReceiversForCaller = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.accountKind !== 'user') {
      res.status(403).json({ message: 'Only app users can browse receivers' });
      return;
    }
    if (blockCallerUntilApproved(req, res)) return;

    const minAgeRaw = parseIntQuery(req.query.minAge);
    const maxAgeRaw = parseIntQuery(req.query.maxAge);

    const limitRaw = parseIntQuery(req.query.limit);
    const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50));

    const filter = buildDiscoverReceiverFilter({
      language: firstQueryString(req.query.language),
      q: firstQueryString(req.query.q),
      gender: firstQueryString(req.query.gender),
      langsRaw: firstQueryString(req.query.langs),
      minAge: minAgeRaw,
      maxAge: maxAgeRaw,
    });

    const uid = new mongoose.Types.ObjectId(String(req.user!._id));
    const blockedReceiverIds = await ChatBlock.distinct('receiverId', { userId: uid });
    const blockClause =
      blockedReceiverIds.length > 0
        ? { _id: { $nin: blockedReceiverIds as mongoose.Types.ObjectId[] } }
        : {};

    const receivers = await Receiver.find({ ...filter, ...blockClause })
      .select('name age state interests languages profileImage audioCallRate updatedAt gender isAvailable isOnline')
      .sort({ updatedAt: -1 })
      .limit(limit)
      .exec();

    const receiverIds = receivers.map((r) => new mongoose.Types.ObjectId(String(r._id)));
    const ratingRows =
      receiverIds.length === 0
        ? []
        : await ReceiverRating.aggregate<{
            receiverId: mongoose.Types.ObjectId;
            avg: number;
            count: number;
          }>([
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
    const ratingByReceiverId = new Map(
      ratingRows.map((row) => [String(row.receiverId), { avg: row.avg, count: row.count }])
    );
    const busyByReceiverId = new Set(
      receivers.map((r) => String(r._id)).filter((id) => isReceiverBusy(id))
    );
    res.status(200).json({
      receivers: receivers.map((r) =>
        toCard(r as ReceiverDocument, ratingByReceiverId, busyByReceiverId)
      ),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('listReceiversForCaller error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};
