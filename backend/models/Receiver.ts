import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export type ReceiverAccountStatus = 'pending_profile' | 'pending_review' | 'approved' | 'rejected';

export type BankAccountType = 'savings' | 'current';

export type Gender = 'male' | 'female' | 'other';
export const RECEIVER_AUDIO_CALL_RATE_INR_PER_MIN = 5;
export type ReceiverBadgeLevel = 'platinum' | 'diamond' | 'supreme';

/** Call receivers — KYC, bank, commission-related profile (collection: `receivers`) */
export interface IReceiver {
  name: string;
  phone: string;
  isVerified: boolean;
  otp: string | null;
  otpExpiry: Date | null;
  accountStatus: ReceiverAccountStatus;
  profileImage: string | null;
  documents: string[];
  aadhaarFront: string | null;
  aadhaarBack: string | null;
  aadhaarNumber: string | null;
  panNumber: string | null;
  panFront: string | null;
  /** Legal name for payouts (as on Aadhaar). */
  nameAsPerAadhaar: string | null;
  /** UPI VPA for withdrawal payouts (e.g. name@bank). */
  upiId: string | null;
  bankAccountHolderName: string | null;
  bankAccountType: BankAccountType | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankName: string | null;
  languages: string[];
  interests: string[];
  gender: Gender | null;
  age: number | null;
  state: string | null;
  passwordHash: string | null;
  /** Audio call rate in INR per minute (set during profile setup). */
  audioCallRate: number | null;
  /** HTTPS URL of voice sample captured during receiver onboarding. */
  userAudio: string | null;
  /** Earnings wallet in INR (e.g. per-message chat credits). */
  walletBalance: number;
  /** Admin moderation: blocks receiver app access when true (like caller `suspended`). */
  suspended: boolean;
  /** Receiver-controlled discover/call availability switch. */
  isAvailable: boolean;
  /** Runtime presence from active socket session(s). */
  isOnline: boolean;
  /** Discover grace window end — keeps receiver visible after minimize/socket drop. */
  discoverGraceUntil: Date | null;
  /** Set when an admin applies a warning from a moderation report. */
  moderationWarningAt: Date | null;
  /** Last admin-provided reason when KYC is rejected. */
  rejectionReason: string | null;
  pendingNameAsPerAadhaar: string | null;
  pendingUpiId: string | null;
  pendingAadhaarNumber: string | null;
  pendingPanNumber: string | null;
  pendingAadhaarFront: string | null;
  pendingAadhaarBack: string | null;
  pendingPanFront: string | null;
  pendingBankAccountHolderName: string | null;
  pendingBankAccountType: BankAccountType | null;
  pendingBankAccountNumber: string | null;
  pendingBankIfsc: string | null;
  pendingBankName: string | null;
  /** Cumulative anti-fraud score across all tracked activity. */
  cumulativeScore: number;
  /** Cumulative call minutes considered valid for payout calculation. */
  cumulativeValidCallMinutes: number;
  /** Current badge tier derived from cumulative score. */
  badgeLevel: ReceiverBadgeLevel;
  /** Current payout rate (INR per valid call minute) derived from badge level. */
  earningRatePerMinute: number;
  /** Timestamp when the active online session started. */
  onlineSince: Date | null;
  /** Incremented on each new login; JWT must match for single-device sessions. */
  authSessionVersion: number;
  /** Expo push token for incoming-call alerts when the app is backgrounded. */
  expoPushToken: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ReceiverDocument = HydratedDocument<IReceiver>;

const receiverSchema = new Schema<IReceiver>(
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
    documents: { type: [String], default: [] },
    aadhaarFront: { type: String, default: null },
    aadhaarBack: { type: String, default: null },
    aadhaarNumber: { type: String, default: null },
    panNumber: { type: String, default: null },
    panFront: { type: String, default: null },
    nameAsPerAadhaar: { type: String, default: null },
    upiId: { type: String, default: null },
    bankAccountHolderName: { type: String, default: null },
    bankAccountType: { type: String, enum: ['savings', 'current'], default: null },
    bankAccountNumber: { type: String, default: null },
    bankIfsc: { type: String, default: null },
    bankName: { type: String, default: null },
    languages: { type: [String], default: [] },
    interests: { type: [String], default: [] },
    gender: { type: String, enum: ['male', 'female', 'other'], default: null },
    age: { type: Number, default: null },
    state: { type: String, default: null, trim: true },
    passwordHash: { type: String, default: null, select: false },
    audioCallRate: { type: Number, default: RECEIVER_AUDIO_CALL_RATE_INR_PER_MIN },
    userAudio: { type: String, default: null },
    walletBalance: { type: Number, default: 0 },
    suspended: { type: Boolean, default: false },
    isAvailable: { type: Boolean, default: false },
    isOnline: { type: Boolean, default: false },
    discoverGraceUntil: { type: Date, default: null },
    moderationWarningAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null },
    pendingNameAsPerAadhaar: { type: String, default: null },
    pendingUpiId: { type: String, default: null },
    pendingAadhaarNumber: { type: String, default: null },
    pendingPanNumber: { type: String, default: null },
    pendingAadhaarFront: { type: String, default: null },
    pendingAadhaarBack: { type: String, default: null },
    pendingPanFront: { type: String, default: null },
    pendingBankAccountHolderName: { type: String, default: null },
    pendingBankAccountType: { type: String, enum: ['savings', 'current'], default: null },
    pendingBankAccountNumber: { type: String, default: null },
    pendingBankIfsc: { type: String, default: null },
    pendingBankName: { type: String, default: null },
    cumulativeScore: { type: Number, default: 0, min: 0 },
    cumulativeValidCallMinutes: { type: Number, default: 0, min: 0 },
    badgeLevel: { type: String, enum: ['platinum', 'diamond', 'supreme'], default: 'platinum' },
    earningRatePerMinute: { type: Number, default: 2.0, min: 0 },
    onlineSince: { type: Date, default: null },
    authSessionVersion: { type: Number, default: 0, min: 0 },
    expoPushToken: { type: String, default: null },
  },
  { timestamps: true }
);

const Receiver: Model<IReceiver> = mongoose.model<IReceiver>('Receiver', receiverSchema);

export default Receiver;