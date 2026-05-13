import type { Request, Response } from 'express';
import WalletOffer from '../models/WalletOffer';
import { blockCallerUntilApproved } from '../utils/accountAccess';

const GST_PERCENTAGE = 28;

type WalletOfferRow = {
  id: string;
  amount: number;
  bonusPercent: number;
  popular: boolean;
  active: boolean;
  offerBannerDataUrl?: string | null;
};

function toWalletOfferRow(o: any): WalletOfferRow {
  return {
    id: String(o._id),
    amount: Number(o.amount),
    bonusPercent: Number(o.bonusPercent),
    popular: Boolean(o.popular),
    active: Boolean(o.active),
    offerBannerDataUrl: o.offerBannerDataUrl ?? null,
  };
}

function normalizeIntAmount(n: unknown): number {
  const x = typeof n === 'number' ? n : Number(n);
  return Math.round(x);
}

function normalizeIntPercent(n: unknown): number {
  const x = typeof n === 'number' ? n : Number(n);
  return Math.round(x);
}

export async function listWalletOffers(req: Request, res: Response): Promise<void> {
  try {
    if (req.accountKind !== 'user') {
      res.status(403).json({ message: 'Only app users can view wallet offers' });
      return;
    }

    if (blockCallerUntilApproved(req, res)) return;

    const activeOffers = await WalletOffer.find({ active: true })
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
    const popularCandidate =
      bannerCandidates.find((o) => o.popular) ?? bannerCandidates[0] ?? null;

    const banner =
      popularCandidate && popularCandidate.offerBannerDataUrl
        ? {
            offerId: popularCandidate.id,
            imageDataUrl: popularCandidate.offerBannerDataUrl,
          }
        : null;

    res.status(200).json({ offers, banner });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ message: msg || 'Server error' });
  }
}

export async function listAdminWalletOffers(_req: Request, res: Response): Promise<void> {
  try {
    const offers = await WalletOffer.find({})
      .sort({ active: -1, popular: -1, amount: 1 })
      .lean()
      .then((rows) => rows.map(toWalletOfferRow));
    res.status(200).json({ offers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ message: msg || 'Server error' });
  }
}

export async function createAdminWalletOffer(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const amount = normalizeIntAmount((req.body as any)?.amount);
    const bonusPercent = normalizeIntPercent((req.body as any)?.bonusPercent);
    const popular = Boolean((req.body as any)?.popular ?? false);
    const active = Boolean((req.body as any)?.active ?? true);
    const offerBannerDataUrlRaw = (req.body as any)?.offerBannerDataUrl;
    const offerBannerDataUrl = typeof offerBannerDataUrlRaw === 'string' ? offerBannerDataUrlRaw : null;

    if (!Number.isFinite(amount) || !Number.isFinite(bonusPercent)) {
      res.status(400).json({ message: 'amount and bonusPercent must be numbers' });
      return;
    }

    await WalletOffer.create({
      amount,
      bonusPercent,
      popular,
      active,
      offerBannerDataUrl,
    });

    const offers = await WalletOffer.find({}).lean().then((rows) => rows.map(toWalletOfferRow));
    res.status(200).json({ offers });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Unique violation
    if (String(msg).includes('E11000')) {
      res.status(409).json({ message: 'Offer with same amount & bonus already exists' });
      return;
    }
    res.status(500).json({ message: msg || 'Server error' });
  }
}

export async function updateAdminWalletOffer(
  req: Request<{ id: string }, {}, any>,
  res: Response
): Promise<void> {
  try { 
    const id = req.params.id;
    const patch: Partial<any> = {};

    if (typeof req.body.amount !== 'undefined') patch.amount = normalizeIntAmount(req.body.amount);
    if (typeof req.body.bonusPercent !== 'undefined') patch.bonusPercent = normalizeIntPercent(req.body.bonusPercent);
    if (typeof req.body.popular !== 'undefined') patch.popular = Boolean(req.body.popular);
    if (typeof req.body.active !== 'undefined') patch.active = Boolean(req.body.active);
    if (typeof req.body.offerBannerDataUrl !== 'undefined') {
      patch.offerBannerDataUrl =
        typeof req.body.offerBannerDataUrl === 'string' ? req.body.offerBannerDataUrl : null;
    }

    await WalletOffer.findByIdAndUpdate(id, patch, { new: false });

    const offers = await WalletOffer.find({}).lean().then((rows) => rows.map(toWalletOfferRow));
    res.status(200).json({ offers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ message: msg || 'Server error' });
  }
}

export async function deleteAdminWalletOffer(
  req: Request<{ id: string }>,
  res: Response
): Promise<void> {
  try {
    const id = req.params.id;
    await WalletOffer.findByIdAndDelete(id);
    const offers = await WalletOffer.find({}).lean().then((rows) => rows.map(toWalletOfferRow));
    res.status(200).json({ offers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ message: msg || 'Server error' });
  }
}

/**
 * Validate offer for order creation (checks active offers only)
 */
export async function validateOfferForOrder(amountRaw: number, bonusRaw: number): Promise<boolean> {
  const amount = normalizeIntAmount(amountRaw);
  const bonusPercent = normalizeIntPercent(bonusRaw);
  
  // Check if this exact offer exists and is active
  const activeOffer = await WalletOffer.findOne({ 
    amount, 
    bonusPercent, 
    active: true 
  }).lean();
  
  return !!activeOffer;
}

/**
 * Validate offer for credit (checks both active and inactive offers for existing records)
 */
export async function validateOfferForCredit(amountRaw: number, bonusRaw: number): Promise<boolean> {
  const amount = normalizeIntAmount(amountRaw);
  const bonusPercent = normalizeIntPercent(bonusRaw);
  
  // Check if this exact offer exists in database (active or inactive)
  const offer = await WalletOffer.findOne({ 
    amount, 
    bonusPercent 
  }).lean();
  
  return !!offer;
}