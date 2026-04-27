import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export interface IChatReadState {
  userId: mongoose.Types.ObjectId;
  receiverId: mongoose.Types.ObjectId;
  userLastReadAt: Date | null;
  receiverLastReadAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ChatReadStateDocument = HydratedDocument<IChatReadState>;

const chatReadStateSchema = new Schema<IChatReadState>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    receiverId: { type: Schema.Types.ObjectId, ref: 'Receiver', required: true, index: true },
    userLastReadAt: { type: Date, default: null },
    receiverLastReadAt: { type: Date, default: null },
  },
  { timestamps: true }
);

chatReadStateSchema.index({ userId: 1, receiverId: 1 }, { unique: true });

const ChatReadState: Model<IChatReadState> = mongoose.model<IChatReadState>(
  'ChatReadState',
  chatReadStateSchema
);

export default ChatReadState;

