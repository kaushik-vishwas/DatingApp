/** API `role`: app user (`users` collection) vs call receiver (`receivers` collection) */
export type UserRole = 'caller' | 'receiver';

export type AccountStatus = 'pending_profile' | 'pending_review' | 'approved' | 'rejected';

export type BankAccountType = 'savings' | 'current';

export type Gender = 'male' | 'female' | 'other';

export interface UserProfile {
  _id: string;
  name: string;
  phone: string;
  isVerified: boolean;
  role: UserRole;
  accountStatus: AccountStatus;
  gender: Gender | null;
  age: number | null;
  state: string | null;
  profileImage: string | null;
  documents: string[];
  aadhaarFront: string | null;
  aadhaarBack: string | null;
  aadhaarNumber?: string | null;
  panNumber?: string | null;
  panFront?: string | null;
  nameAsPerAadhaar?: string | null;
  upiId?: string | null;
  bankAccountHolderName: string | null;
  bankAccountType: BankAccountType | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankName: string | null;
  languages: string[];
  interests: string[];
  createdAt: string;
  updatedAt?: string;
  /** Admin suspension — blocks app access when true (callers only). */
  suspended?: boolean;
  walletBalance?: number;
  /** Call receivers: audio rate in ₹/min after profile complete */
  audioCallRate?: number | null;
  /** App users (callers): voice sample HTTPS URL (MongoDB: `userAudio`). */
  userAudio?: string | null;
  /** Receiver-controlled availability for discover/calls. */
  isAvailable?: boolean;
  /** Runtime online presence (receiver only). */
  isOnline?: boolean;
  /** Receiver rejection reason from admin (when rejected). */
  rejectionReason?: string | null;
  /** Receiver: anti-fraud score persisted on server (`cumulativeScore`). */
  cumulativeScore?: number;
  badgeLevel?: 'platinum' | 'diamond' | 'supreme';
  earningRatePerMinute?: number;
}
