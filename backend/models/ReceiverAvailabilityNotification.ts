import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export interface IReceiverAvailabilityNotification {
  userId: mongoose.Types.ObjectId;
  receiverIds: mongoose.Types.ObjectId[];
  title: string;
  subtitle: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ReceiverAvailabilityNotificationDocument =
  HydratedDocument<IReceiverAvailabilityNotification>;

const receiverAvailabilityNotificationSchema = new Schema<IReceiverAvailabilityNotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    receiverIds: [{ type: Schema.Types.ObjectId, ref: 'Receiver', required: true }],
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

receiverAvailabilityNotificationSchema.index({ userId: 1, createdAt: -1 });
receiverAvailabilityNotificationSchema.index({ userId: 1, receiverIds: 1, createdAt: -1 });

const ReceiverAvailabilityNotification: Model<IReceiverAvailabilityNotification> =
  mongoose.model<IReceiverAvailabilityNotification>(
    'ReceiverAvailabilityNotification',
    receiverAvailabilityNotificationSchema
  );

export default ReceiverAvailabilityNotification;
