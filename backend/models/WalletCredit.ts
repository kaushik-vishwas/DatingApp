import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export type WalletCreditSource = 'referral_reward';

export interface IWalletCredit {
  userId: mongoose.Types.ObjectId;
  source: WalletCreditSource;
  amountInr: number;
  referralId: mongoose.Types.ObjectId | null;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

export type WalletCreditDocument = HydratedDocument<IWalletCredit>;

const walletCreditSchema = new Schema<IWalletCredit>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    source: { type: String, enum: ['referral_reward'], required: true, index: true },
    amountInr: { type: Number, required: true, min: 0.01 },
    referralId: { type: Schema.Types.ObjectId, ref: 'Referral', default: null, index: true },
    description: { type: String, required: true, trim: true, maxlength: 300 },
  },
  { timestamps: true }
);

walletCreditSchema.index({ userId: 1, createdAt: -1 });
walletCreditSchema.index({ referralId: 1 }, { unique: true, sparse: true });

const WalletCredit: Model<IWalletCredit> =
  mongoose.models.WalletCredit ?? mongoose.model<IWalletCredit>('WalletCredit', walletCreditSchema);

export default WalletCredit;
