import mongoose, { Schema, type Model } from 'mongoose';
import type { ReceiverLastClient } from './Receiver';

export type CallRingOutcome = 'acked' | 'suppressed' | 'no_ack';
export type CallRingUnreachableReason = 'busy' | 'ui_disabled' | 'no_ack';

const RETENTION_SECONDS = 30 * 24 * 60 * 60;

/**
 * One row per call invite that woke a receiver's phone: did it ring, deliberately not ring, or
 * stay silent. No caller identity, phone numbers or message content. Auto-deleted after 30 days.
 */
export interface ICallRingEvent {
  callId: string;
  receiverId: mongoose.Types.ObjectId;
  outcome: CallRingOutcome;
  unreachable_reason: CallRingUnreachableReason | null;
  /** ms from invite to the phone's /ringing request (also set when an ack arrives after no_ack). */
  ackAfterMs: number | null;
  lastClient: ReceiverLastClient | null;
  /** Receiver declined after the no_ack deadline — the phone did ring; not real silence. */
  lateDeclineAt: Date | null;
  createdAt: Date;
}

const callRingEventSchema = new Schema<ICallRingEvent>(
  {
    callId: { type: String, required: true, trim: true },
    receiverId: { type: Schema.Types.ObjectId, ref: 'Receiver', required: true },
    outcome: { type: String, enum: ['acked', 'suppressed', 'no_ack'], required: true },
    unreachable_reason: { type: String, enum: ['busy', 'ui_disabled', 'no_ack', null], default: null },
    ackAfterMs: { type: Number, default: null },
    lastClient: {
      type: new Schema<ReceiverLastClient>(
        {
          mfr: { type: String, default: '' },
          model: { type: String, default: '' },
          os: { type: String, default: '' },
          sdk: { type: Number, default: null },
          appVersionCode: { type: Number, default: null },
          seenAt: { type: Date, required: true },
        },
        { _id: false }
      ),
      default: null,
    },
    lateDeclineAt: { type: Date, default: null },
    createdAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false }
);

callRingEventSchema.index({ callId: 1 }, { unique: true });
callRingEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: RETENTION_SECONDS });
callRingEventSchema.index({ outcome: 1, 'lastClient.mfr': 1, createdAt: -1 });
callRingEventSchema.index({ receiverId: 1, createdAt: -1 });

const CallRingEvent: Model<ICallRingEvent> = mongoose.model<ICallRingEvent>(
  'CallRingEvent',
  callRingEventSchema
);

export default CallRingEvent;
