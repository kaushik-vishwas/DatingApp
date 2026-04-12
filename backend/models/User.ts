import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export type UserAccountStatus = 'pending_profile' | 'pending_review' | 'approved' | 'rejected';

export type Gender = 'male' | 'female' | 'other';

/** App members (callers) — dating user profile only (collection: `users`) */
export interface IUser {
  name: string;
  email: string;
  phone: string;
  isVerified: boolean;
  otp: string | null;
  otpExpiry: Date | null;
  accountStatus: UserAccountStatus;
  profileImage: string | null;
  languages: string[];
  interests: string[];
  gender: Gender | null;
  /** UTC midnight for calendar `YYYY-MM-DD` from client */
  dateOfBirth: Date | null;
  age: number | null;
  state: string | null;
  passwordHash: string | null;
  /** Admin-only: blocks sign-in and API access for app users */
  suspended: boolean;
  /** Wallet balance in INR (whole rupees); reserved for future wallet features */
  walletBalance: number;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<IUser>;

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
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
    dateOfBirth: { type: Date, default: null },
    age: { type: Number, default: null },
    state: { type: String, default: null, trim: true },
    passwordHash: { type: String, default: null, select: false },
    suspended: { type: Boolean, default: false },
    walletBalance: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const User: Model<IUser> = mongoose.model<IUser>('User', userSchema);

export default User;
