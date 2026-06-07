import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export type CallSessionStatus = 'ongoing' | 'completed';

export interface ICallSession {
  callId: string;
  callerId: mongoose.Types.ObjectId;
  receiverId: mongoose.Types.ObjectId;
  startedAt: Date;
  /** When the caller joined the voice session (Stream). */
  callerJoinedAt: Date | null;
  /** When the receiver joined the voice session (Stream). */
  receiverJoinedAt: Date | null;
  /** When both sides were connected — billing/UI talk time starts here. */
  talkStartedAt: Date | null;
  endedAt: Date | null;
  durationSec: number;
  status: CallSessionStatus;
  ratePerMinute: number;
  /** Receiver payout rate per minute snapshot based on score tier at call start. */
  receiverPayoutRatePerMinute: number;
  /** Final settled debit captured from caller wallet for this call. */
  settledAmountInr: number;
  /** Final earned amount for receiver side based on payout rate. */
  receiverEarnedInr: number;
  callerRating: number | null;
  /** When set, hidden from the caller's Recents list (billing/eligibility unchanged). */
  callerHiddenAt: Date | null;
  /** When set, hidden from the receiver's History list (billing/eligibility unchanged). */
  receiverHiddenAt: Date | null;
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
    callerJoinedAt: { type: Date, default: null },
    receiverJoinedAt: { type: Date, default: null },
    talkStartedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    durationSec: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['ongoing', 'completed'], default: 'ongoing', index: true },
    ratePerMinute: { type: Number, default: 0, min: 0 },
    receiverPayoutRatePerMinute: { type: Number, default: 0, min: 0 },
    settledAmountInr: { type: Number, default: 0, min: 0 },
    receiverEarnedInr: { type: Number, default: 0, min: 0 },
    callerRating: { type: Number, default: null, min: 1, max: 5 },
    callerHiddenAt: { type: Date, default: null },
    receiverHiddenAt: { type: Date, default: null },
  },
  { timestamps: true }
);

callSessionSchema.index({ receiverId: 1, startedAt: -1 });
callSessionSchema.index({ callerId: 1, startedAt: -1 });

const CallSession: Model<ICallSession> = mongoose.model<ICallSession>('CallSession', callSessionSchema);

export default CallSession;
