import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';
import type { ReferralAccountKind } from './Referral';

export type ReferralAlertType = 'duplicate_phone' | 'burst';

export interface IReferralAlert {
  type: ReferralAlertType;
  referrerKind: ReferralAccountKind;
  referrerId: mongoose.Types.ObjectId;
  referrerPhone: string;
  referredPhoneKey: string;
  referralCode: string;
  message: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ReferralAlertDocument = HydratedDocument<IReferralAlert>;

const referralAlertSchema = new Schema<IReferralAlert>(
  {
    type: { type: String, enum: ['duplicate_phone', 'burst'], required: true, index: true },
    referrerKind: { type: String, enum: ['user', 'receiver'], required: true },
    referrerId: { type: Schema.Types.ObjectId, required: true, index: true },
    referrerPhone: { type: String, required: true, trim: true },
    referredPhoneKey: { type: String, default: '', trim: true },
    referralCode: { type: String, default: '', trim: true, uppercase: true },
    message: { type: String, required: true, trim: true, maxlength: 400 },
  },
  { timestamps: true }
);

referralAlertSchema.index({ createdAt: -1 });
referralAlertSchema.index({ referrerId: 1, type: 1, createdAt: -1 });

const ReferralAlert: Model<IReferralAlert> =
  mongoose.models.ReferralAlert ?? mongoose.model<IReferralAlert>('ReferralAlert', referralAlertSchema);

export default ReferralAlert;
