import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import CallerAppStoreReview from '../models/CallerAppStoreReview';
import User from '../models/User';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * GET /admin/caller-app-reviews — list caller “Rate us” reviews (one per user).
 */
export const listCallerAppStoreReviews = async (req: Request, res: Response): Promise<void> => {
  try {
    const q = String(req.query.q ?? '').trim();
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10) || 50));

    const filter: Record<string, unknown> = {};
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      const matchingUsers = await User.find({
        $or: [{ name: rx }, { email: rx }, { phone: rx }],
      })
        .select('_id')
        .lean();
      const ids = matchingUsers.map((u) => u._id);
      if (ids.length) {
        filter.$or = [{ review: rx }, { userId: { $in: ids } }];
      } else {
        filter.review = rx;
      }
    }

    const [total, rows] = await Promise.all([
      CallerAppStoreReview.countDocuments(filter),
      CallerAppStoreReview.find(filter)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    const userIds = [...new Set(rows.map((r) => String(r.userId)))];
    const users =
      userIds.length > 0
        ? await User.find({ _id: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) } })
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('listCallerAppStoreReviews error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};
