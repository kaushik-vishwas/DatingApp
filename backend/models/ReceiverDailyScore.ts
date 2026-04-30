import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export interface IReceiverDailyScore {
  receiverId: mongoose.Types.ObjectId;
  /** UTC date key: YYYY-MM-DD */
  dateKey: string;
  callScore: number;
  onlineScore: number;
  totalScore: number;
  validCallMinutes: number;
  validCalls: number;
  shortCallsIgnored: number;
  spamCallsIgnored: number;
  dayOnlineMinutes: number;
  nightOnlineMinutes: number;
  lateNightOnlineMinutes: number;
  createdAt: Date;
  updatedAt: Date;
}

export type ReceiverDailyScoreDocument = HydratedDocument<IReceiverDailyScore>;

const receiverDailyScoreSchema = new Schema<IReceiverDailyScore>(
  {
    receiverId: { type: Schema.Types.ObjectId, ref: 'Receiver', required: true, index: true },
    dateKey: { type: String, required: true, trim: true, index: true },
    callScore: { type: Number, default: 0, min: 0 },
    onlineScore: { type: Number, default: 0, min: 0 },
    totalScore: { type: Number, default: 0, min: 0 },
    validCallMinutes: { type: Number, default: 0, min: 0 },
    validCalls: { type: Number, default: 0, min: 0 },
    shortCallsIgnored: { type: Number, default: 0, min: 0 },
    spamCallsIgnored: { type: Number, default: 0, min: 0 },
    dayOnlineMinutes: { type: Number, default: 0, min: 0 },
    nightOnlineMinutes: { type: Number, default: 0, min: 0 },
    lateNightOnlineMinutes: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

receiverDailyScoreSchema.index({ receiverId: 1, dateKey: 1 }, { unique: true });

const ReceiverDailyScore: Model<IReceiverDailyScore> = mongoose.model<IReceiverDailyScore>(
  'ReceiverDailyScore',
  receiverDailyScoreSchema
);

export default ReceiverDailyScore;
