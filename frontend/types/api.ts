import type { Gender, UserProfile, UserRole } from './user';

/** PATCH /profile/caller — same fields as complete-caller */
export interface UpdateCallerPayload {
  name: string;
  profileImage: string;
  languages: string[];
  interests: string[];
  gender: Gender;
  state: string;
}

/** Which auth table / login flow (must match backend) */
export type AuthAccountType = 'user' | 'receiver';

export interface RegisterPayload {
  name?: string;
  phone: string;
  role?: UserRole;
}

export interface LoginResponse {
  message: string;
  token: string;
  user: UserProfile;
}

export interface SendOtpResponse {
  message: string;
  sent?: boolean;
}

export interface VerifyOtpResponse {
  message: string;
  token: string;
  user: UserProfile;
}

export interface PhoneLookupResponse {
  accountType: AuthAccountType | null;
  isRegistered: boolean;
}

export interface SendMobileOtpResponse {
  message: string;
  sent: boolean;
  accountType: AuthAccountType | null;
  isNewUser: boolean;
}

export type VerifyMobileOtpAuthenticated = {
  status: 'authenticated';
  message: string;
  token: string;
  user: UserProfile;
  accountType: AuthAccountType;
};

export type VerifyMobileOtpNeedsGender = {
  status: 'needs_gender';
  message: string;
  phone: string;
};

export type VerifyMobileOtpResponse = VerifyMobileOtpAuthenticated | VerifyMobileOtpNeedsGender;

export interface CompleteMobileSignupPayload {
  phone: string;
  gender: 'male' | 'female';
}

export interface CompleteMobileSignupResponse {
  message: string;
  token: string;
  user: UserProfile;
  accountType: AuthAccountType;
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
  /** True only when receiver is currently occupied on another call. */
  isBusyOnCall?: boolean;
  ratingAvg: number;
  ratingCount: number;
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
  prefillContact: string;
  prefillName: string;
}

/** GET /wallet/topups */
export type CallerWalletTopupRow = {
  id: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  payAmount: number;
  bonusPercent: number;
  creditAdded: number;
  createdAt: string;
};

export interface CallerWalletTopupsResponse {
  topups: CallerWalletTopupRow[];
}

export type WalletOfferRow = {
  id: string;
  amount: number;
  bonusPercent: number;
  popular: boolean;
  active: boolean;
  offerBannerDataUrl?: string | null;
};

export type WalletOffersResponse = {
  offers: WalletOfferRow[];
  banner:
    | {
        offerId: string;
        imageDataUrl: string;
      }
    | null;
};

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
  /** Caller charge rate per minute (deduction side). */
  receiverRatePerMinute: number;
  /** Receiver earning rate per minute (score tier or current fixed window). */
  receiverEarningRatePerMinute?: number;
  receiverEarningModel?: 'score_based' | 'fixed_per_minute';
  fixedPerMinuteWindows?: Array<{
    id: string;
    label: string;
    from: string;
    to: string;
    ratePerMinute: number;
  }>;
  earningTimezone?: string;
  callType: string;
  callId: string;
}

