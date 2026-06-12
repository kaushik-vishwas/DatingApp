import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export type UserAccountStatus = 'pending_profile' | 'pending_review' | 'approved' | 'rejected';

export type Gender = 'male' | 'female' | 'other';

/** App members (callers) — dating user profile only (collection: `users`) */
export interface IUser {
  name: string;
  phone: string;
  isVerified: boolean;
  otp: string | null;
  otpExpiry: Date | null;
  accountStatus: UserAccountStatus;
  profileImage: string | null;
  languages: string[];
  interests: string[];
  gender: Gender | null;
  age: number | null;
  state: string | null;
  passwordHash: string | null;
  /** Admin-only: blocks sign-in and API access for app users */
  suspended: boolean;
  /** Wallet balance in INR (whole rupees); reserved for future wallet features */
  walletBalance: number;
  /** Set when an admin applies a warning from a moderation report. */
  moderationWarningAt: Date | null;
  /** HTTPS URL of voice sample (callers only); stored as `userAudio` in MongoDB. */
  userAudio: string | null;
  /** Incremented on each new login; JWT must match for single-device sessions. */
  authSessionVersion: number;
  /** Unique share code for referral invites. */
  referralCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<IUser>;

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true, unique: true },
    isVerified: { type: Boolean, default: false },
    otp: { type: String, default: null },
    otpExpiry: { type: Date, default: null },
    accountStatus: {
      type: String,
      enum: ['pending_profile', 'pending_review', 'approved', 'rejected'],
      default: 'pending_profile',
    },
    profileImage: { type: String, default: null },
    languages: { type: [String], default: [] },
    interests: { type: [String], default: [] },
    gender: { type: String, enum: ['male', 'female', 'other'], default: null },
    age: { type: Number, default: null },
    state: { type: String, default: null, trim: true },
    passwordHash: { type: String, default: null, select: false },
    suspended: { type: Boolean, default: false },
    walletBalance: { type: Number, default: 0 },
    moderationWarningAt: { type: Date, default: null },
    userAudio: { type: String, default: null },
    authSessionVersion: { type: Number, default: 0, min: 0 },
    referralCode: { type: String, default: null, trim: true, uppercase: true, sparse: true, unique: true },
  },
  { timestamps: true }
);

const User: Model<IUser> = mongoose.model<IUser>('User', userSchema);

export default User;
