import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export type ReferralAccountKind = 'user' | 'receiver';

export type ReferralStatus = 'rewarded' | 'rejected';

export interface IReferral {
  referralCode: string;
  referrerKind: ReferralAccountKind;
  referrerId: mongoose.Types.ObjectId;
  referredKind: ReferralAccountKind;
  referredId: mongoose.Types.ObjectId;
  referredPhone: string;
  rewardInr: number;
  status: ReferralStatus;
  rejectReason: string | null;
  rewardedAt: Date | null;
  walletCreditKind: ReferralAccountKind | null;
  walletCreditId: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ReferralDocument = HydratedDocument<IReferral>;

const referralSchema = new Schema<IReferral>(
  {
    referralCode: { type: String, required: true, trim: true, uppercase: true, index: true },
    referrerKind: { type: String, enum: ['user', 'receiver'], required: true },
    referrerId: { type: Schema.Types.ObjectId, required: true, index: true },
    referredKind: { type: String, enum: ['user', 'receiver'], required: true },
    referredId: { type: Schema.Types.ObjectId, required: true },
    referredPhone: { type: String, required: true, trim: true },
    rewardInr: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['rewarded', 'rejected'], required: true, index: true },
    rejectReason: { type: String, default: null, trim: true, maxlength: 300 },
    rewardedAt: { type: Date, default: null },
    walletCreditKind: { type: String, enum: ['user', 'receiver'], default: null },
    walletCreditId: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

referralSchema.index({ referredKind: 1, referredId: 1 }, { unique: true });
referralSchema.index({ referrerKind: 1, referrerId: 1, createdAt: -1 });

const Referral: Model<IReferral> = mongoose.model<IReferral>('Referral', referralSchema);

export default Referral;
