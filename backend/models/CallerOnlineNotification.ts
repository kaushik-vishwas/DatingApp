import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export interface ICallerOnlineNotification {
  receiverId: mongoose.Types.ObjectId;
  callerIds: mongoose.Types.ObjectId[];
  title: string;
  subtitle: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CallerOnlineNotificationDocument = HydratedDocument<ICallerOnlineNotification>;

const callerOnlineNotificationSchema = new Schema<ICallerOnlineNotification>(
  {
    receiverId: { type: Schema.Types.ObjectId, ref: 'Receiver', required: true, index: true },
    callerIds: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

callerOnlineNotificationSchema.index({ receiverId: 1, createdAt: -1 });
callerOnlineNotificationSchema.index({ receiverId: 1, callerIds: 1, createdAt: -1 });

const CallerOnlineNotification: Model<ICallerOnlineNotification> = mongoose.model<ICallerOnlineNotification>(
  'CallerOnlineNotification',
  callerOnlineNotificationSchema
);

export default CallerOnlineNotification;
