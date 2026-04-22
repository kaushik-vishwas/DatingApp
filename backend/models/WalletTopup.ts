import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export interface IWalletTopup {
  userId: mongoose.Types.ObjectId;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  payAmount: number;
  bonusPercent: number;
  creditAdded: number;
  createdAt: Date;
  updatedAt: Date;
}

export type WalletTopupDocument = HydratedDocument<IWalletTopup>;

const walletTopupSchema = new Schema<IWalletTopup>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    razorpayOrderId: { type: String, required: true },
    razorpayPaymentId: { type: String, required: true, unique: true },
    payAmount: { type: Number, required: true },
    bonusPercent: { type: Number, required: true },
    creditAdded: { type: Number, required: true },
  },
  { timestamps: true }
);

const WalletTopup: Model<IWalletTopup> =
  mongoose.models.WalletTopup ?? mongoose.model<IWalletTopup>('WalletTopup', walletTopupSchema);

export default WalletTopup;
