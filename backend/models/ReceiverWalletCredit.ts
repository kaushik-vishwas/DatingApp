import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export type ReceiverWalletCreditSource = 'referral_reward';

export interface IReceiverWalletCredit {
  receiverId: mongoose.Types.ObjectId;
  source: ReceiverWalletCreditSource;
  amountInr: number;
  referralId: mongoose.Types.ObjectId | null;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ReceiverWalletCreditDocument = HydratedDocument<IReceiverWalletCredit>;

const receiverWalletCreditSchema = new Schema<IReceiverWalletCredit>(
  {
    receiverId: { type: Schema.Types.ObjectId, ref: 'Receiver', required: true, index: true },
    source: { type: String, enum: ['referral_reward'], required: true, index: true },
    amountInr: { type: Number, required: true, min: 0.01 },
    referralId: { type: Schema.Types.ObjectId, ref: 'Referral', default: null, index: true },
    description: { type: String, required: true, trim: true, maxlength: 300 },
  },
  { timestamps: true }
);

receiverWalletCreditSchema.index({ receiverId: 1, createdAt: -1 });
receiverWalletCreditSchema.index({ referralId: 1 }, { unique: true, sparse: true });

const ReceiverWalletCredit: Model<IReceiverWalletCredit> =
  mongoose.models.ReceiverWalletCredit ??
  mongoose.model<IReceiverWalletCredit>('ReceiverWalletCredit', receiverWalletCreditSchema);

export default ReceiverWalletCredit;
