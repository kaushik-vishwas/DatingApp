import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export type WalletOfferDocument = HydratedDocument<IWalletOffer>;

export interface IWalletOffer {
  amount: number; // pay amount (INR)
  bonusPercent: number; // extra percent (e.g. 35 means +35%)
  popular?: boolean;
  active: boolean;
  offerBannerDataUrl?: string | null; // admin uploads; used by caller for popup
}

const walletOfferSchema = new Schema<IWalletOffer>(
  {
    amount: { type: Number, required: true, index: true },
    bonusPercent: { type: Number, required: true, index: true },
    popular: { type: Boolean, default: false },
    active: { type: Boolean, default: true, index: true },
    offerBannerDataUrl: { type: String, default: null },
  },
  { timestamps: true }
);

// One unique amount/bonus pair at a time.
walletOfferSchema.index({ amount: 1, bonusPercent: 1 }, { unique: true });

const WalletOffer: Model<IWalletOffer> =
  mongoose.models.WalletOffer ?? mongoose.model<IWalletOffer>('WalletOffer', walletOfferSchema);

export default WalletOffer;

