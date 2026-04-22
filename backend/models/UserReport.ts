import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export const REPORT_REASONS = [
  'Spam',
  'Harassment',
  'Inappropriate content',
  'Fake profile',
  'Other',
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export type ReportStatus = 'pending' | 'resolved';

export type ReportResolution = 'ignored' | 'warned' | 'suspended';

export type ReportedAccountKind = 'user' | 'receiver';

export interface IUserReport {
  reporterKind: ReportedAccountKind;
  reporterId: mongoose.Types.ObjectId;
  reportedKind: ReportedAccountKind;
  reportedId: mongoose.Types.ObjectId;
  reason: ReportReason;
  preview: string;
  status: ReportStatus;
  resolution: ReportResolution | null;
  createdAt: Date;
  updatedAt: Date;
}

export type UserReportDocument = HydratedDocument<IUserReport>;

const userReportSchema = new Schema<IUserReport>(
  {
    reporterKind: { type: String, enum: ['user', 'receiver'], required: true },
    reporterId: { type: Schema.Types.ObjectId, required: true, index: true },
    reportedKind: { type: String, enum: ['user', 'receiver'], required: true },
    reportedId: { type: Schema.Types.ObjectId, required: true, index: true },
    reason: { type: String, enum: [...REPORT_REASONS], required: true },
    preview: { type: String, default: '', trim: true, maxlength: 500 },
    status: { type: String, enum: ['pending', 'resolved'], default: 'pending', index: true },
    resolution: {
      type: String,
      enum: ['ignored', 'warned', 'suspended', null],
      default: null,
    },
  },
  { timestamps: true }
);

userReportSchema.index({ status: 1, createdAt: -1 });

const UserReport: Model<IUserReport> = mongoose.model<IUserReport>('UserReport', userReportSchema);

export default UserReport;
