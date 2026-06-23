import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export type WithdrawalStatus = 'verification_pending' | 'pending' | 'approved' | 'rejected';

export type PayoutStatus = 'none' | 'processing' | 'success' | 'failed';

export type WithdrawalPayoutMethod = 'upi' | 'bank';

export interface IWithdrawalRequest {
  receiverId: mongoose.Types.ObjectId;
  /** Gross amount requested (debited from receiver wallet on payout success). */
  amount: number;
  /** Platform fee retained as admin earnings. */
  platformFee: number;
  /** Net amount sent to receiver (UPI or bank). */
  payoutAmount: number;
  /** Rail used for RazorpayX payout, frozen when the withdrawal OTP is sent. */
  payoutMethod: WithdrawalPayoutMethod | null;
  status: WithdrawalStatus;
  verificationCodeHash: string | null;
  verificationExpiresAt: Date | null;
  verifiedAt: Date | null;
  reviewedAt: Date | null;
  reviewedByAdminId: mongoose.Types.ObjectId | null;
  adminNote: string | null;
  bankName: string;
  accountHolderName: string;
  accountMasked: string;
  payoutStatus: PayoutStatus;
  payoutId: string | null;
  payoutUtr: string | null;
  payoutError: string | null;
  payoutReferenceId: string | null;
  walletRefundedAt: Date | null;
  walletDebitedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type WithdrawalRequestDocument = HydratedDocument<IWithdrawalRequest>;

const withdrawalRequestSchema = new Schema<IWithdrawalRequest>(
  {
    receiverId: { type: Schema.Types.ObjectId, ref: 'Receiver', required: true, index: true },
    amount: { type: Number, required: true, min: 1 },
    platformFee: { type: Number, default: 0, min: 0 },
    payoutAmount: { type: Number, default: 0, min: 0 },
    payoutMethod: { type: String, enum: ['upi', 'bank'], default: null },
    status: {
      type: String,
      enum: ['verification_pending', 'pending', 'approved', 'rejected'],
      default: 'verification_pending',
      index: true,
    },
    verificationCodeHash: { type: String, default: null },
    verificationExpiresAt: { type: Date, default: null },
    verifiedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    reviewedByAdminId: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
    adminNote: { type: String, default: null, trim: true, maxlength: 300 },
    bankName: { type: String, required: true, trim: true },
    accountHolderName: { type: String, required: true, trim: true },
    accountMasked: { type: String, required: true, trim: true },
    payoutStatus: {
      type: String,
      enum: ['none', 'processing', 'success', 'failed'],
      default: 'none',
      index: true,
    },
    payoutId: { type: String, default: null, trim: true },
    payoutUtr: { type: String, default: null, trim: true },
    payoutError: { type: String, default: null, trim: true, maxlength: 2000 },
    payoutReferenceId: { type: String, default: null, trim: true, maxlength: 60 },
    walletRefundedAt: { type: Date, default: null },
    walletDebitedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

withdrawalRequestSchema.index({ status: 1, createdAt: -1 });
withdrawalRequestSchema.index({ receiverId: 1, createdAt: -1 });

const WithdrawalRequest: Model<IWithdrawalRequest> = mongoose.model<IWithdrawalRequest>(
  'WithdrawalRequest',
  withdrawalRequestSchema
);

export default WithdrawalRequest;
