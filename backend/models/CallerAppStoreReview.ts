import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

const MAX_REVIEW_LEN = 2000;

export interface ICallerAppStoreReview {
  userId: mongoose.Types.ObjectId;
  stars: number;
  review: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CallerAppStoreReviewDocument = HydratedDocument<ICallerAppStoreReview>;

const callerAppStoreReviewSchema = new Schema<ICallerAppStoreReview>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    stars: { type: Number, required: true, min: 1, max: 5 },
    review: { type: String, default: '', trim: true, maxlength: MAX_REVIEW_LEN },
  },
  { timestamps: true }
);

callerAppStoreReviewSchema.index({ updatedAt: -1 });

const CallerAppStoreReview: Model<ICallerAppStoreReview> = mongoose.model<ICallerAppStoreReview>(
  'CallerAppStoreReview',
  callerAppStoreReviewSchema
);

export default CallerAppStoreReview;
export { MAX_REVIEW_LEN };
