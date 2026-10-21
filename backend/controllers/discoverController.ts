import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { buildDiscoverReceiverFilter } from '../services/discoverReceiverFilter';
import Receiver, {
  RECEIVER_AUDIO_CALL_RATE_INR_PER_MIN,
  type ReceiverDocument,
} from '../models/Receiver';
import ChatBlock from '../models/ChatBlock';
import ReceiverRating from '../models/ReceiverRating';
import ReceiverDailyScore from '../models/ReceiverDailyScore';
import { blockCallerUntilApproved } from '../utils/accountAccess';
import { getBusyReceiverIdSet } from '../services/callQueue';
import { isReceiverLoggedInAndAvailable } from '../services/receiverPresence';

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

function parseBoolQuery(val: unknown): boolean {
  const s = firstQueryString(val).toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

/** Receivers who were online in this window stay on caller discover. */
const DISCOVER_ACTIVE_WINDOW_MS = 10 * 24 * 60 * 60 * 1000;
const DISCOVER_MAX_LIMIT = 500;

function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
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
  const discoverOnline = isReceiverLoggedInAndAvailable({
    receiverId: id,
    isAvailable: switchOn,
    discoverGraceUntil: o.discoverGraceUntil ?? null,
  });
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
    isAvailable: switchOn,
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
    const limit = Math.min(DISCOVER_MAX_LIMIT, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 40));
    const skipRaw = parseIntQuery(req.query.skip);
    const skip = Math.min(5000, Math.max(0, Number.isFinite(skipRaw) ? skipRaw : 0));
    const onlineOnly = parseBoolQuery(req.query.onlineOnly);
    const minRatingRaw = parseIntQuery(req.query.minRating);
    const minRating = Number.isFinite(minRatingRaw) ? minRatingRaw : 0;

    const filter = buildDiscoverReceiverFilter({
      language: firstQueryString(req.query.language),
      q: firstQueryString(req.query.q),
      gender: firstQueryString(req.query.gender),
      langsRaw: firstQueryString(req.query.langs),
      minAge: minAgeRaw,
      maxAge: maxAgeRaw,
    });

    const activeSince = new Date(Date.now() - DISCOVER_ACTIVE_WINDOW_MS);
    const activeIds = await ReceiverDailyScore.distinct('receiverId', {
      dateKey: { $gte: utcDateKey(activeSince) },
    });
    const activityClause: Record<string, unknown> = {
      $or: [
        { isOnline: true },
        { onlineSince: { $type: 'date' } },
        { lastActiveAt: { $gte: activeSince } },
        ...(activeIds.length > 0 ? [{ _id: { $in: activeIds } }] : []),
      ],
    };

    const uid = new mongoose.Types.ObjectId(String(req.user!._id));
    const blockedReceiverIds = await ChatBlock.distinct('receiverId', { userId: uid });
    const clauses: Record<string, unknown>[] = [filter, activityClause];
    if (blockedReceiverIds.length > 0) {
      clauses.push({ _id: { $nin: blockedReceiverIds as mongoose.Types.ObjectId[] } });
    }
    if (onlineOnly) {
      clauses.push({ isAvailable: true, isOnline: true, isBusyOnCall: { $ne: true } });
    }
    if (minRating >= 1) {
      const ratedIds = await ReceiverRating.aggregate<{ _id: mongoose.Types.ObjectId }>([
        { $group: { _id: '$receiverId', avg: { $avg: '$rating' } } },
        { $match: { avg: { $gte: minRating } } },
        { $project: { _id: 1 } },
      ]);
      clauses.push({ _id: { $in: ratedIds.map((row) => row._id) } });
    }

    // Rank by live presence (DB `isOnline` can be stale), then page — keeps page order stable.
    const candidates = await Receiver.find({ $and: clauses })
      .select('_id isAvailable discoverGraceUntil lastActiveAt updatedAt')
      .lean<
        {
          _id: mongoose.Types.ObjectId;
          isAvailable?: boolean;
          discoverGraceUntil?: Date | null;
          lastActiveAt?: Date | null;
          updatedAt?: Date;
        }[]
      >();
    const busyByReceiverId = await getBusyReceiverIdSet(candidates.map((c) => String(c._id)));
    const rankOf = (c: (typeof candidates)[number]): number => {
      const id = String(c._id);
      const live = isReceiverLoggedInAndAvailable({
        receiverId: id,
        isAvailable: Boolean(c.isAvailable),
        discoverGraceUntil: c.discoverGraceUntil ?? null,
      });
      if (!live) return 2;
      return busyByReceiverId.has(id) ? 1 : 0;
    };
    const recencyOf = (c: (typeof candidates)[number]): number =>
      Math.max(c.lastActiveAt?.getTime() ?? 0, c.updatedAt?.getTime() ?? 0);
    const ranked = candidates
      .map((c) => ({ c, rank: rankOf(c), recency: recencyOf(c) }))
      .sort(
        (a, b) =>
          a.rank - b.rank || b.recency - a.recency || String(a.c._id).localeCompare(String(b.c._id))
      );
    const pageIds = ranked.slice(skip, skip + limit).map((row) => row.c._id);
    const hasMore = ranked.length > skip + limit;

    const pageDocs = await Receiver.find({ _id: { $in: pageIds } })
      .select(
        'name age state interests languages profileImage audioCallRate updatedAt gender isAvailable isOnline isBusyOnCall discoverGraceUntil expoPushToken fcmDeviceToken'
      )
      .exec();
    const docById = new Map(pageDocs.map((d) => [String(d._id), d]));
    const receivers = pageIds
      .map((id) => docById.get(String(id)))
      .filter((d): d is NonNullable<typeof d> => Boolean(d));

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
    res.status(200).json({
      receivers: receivers.map((r) =>
        toCard(r as ReceiverDocument, ratingByReceiverId, busyByReceiverId)
      ),
      hasMore,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('listReceiversForCaller error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};
