import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export type WithdrawalStatus = 'verification_pending' | 'pending' | 'approved' | 'rejected';

export interface IWithdrawalRequest {
  receiverId: mongoose.Types.ObjectId;
  amount: number;
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
  createdAt: Date;
  updatedAt: Date;
}

export type WithdrawalRequestDocument = HydratedDocument<IWithdrawalRequest>;

const withdrawalRequestSchema = new Schema<IWithdrawalRequest>(
  {
    receiverId: { type: Schema.Types.ObjectId, ref: 'Receiver', required: true, index: true },
    amount: { type: Number, required: true, min: 1 },
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
