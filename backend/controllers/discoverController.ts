import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { buildDiscoverReceiverFilter } from '../services/discoverReceiverFilter';
import Receiver, { type ReceiverDocument } from '../models/Receiver';
import ChatBlock from '../models/ChatBlock';
import { blockCallerUntilApproved } from '../utils/accountAccess';

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
};

function toCard(r: ReceiverDocument): DiscoverReceiverCard {
  const o = r.toObject();
  return {
    _id: String(r._id),
    name: o.name,
    age: o.age ?? null,
    state: o.state ?? null,
    interests: Array.isArray(o.interests) ? o.interests.map(String) : [],
    languages: Array.isArray(o.languages) ? o.languages.map(String) : [],
    profileImage: o.profileImage ?? null,
    audioCallRate:
      typeof o.audioCallRate === 'number' && Number.isFinite(o.audioCallRate) ? o.audioCallRate : null,
    updatedAt: iso(o.updatedAt),
    gender:
      o.gender === 'male' || o.gender === 'female' || o.gender === 'other' ? o.gender : null,
    isAvailable: Boolean(o.isAvailable),
    isOnline: Boolean(o.isOnline),
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

    res.status(200).json({
      receivers: receivers.map((r) => toCard(r as ReceiverDocument)),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('listReceiversForCaller error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};
