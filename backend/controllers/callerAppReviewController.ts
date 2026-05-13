import type { Request, Response } from 'express';
import CallerAppStoreReview, { MAX_REVIEW_LEN } from '../models/CallerAppStoreReview';

export const getMyCallerAppReview = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.accountKind !== 'user' || !req.user?._id) {
      res.status(403).json({ message: 'Only app users can view this rating' });
      return;
    }
    const doc = await CallerAppStoreReview.findOne({ userId: req.user._id })
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('getMyCallerAppReview error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};

export const upsertMyCallerAppReview = async (
  req: Request<{}, {}, { stars?: unknown; review?: unknown }>,
  res: Response
): Promise<void> => {
  try {
    if (req.accountKind !== 'user' || !req.user?._id) {
      res.status(403).json({ message: 'Only app users can submit a rating' });
      return;
    }
    const stars = Number(req.body.stars);
    const reviewRaw = typeof req.body.review === 'string' ? req.body.review.trim() : '';
    const review = reviewRaw.slice(0, MAX_REVIEW_LEN);

    if (!Number.isFinite(stars) || stars < 1 || stars > 5 || !Number.isInteger(stars)) {
      res.status(400).json({ message: 'stars must be an integer from 1 to 5' });
      return;
    }

    const rounded = Math.round(stars);
    await CallerAppStoreReview.findOneAndUpdate(
      { userId: req.user._id },
      { $set: { stars: rounded, review } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('upsertMyCallerAppReview error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};
