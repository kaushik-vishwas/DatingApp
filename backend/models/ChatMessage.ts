import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export type ChatSenderType = 'u' | 'r';

export interface IChatMessage {
  userId: mongoose.Types.ObjectId;
  receiverId: mongoose.Types.ObjectId;
  senderType: ChatSenderType;
  text: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ChatMessageDocument = HydratedDocument<IChatMessage>;

const chatMessageSchema = new Schema<IChatMessage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    receiverId: { type: Schema.Types.ObjectId, ref: 'Receiver', required: true, index: true },
    senderType: { type: String, enum: ['u', 'r'], required: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true }
);

chatMessageSchema.index({ userId: 1, receiverId: 1, createdAt: 1 });

const ChatMessage: Model<IChatMessage> = mongoose.model<IChatMessage>('ChatMessage', chatMessageSchema);

export default ChatMessage;
