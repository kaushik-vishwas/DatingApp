import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export type CallSessionStatus = 'ongoing' | 'completed';

export interface ICallSession {
  callId: string;
  callerId: mongoose.Types.ObjectId;
  receiverId: mongoose.Types.ObjectId;
  startedAt: Date;
  endedAt: Date | null;
  durationSec: number;
  status: CallSessionStatus;
  ratePerMinute: number;
  /** Final settled debit captured from caller wallet for this call. */
  settledAmountInr: number;
  callerRating: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CallSessionDocument = HydratedDocument<ICallSession>;

const callSessionSchema = new Schema<ICallSession>(
  {
    callId: { type: String, required: true, unique: true, trim: true, index: true },
    callerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    receiverId: { type: Schema.Types.ObjectId, ref: 'Receiver', required: true, index: true },
    startedAt: { type: Date, required: true, default: Date.now },
    endedAt: { type: Date, default: null },
    durationSec: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['ongoing', 'completed'], default: 'ongoing', index: true },
    ratePerMinute: { type: Number, default: 0, min: 0 },
    settledAmountInr: { type: Number, default: 0, min: 0 },
    callerRating: { type: Number, default: null, min: 1, max: 5 },
  },
  { timestamps: true }
);

callSessionSchema.index({ receiverId: 1, startedAt: -1 });
callSessionSchema.index({ callerId: 1, startedAt: -1 });

const CallSession: Model<ICallSession> = mongoose.model<ICallSession>('CallSession', callSessionSchema);

export default CallSession;