export interface RandomReceiverMatchResponse {
  receiverId: string;
  name: string;
  profileImage: string | null;
  /** Per-minute rate when matched; used for wallet checks before placing call */
  audioCallRate?: number | null;
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

/** One card per caller for ring-only / not-connected calls. */
export type ReceiverMissedCallGroupRow = {
  callerId: string;
  callerName: string;
  callerImage: string | null;
  missedCount: number;
  lastAt: string;
  lastDurationSec: number;
};

/** One card per caller for connected calls under minimum duration. */
export type ReceiverIncompleteCallGroupRow = {
  callerId: string;
  callerName: string;
  callerImage: string | null;
  incompleteCount: number;
  lastAt: string;
  lastDurationSec: number;
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
  missedCallGroups: ReceiverMissedCallGroupRow[];
  incompleteCallGroups: ReceiverIncompleteCallGroupRow[];
  callerHistory: ReceiverCallerHistoryRow[];
  receiverRatingAvg: number;
  receiverRatingCount: number;
  totalScore: number;
  badgeLevel?: 'platinum' | 'diamond' | 'supreme';
  receiverEarningModel?: 'score_based' | 'fixed_per_minute';
  earningRatePerMinute?: number;
  fixedPerMinuteWindows?: Array<{
    id: string;
    label: string;
    from: string;
    to: string;
    ratePerMinute: number;
  }>;
  earningTimezone?: string;
  scoreRules?: {
    call: {
      ignoreAtOrBelowSeconds: number;
      midBand: { minMinutes: number; maxMinutesExclusive: number; multiplier: number };
      topBand: { minMinutes: number; multiplier: number };
    };
    online: {
      timezone: string;
      windows: Array<{ from: string; to: string; multiplier: number }>;
    };
    weekendTargets: {
      weekday: { supremeAt: number; diamondAt: number };
      weekend: { supremeAt: number; diamondAt: number };
      note: string;
    };
  };
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
  /** Withdrawable balance (e.g. chat message credits credited to wallet). */
  walletBalance: number;
  /** Paid chat (and same rules as billing) since local midnight on the server. */
  chatToday: number;
  /** Same, since the first day of this calendar month (server local). */
  chatThisMonth: number;
  /** Lifetime chat message earnings (same fee rules as billing). */
  chatEarningsLifetime?: number;
  /** Chat earnings in the rolling last 7 days. */
  chatEarningsThisWeek?: number;
  /** Lifetime voice-call earnings from score-tier rate × duration (`receiverEarnedInr` per session). */
  callEarningsLifetime: number;
  callEarningsToday: number;
  callEarningsThisWeek: number;
  /** Chat + call combined totals for earnings summary UI. */
  totalEarningsLifetime?: number;
  totalEarningsToday?: number;
  totalEarningsThisWeek?: number;
  recent: ReceiverWalletRecentRow[];
}

export type ReceiverWithdrawalStatus = 'pending' | 'approved' | 'rejected';

export type ReceiverPayoutStatus = 'processing' | 'success' | 'failed';

export interface ReceiverWithdrawalRow {
  id: string;
  amount: number;
  status: ReceiverWithdrawalStatus;
  payoutStatus?: ReceiverPayoutStatus;
  createdAt: string;
}

export interface ReceiverWithdrawalOverviewResponse {
  walletBalance: number;
  pendingAmount: number;
  totalEarnings?: number;
  totalWithdrawn?: number;
  payment?: {
    nameAsPerAadhaar: string;
    upiMasked: string;
    complete: boolean;
  };
  bank: {
    bankName: string;
    accountHolderName: string;
    accountMasked: string;
  };
  phoneMasked: string;
  recent: ReceiverWithdrawalRow[];
}

export interface SendWithdrawalOtpResponse {
  message: string;
  phoneMasked: string;
  expiresInSec: number;
}

export interface VerifyWithdrawalOtpResponse {
  message: string;
  walletBalance: number;
  withdrawal: ReceiverWithdrawalRow;
}

export type CallerCallStatus = 'completed' | 'missed' | 'incomplete';

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

export interface CallerMessageEligibleReceiversResponse {
  receiverIds: string[];
}

/** GET /profile/caller-app-review */
export interface CallerAppReviewMeResponse {
  exists: boolean;
  stars: number | null;
  review: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ReceiverCallerOnlineNotificationRow {
  id: string;
  callerIds: string[];
  callerName: string;
  callerImage: string | null;
  title: string;
  subtitle: string;
  at: string;
}

export interface ReceiverCallerOnlineNotificationsResponse {
  notifications: ReceiverCallerOnlineNotificationRow[];
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
  aadhaarNumber: string;
  panNumber: string;
  panFront: string;
  languages: string[];
  interests: string[];
  gender: Gender;
  state: string;
  bankAccountHolderName: string;
  bankAccountType: 'savings' | 'current';
  bankAccountNumber: string;
  bankIfsc: string;
  bankName: string;
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
  aadhaarNumber?: string;
  panNumber?: string;
  aadhaarFront?: string;
  aadhaarBack?: string;
  panFront?: string;
  audioCallRate?: number;
  isAvailable?: boolean;
  userAudio?: string;
  gender?: Gender | null;
  age?: number;
}

export interface DeleteReceiverAccountPayload {
  reason?: string;
}

export interface ReceiverBankDetailsPayload {
  nameAsPerAadhaar: string;
  upiId: string;
  aadhaarNumber: string;
  panNumber: string;
  aadhaarFront?: string;
  aadhaarBack?: string;
  panFront?: string;
}

export interface ReceiverBankOtpSendResponse {
  message: string;
  phoneMasked: string;
  expiresInSec: number;
}

export interface CompleteCallerPayload {
  name: string;
  profileImage: string;
  languages: string[];
  interests: string[];
  gender: Gender;
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
  voiceVerification?: {
    provider: 'huggingface';
    approved: boolean;
    predictedGender: 'female' | 'male' | 'other' | 'unknown';
    confidence: number;
    threshold: number;
    model: string;
    reason?: string;
  };
}

