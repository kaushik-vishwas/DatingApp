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
  isAvailable: boolean;
  isOnline: boolean;
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
  unreadCount?: number;
}

export interface ChatMessagesResponse {
  messages: ChatMessageDto[];
}

export interface ChatConversationsResponse {
  conversations: ChatPeerSummary[];
}

export interface VoiceBootstrapResponse {
  apiKey: string;
  token: string;
  tokenExpiresAt: string;
  streamUserId: string;
  peerStreamUserId: string;
  peerAccountId: string;
  receiverRatePerMinute: number;
  callType: string;
  callId: string;
}

export interface RandomReceiverMatchResponse {
  receiverId: string;
  name: string;
  profileImage: string | null;
}

export type ReceiverCallInsightRow = {
  id: string;
  callerId: string;
  callerName: string;
  callerImage: string | null;
  startedAt: string;
  durationSec: number;
  earningInr: number;
  rating: number | null;
};

export type ReceiverCallerHistoryRow = {
  callerId: string;
  callerName: string;
  callsWeek: number;
  callsMonth: number;
  durationWeekSec: number;
  durationMonthSec: number;
  avgRating: number | null;
};

export interface ReceiverCallInsightsResponse {
  leaderboard: {
    totalDurationSec: number;
    totalMinutes: number;
    thisWeekDurationSec: number;
    thisWeekMinutes: number;
    thisMonthDurationSec: number;
    thisMonthMinutes: number;
  };
  recentCalls: ReceiverCallInsightRow[];
  callerHistory: ReceiverCallerHistoryRow[];
}

export type ReceiverNotifyCandidateRow = {
  userId: string;
  name: string;
  profileImage: string | null;
  lastCallAt: string;
};

export interface ReceiverNotifyCandidatesResponse {
  users: ReceiverNotifyCandidateRow[];
}

export interface ReceiverNotifyUserResponse {
  message: string;
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

export type ReceiverWithdrawalStatus = 'pending' | 'approved' | 'rejected';

export interface ReceiverWithdrawalRow {
  id: string;
  amount: number;
  status: ReceiverWithdrawalStatus;
  createdAt: string;
}

export interface ReceiverWithdrawalOverviewResponse {
  walletBalance: number;
  pendingAmount: number;
  bank: {
    bankName: string;
    accountHolderName: string;
    accountMasked: string;
  };
  otpEmail: string;
  recent: ReceiverWithdrawalRow[];
}

export interface SendWithdrawalOtpResponse {
  message: string;
  email: string;
  expiresInSec: number;
}

export interface VerifyWithdrawalOtpResponse {
  message: string;
  walletBalance: number;
  withdrawal: ReceiverWithdrawalRow;
}

export type CallerCallStatus = 'completed' | 'missed' | 'failed';

export interface CallerCallHistoryRow {
  id: string;
  receiverId: string;
  receiverName: string;
  receiverImage: string | null;
  durationSec: number;
  startedAt: string;
  status: CallerCallStatus;
}

export interface CallerCallHistoryResponse {
  calls: CallerCallHistoryRow[];
}

export type CallerNotificationType = 'transaction' | 'chat' | 'call';

export interface CallerNotificationRow {
  id: string;
  type: CallerNotificationType;
  title: string;
  subtitle: string;
  at: string;
}

export interface CallerNotificationsResponse {
  notifications: CallerNotificationRow[];
}

export type ReceiverEarningEntryType = 'call' | 'chat';

export interface ReceiverEarningEntry {
  id: string;
  type: ReceiverEarningEntryType;
  title: string;
  createdAt: string;
  durationMin: number;
  grossAmount: number;
  platformFee: number;
  netEarning: number;
  status: 'completed' | 'processing';
}

export interface ReceiverEarningsBreakdownResponse {
  stats: {
    totalCalls: number;
    avgCallMinutes: number;
    totalMinutes: number;
    grossEarnings: number;
    platformFee: number;
    netEarnings: number;
    chatEarnings: number;
  };
  entries: ReceiverEarningEntry[];
  analytics: {
    week: Array<{ label: string; amount: number; sessions: number }>;
    month: Array<{ label: string; amount: number; sessions: number }>;
    all: Array<{ label: string; amount: number; sessions: number }>;
  };
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

export interface UpdateReceiverProfilePayload {
  name?: string;
  profileImage?: string;
  languages?: string[];
  interests?: string[];
  state?: string;
  audioCallRate?: number;
  isAvailable?: boolean;
}

export interface DeleteReceiverAccountPayload {
  reason?: string;
}

export interface ReceiverBankDetailsPayload {
  bankAccountHolderName: string;
  bankAccountType: 'savings' | 'current';
  bankAccountNumber: string;
  bankIfsc: string;
  bankName: string;
}

export interface ReceiverBankOtpSendResponse {
  message: string;
  emailMasked: string;
  expiresInSec: number;
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
  userAudio?: string;
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

