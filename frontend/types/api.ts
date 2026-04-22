import type { Gender, UserProfile, UserRole } from './user';

/** PATCH /profile/caller — same fields as complete-caller */
export interface UpdateCallerPayload {
  name: string;
  profileImage: string;
  languages: string[];
  interests: string[];
  gender: Gender;
  /** `YYYY-MM-DD` */
  dateOfBirth: string;
  state: string;
}

/** Which auth table / login flow (must match backend) */
export type AuthAccountType = 'user' | 'receiver';

export interface RegisterPayload {
  name: string;
  email: string;
  phone: string;
  password: string;
  /** `YYYY-MM-DD` */
  dateOfBirth: string;
  role?: UserRole;
}

export interface LoginResponse {
  message: string;
  token: string;
  user: UserProfile;
}

export interface SendOtpResponse {
  message: string;
  emailSent?: boolean;
}

export interface VerifyOtpResponse {
  message: string;
  token: string;
  user: UserProfile;
}

export interface RegisterResponse {
  message: string;
  user: UserProfile;
}

export interface MeResponse {
  user: UserProfile;
}

/** Public receiver card for caller discover feed */
export interface DiscoverReceiverSummary {
  _id: string;
  name: string;
  age: number | null;
  state: string | null;
  interests: string[];
  languages: string[];
  profileImage: string | null;
  audioCallRate: number | null;
  /** ISO timestamp for "last seen" on caller profile */
  updatedAt: string;
  gender: Gender | null;
}

export interface WalletCreditResponse {
  message: string;
  creditAdded: number;
  user: UserProfile;
}

/** POST /wallet/razorpay-order */
export interface RazorpayOrderResponse {
  orderId: string;
  /** Amount in paise */
  amount: number;
  currency: string;
  /** Public key id for Checkout */
  keyId: string;
  businessName: string;
  prefillEmail: string;
  prefillContact: string;
  prefillName: string;
}

export interface DiscoverReceiversResponse {
  receivers: DiscoverReceiverSummary[];
}

export type ChatSenderType = 'u' | 'r';

export interface ChatMessageDto {
  id: string;
  senderType: ChatSenderType;
  text: string;
  createdAt: string;
}

export interface ChatPeerSummary {
  peerId: string;
  peerName: string;
  peerImage: string | null;
  lastText: string;
  lastAt: string;
}

export interface ChatMessagesResponse {
  messages: ChatMessageDto[];
}

export interface ChatConversationsResponse {
  conversations: ChatPeerSummary[];
}

export type ReceiverWalletRecentRow = {
  id: string;
  title: string;
  subtitle: string;
  amountInr: number;
  createdAt: string;
};

export interface ReceiverWalletSummaryResponse {
  walletBalance: number;
  /** Paid chat (and same rules as billing) since local midnight on the server. */
  chatToday: number;
  /** Same, since the first day of this calendar month (server local). */
  chatThisMonth: number;
  recent: ReceiverWalletRecentRow[];
}

export interface CompleteProfilePayload {
  name: string;
  profileImage: string;
  aadhaarFront: string;
  aadhaarBack: string;
  languages: string[];
  interests: string[];
  gender: Gender;
  /** `YYYY-MM-DD` */
  dateOfBirth: string;
  state: string;
  bankAccountHolderName: string;
  bankAccountType: 'savings' | 'current';
  bankAccountNumber: string;
  bankIfsc: string;
  bankName: string;
  /** INR per minute */
  audioCallRate: number;
}

export interface CompleteProfileResponse {
  message: string;
  user: UserProfile;
}

export interface CompleteCallerPayload {
  name: string;
  profileImage: string;
  languages: string[];
  interests: string[];
  gender: Gender;
  /** `YYYY-MM-DD` */
  dateOfBirth: string;
  state: string;
  userAudio: string;
}

export interface SaveCallerUserAudioPayload {
  userAudio: string;
}

export interface SaveCallerUserAudioResponse {
  message: string;
  user: UserProfile;
}

export interface CompleteCallerResponse {
  message: string;
  user: UserProfile;
}

