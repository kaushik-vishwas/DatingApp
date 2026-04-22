import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

/** Either party may block the pair; chat is disabled for both while this row exists. */
export interface IChatBlock {
  userId: mongoose.Types.ObjectId;
  receiverId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type ChatBlockDocument = HydratedDocument<IChatBlock>;

const chatBlockSchema = new Schema<IChatBlock>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    receiverId: { type: Schema.Types.ObjectId, ref: 'Receiver', required: true, index: true },
  },
  { timestamps: true }
);

chatBlockSchema.index({ userId: 1, receiverId: 1 }, { unique: true });

const ChatBlock: Model<IChatBlock> = mongoose.model<IChatBlock>('ChatBlock', chatBlockSchema);

export default ChatBlock;
