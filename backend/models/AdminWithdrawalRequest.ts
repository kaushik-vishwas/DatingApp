import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export type AdminWithdrawalStatus = 'pending' | 'approved' | 'rejected';

export type AdminPayoutStatus = 'none' | 'processing' | 'success' | 'failed';

export interface IAdminWithdrawalRequest {
  adminId: mongoose.Types.ObjectId;
  amount: number;
  status: AdminWithdrawalStatus;
  upiId: string;
  payeeName: string;
  contactPhone: string;
  payoutStatus: AdminPayoutStatus;
  payoutId: string | null;
  payoutUtr: string | null;
  payoutError: string | null;
  payoutReferenceId: string | null;
  /** Set when payout succeeds — idempotent marker for reserved earnings. */
  earningsDebitedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type AdminWithdrawalRequestDocument = HydratedDocument<IAdminWithdrawalRequest>;

const adminWithdrawalRequestSchema = new Schema<IAdminWithdrawalRequest>(
  {
    adminId: { type: Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
    amount: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'approved',
      index: true,
    },
    upiId: { type: String, required: true, trim: true },
    payeeName: { type: String, required: true, trim: true },
    contactPhone: { type: String, required: true, trim: true },
    payoutStatus: {
      type: String,
      enum: ['none', 'processing', 'success', 'failed'],
      default: 'processing',
      index: true,
    },
    payoutId: { type: String, default: null, trim: true },
    payoutUtr: { type: String, default: null, trim: true },
    payoutError: { type: String, default: null, trim: true, maxlength: 2000 },
    payoutReferenceId: { type: String, default: null, trim: true, maxlength: 60 },
    earningsDebitedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

adminWithdrawalRequestSchema.index({ adminId: 1, createdAt: -1 });
adminWithdrawalRequestSchema.index({ payoutStatus: 1, createdAt: -1 });

const AdminWithdrawalRequest: Model<IAdminWithdrawalRequest> = mongoose.model<IAdminWithdrawalRequest>(
  'AdminWithdrawalRequest',
  adminWithdrawalRequestSchema
);

export default AdminWithdrawalRequest;
