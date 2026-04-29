import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export interface IReceiverRating {
  receiverId: mongoose.Types.ObjectId;
  raterId: mongoose.Types.ObjectId;
  rating: number;
  lastCallId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ReceiverRatingDocument = HydratedDocument<IReceiverRating>;

const receiverRatingSchema = new Schema<IReceiverRating>(
  {
    receiverId: { type: Schema.Types.ObjectId, ref: 'Receiver', required: true, index: true },
    raterId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    lastCallId: { type: String, default: null, trim: true },
  },
  { timestamps: true }
);

receiverRatingSchema.index({ receiverId: 1, raterId: 1 }, { unique: true });
receiverRatingSchema.index({ receiverId: 1, updatedAt: -1 });

const ReceiverRating: Model<IReceiverRating> = mongoose.model<IReceiverRating>(
  'ReceiverRating',
  receiverRatingSchema
);

export default ReceiverRating;
