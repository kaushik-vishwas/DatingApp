import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export interface IReceiverPriorityNotification {
  receiverId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  lastNotifiedAt: Date;
  priorityUntil: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type ReceiverPriorityNotificationDocument = HydratedDocument<IReceiverPriorityNotification>;

const receiverPriorityNotificationSchema = new Schema<IReceiverPriorityNotification>(
  {
    receiverId: { type: Schema.Types.ObjectId, ref: 'Receiver', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    lastNotifiedAt: { type: Date, required: true },
    priorityUntil: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

receiverPriorityNotificationSchema.index({ receiverId: 1, userId: 1 }, { unique: true });
receiverPriorityNotificationSchema.index({ userId: 1, priorityUntil: -1 });

const ReceiverPriorityNotification: Model<IReceiverPriorityNotification> =
  mongoose.model<IReceiverPriorityNotification>(
    'ReceiverPriorityNotification',
    receiverPriorityNotificationSchema
  );

export default ReceiverPriorityNotification;
