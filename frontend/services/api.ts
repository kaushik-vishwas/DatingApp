import axios, { type AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type {
  AuthAccountType,
  CompleteCallerPayload,
  CompleteCallerResponse,
  SaveCallerUserAudioPayload,
  SaveCallerUserAudioResponse,
  SaveReceiverUserAudioPayload,
  SaveReceiverUserAudioResponse,
  VoiceVerificationResult,
  CompleteProfilePayload,
  CompleteProfileResponse,
  UpdateReceiverProfilePayload,
  DeleteReceiverAccountPayload,
  ReceiverBankDetailsPayload,
  ReceiverBankOtpSendResponse,
  DiscoverReceiversResponse,
  LoginResponse,
  MeResponse,
  RegisterPayload,
  RegisterResponse,
  SendOtpResponse,
  SendMobileOtpResponse,
  PhoneLookupResponse,
  VerifyMobileOtpResponse,
  CompleteMobileSignupPayload,
  CompleteMobileSignupResponse,
  UpdateCallerPayload,
  VerifyOtpResponse,
  WalletCreditResponse,
  WalletOffersResponse,
  RazorpayOrderResponse,
  CallerWalletTopupsResponse,
  ChatMessagesResponse,
  ChatConversationsResponse,
  ReceiverWalletSummaryResponse,
  ReceiverWithdrawalOverviewResponse,
  ReceiverCallInsightsResponse,
  ReceiverWelcomeResponse,
  CallerNotificationResponse,
  VoiceBootstrapResponse,
  RandomReceiverMatchResponse,
  SendWithdrawalOtpResponse,
  VerifyWithdrawalOtpResponse,
  CallerCallHistoryResponse,
  CallerMessageEligibleReceiversResponse,
  CallerAppReviewMeResponse,
  CallerNotificationsResponse,
  ReceiverCallerOnlineNotificationsResponse,
  ReceiverEarningsBreakdownResponse,
  ReceiverNotifyCandidatesResponse,
  ReceiverNotifyUserResponse,
  ReferralProfileResponse,
} from '../types/api';

const JWT_KEY = 'jwt';

/** Production API (release builds and dev fallback when Metro tunnel cannot reach your PC). */
const PROD_API = 'https://backend.nesthamapp.com';
const PROD_ORIGIN = normalizeApiOrigin(PROD_API);
const LOCAL_API_PORT = Number(process.env.EXPO_PUBLIC_API_LOCAL_PORT) || 5000;

let loggedDevApiChoice = false;

/** Normalize URL */
function normalizeApiOrigin(raw: string): string {
  let u = raw.trim().replace(/\/+$/, '');
  if (u.endsWith('/auth')) {
    u = u.slice(0, -5).replace(/\/+$/, '');
  }
  return u;
}

function getConfiguredApiBase(): string | undefined {
  const c = Constants as any;
  const raw = c.expoConfig?.extra?.apiBaseUrl || c.manifest?.extra?.apiBaseUrl;
  return typeof raw === 'string' && raw.trim() ? normalizeApiOrigin(raw) : undefined;
}

function shouldForceConfiguredApiBase(): boolean {
  const c = Constants as any;
  return (
    c.expoConfig?.extra?.disablePackagerHost === true ||
    process.env.EXPO_PUBLIC_API_DISABLE_PACKAGER_HOST === 'true'
  );
}

/** Local backend for dev: LAN IP from Expo, emulator loopback, or machine localhost. */
function getDevApiBase(): string | undefined {
  if (!__DEV__) return undefined;

  const c = Constants as any;
  const isAndroidEmulator = Platform.OS === 'android' && c.isDevice === false;
  const hostUri: string | undefined =
    c.expoConfig?.hostUri || c.manifest?.debuggerHost;

  if (!hostUri) return undefined;

  const host = hostUri.split(':')[0];

  if (!host) return undefined;

  // Android emulator cannot reach host machine via LAN IP reliably; use special host loopback.
  if (isAndroidEmulator) {
    return `http://10.0.2.2:${LOCAL_API_PORT}`;
  }

  // Expo tunnel only proxies Metro; your :5000 backend is not on the phone — use prod until you use LAN/USB.
  if (host.endsWith('.exp.direct')) {
    return undefined;
  }

  if (host === 'localhost' || host === '127.0.0.1') {
    return Platform.OS === 'android'
      ? `http://10.0.2.2:${LOCAL_API_PORT}`
      : `http://127.0.0.1:${LOCAL_API_PORT}`;
  }

  return `http://${host}:${LOCAL_API_PORT}`;
}

function logDevApiChoice(url: string, reason: string): string {
  if (__DEV__ && !loggedDevApiChoice) {
    loggedDevApiChoice = true;
    console.log(`[API] Dev backend: ${url} (${reason})`);
  }
  return url;
}

const getBaseURL = (): string => {
  const configured = getConfiguredApiBase();

  // Release / hosted builds: always production (or explicit EXPO_PUBLIC_API_BASE_URL).
  if (!__DEV__) {
    return configured || PROD_ORIGIN;
  }

  // Dev opt-in: force live backend (set EXPO_PUBLIC_API_DISABLE_PACKAGER_HOST=true in .env).
  if (shouldForceConfiguredApiBase() && configured) {
    return logDevApiChoice(configured, 'EXPO_PUBLIC_API_DISABLE_PACKAGER_HOST');
  }

  // Dev: custom non-prod URL in .env (staging, etc.).
  if (configured && configured !== PROD_ORIGIN) {
    return logDevApiChoice(configured, 'EXPO_PUBLIC_API_BASE_URL override');
  }

  // Dev default: local backend on same LAN as Metro (phone + PC on same Wi‑Fi).
  const devUrl = getDevApiBase();
  if (devUrl) {
    return logDevApiChoice(normalizeApiOrigin(devUrl), 'local packager host');
  }

  const c = Constants as any;
  const hostUri: string | undefined = c.expoConfig?.hostUri || c.manifest?.debuggerHost;
  const onTunnel = Boolean(hostUri?.includes('exp.direct'));
  if (onTunnel) {
    return logDevApiChoice(configured || PROD_ORIGIN, 'Expo tunnel — local :5000 not reachable');
  }

  // Simulator / emulator fallback.
  return logDevApiChoice(
    normalizeApiOrigin(
      Platform.OS === 'android'
        ? `http://10.0.2.2:${LOCAL_API_PORT}`
        : `http://127.0.0.1:${LOCAL_API_PORT}`
    ),
    'simulator fallback'
  );
};

/** True when the app is pointed at a local dev backend (not production). */
export function isLocalDevApiBackend(): boolean {
  if (!__DEV__) return false;
  const base = getBaseURL();
  return base !== PROD_ORIGIN && !base.startsWith('https://');
}

/** Debug helper */
export const getResolvedApiBaseUrl = (): string => getBaseURL();

const api = axios.create({
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/** Attach baseURL + token */
api.interceptors.request.use(async (config) => {
  const base = getBaseURL();
  config.baseURL = base;

  if (__DEV__) {
    const path = typeof config.url === 'string' ? config.url : '';
    const full = `${base.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;
    console.log(`[API] ${String(config.method).toUpperCase()} → ${full}`);
  }

  const token = await AsyncStorage.getItem(JWT_KEY);
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as any).Authorization = `Bearer ${token}`;
  }

  return config;
});

/** Error handler */
export const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const err = error as AxiosError<{ message?: unknown }>;
    const msg = err.response?.data?.message;

    if (typeof msg === 'string') return msg;
    if (Array.isArray(msg)) return msg.join(', ');
    if (!err.response) return 'Network error. Check backend connection';

    return err.message || 'Request failed';
  }

  if (error instanceof Error) return error.message;
  return 'Something went wrong';
};

/** JWT helpers */
export const saveJwt = async (token: string) => {
  await AsyncStorage.setItem(JWT_KEY, token);
};

export const getJwt = async () => {
  return AsyncStorage.getItem(JWT_KEY);
};

export const clearJwt = async () => {
  await AsyncStorage.removeItem(JWT_KEY);
};

/** APIs */

export const authApi = {
  sendOtp: (phone: string, accountType: AuthAccountType) =>
    api.post<SendOtpResponse>('/auth/send-otp', { phone, accountType }),

  verifyOtp: (phone: string, otp: string, accountType: AuthAccountType) =>
    api.post<VerifyOtpResponse>('/auth/verify-otp', { phone, otp, accountType }),

  lookupPhone: (phone: string) =>
    api.post<PhoneLookupResponse>('/auth/lookup-phone', { phone }),

  sendMobileOtp: (phone: string) => api.post<SendMobileOtpResponse>('/auth/send-otp-mobile', { phone }),

  verifyMobileOtp: (phone: string, otp: string) =>
    api.post<VerifyMobileOtpResponse>('/auth/verify-otp-mobile', { phone, otp }),

  completeMobileSignup: (payload: CompleteMobileSignupPayload) =>
    api.post<CompleteMobileSignupResponse>('/auth/complete-mobile-signup', payload),

  register: (payload: RegisterPayload) =>
    api.post<RegisterResponse>('/auth/register', payload),

  me: () => api.get<MeResponse>('/auth/me'),
};

export const profileApi = {
  complete: (payload: CompleteProfilePayload) =>
    api.post<CompleteProfileResponse>('/profile/complete', payload),

  saveCallerUserAudio: (payload: SaveCallerUserAudioPayload) =>
    api.patch<SaveCallerUserAudioResponse>('/profile/caller-audio', payload),

  saveReceiverUserAudio: (payload: SaveReceiverUserAudioPayload) =>
    api.patch<SaveReceiverUserAudioResponse>('/profile/receiver-audio', payload),

  completeCaller: (payload: CompleteCallerPayload) =>
    api.post<CompleteCallerResponse>('/profile/complete-caller', payload),

  updateCaller: (payload: UpdateCallerPayload) =>
    api.patch<CompleteCallerResponse>('/profile/caller', payload),

  receiverWalletSummary: () =>
    api.get<ReceiverWalletSummaryResponse>('/profile/receiver-wallet-summary'),

  receiverWithdrawalOverview: () =>
    api.get<ReceiverWithdrawalOverviewResponse>('/profile/withdrawals/overview'),

  sendReceiverWithdrawalOtp: (amount: number) =>
    api.post<SendWithdrawalOtpResponse>('/profile/withdrawals/send-otp', { amount }),

  verifyReceiverWithdrawalOtp: (otp: string) =>
    api.post<VerifyWithdrawalOtpResponse>('/profile/withdrawals/verify', { otp }),

  receiverCallInsights: (range: 'all' | 'week' | 'month' = 'all') =>
    api.get<ReceiverCallInsightsResponse>('/profile/receiver-call-insights', {
      params: { range },
    }),

  receiverWelcome: () => api.get<ReceiverWelcomeResponse>('/profile/receiver-welcome'),

  callerNotification: () => api.get<CallerNotificationResponse>('/profile/caller-notification'),

  updateReceiverProfile: (payload: UpdateReceiverProfilePayload) =>
    api.patch<CompleteProfileResponse>('/profile/receiver', payload),

  updateReceiverExpoPushToken: (expoPushToken: string) =>
    api.patch<{ ok: boolean }>('/profile/receiver/push-token', { expoPushToken }),

  receiverBackgroundPresence: () =>
    api.post<{ ok: boolean; graceUntilMs?: number; reason?: string | null }>(
      '/profile/receiver/presence/background'
    ),

  receiverForegroundPresence: () =>
    api.post<{ ok: boolean }>('/profile/receiver/presence/foreground'),

  completeReceiverAudioOnboarding: (payload?: { userAudio?: string }) =>
    api.post<CompleteProfileResponse>('/profile/receiver/complete-audio-onboarding', payload ?? {}),

  deleteReceiverAccount: (payload?: DeleteReceiverAccountPayload) =>
    api.delete<{ message: string }>('/profile/receiver', { data: payload ?? {} }),

  callerCallHistory: (range: 'all' | 'week' | 'month' = 'all') =>
    api.get<CallerCallHistoryResponse>('/profile/caller-call-history', {
      params: { range },
    }),

  deleteCallerCallHistory: (ids: string[]) =>
    api.post<{ ok: boolean; deleted: number }>('/profile/caller-call-history/delete', { ids }),

  deleteReceiverCallHistory: (ids: string[]) =>
    api.post<{ ok: boolean; deleted: number }>('/profile/receiver-call-history/delete', { ids }),

  callerMessageEligibleReceivers: () =>
    api.get<CallerMessageEligibleReceiversResponse>(
      '/profile/caller-message-eligible-receivers'
    ),

  getCallerAppReview: () =>
    api.get<CallerAppReviewMeResponse>('/profile/caller-app-review'),

  putCallerAppReview: (body: { stars: number; review: string }) =>
    api.put<{ ok: boolean }>('/profile/caller-app-review', body),

  callerNotifications: () =>
    api.get<CallerNotificationsResponse>('/profile/caller-notifications'),

  receiverCallerOnlineNotifications: () =>
    api.get<ReceiverCallerOnlineNotificationsResponse>(
      '/profile/receiver-caller-online-notifications'
    ),

  sendReceiverBankUpdateOtp: (payload: ReceiverBankDetailsPayload) =>
    api.post<ReceiverBankOtpSendResponse>('/profile/receiver/bank/send-otp', payload),

  verifyReceiverBankUpdateOtp: (otp: string) =>
    api.post<CompleteProfileResponse>('/profile/receiver/bank/verify', { otp }),

  reopenRejectedReceiverKyc: () =>
    api.post<CompleteProfileResponse>('/profile/receiver/reopen-kyc'),

  receiverEarningsBreakdown: (range: 'week' | 'month' | 'all' = 'week') =>
    api.get<ReceiverEarningsBreakdownResponse>('/profile/receiver-earnings-breakdown', {
      params: { range },
    }),

  receiverNotifyCandidates: () =>
    api.get<ReceiverNotifyCandidatesResponse>('/profile/receiver-notify-candidates'),

  notifyReceiverUser: (userId: string) =>
    api.post<ReceiverNotifyUserResponse>('/profile/receiver-notify-user', { userId }),

  referralProfile: () => api.get<ReferralProfileResponse>('/profile/referral'),
};

export const discoverApi = {
  listReceivers: (params?: {
    language?: string;
    q?: string;
    gender?: string;
    langs?: string;
    minAge?: number;
    maxAge?: number;
    limit?: number;
  }) => api.get<DiscoverReceiversResponse>('/discover/receivers', { params }),
};

export const walletApi = {
  listTopups: () => api.get<CallerWalletTopupsResponse>('/wallet/topups'),

  offers: () => api.get<WalletOffersResponse>('/wallet/offers'),

  credit: (body: { payAmount: number; bonusPercent: number; walletAmount: number }) =>
    api.post<WalletCreditResponse>('/wallet/credit', body),

  createRazorpayOrder: (body: { payAmount: number; bonusPercent: number; walletAmount: number }) =>
    api.post<RazorpayOrderResponse>('/wallet/razorpay-order', body),

  verifyRazorpayPayment: (body: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
    payAmount: number;
    bonusPercent: number;
    walletAmount: number;
  }) => api.post<WalletCreditResponse>('/wallet/razorpay-verify', body),
};

export const CHAT_REPORT_REASONS = [
  'Spam',
  'Harassment',
  'Inappropriate content',
  'Fake profile',
  'Other',
] as const;

export type ChatReportReason = (typeof CHAT_REPORT_REASONS)[number];

export const chatApi = {
  messages: (params: { receiverId?: string; userId?: string }) =>
    api.get<ChatMessagesResponse>('/chat/messages', { params }),

  conversations: () =>
    api.get<ChatConversationsResponse>('/chat/conversations'),

  block: (body: { receiverId?: string; userId?: string }) =>
    api.post<{ ok: boolean }>('/chat/block', body),

  unblock: (body: { receiverId?: string; userId?: string }) =>
    api.post<{ ok: boolean }>('/chat/unblock', body),

  blockStatus: (params: { receiverId?: string; userId?: string }) =>
    api.get<{ blocked: boolean }>('/chat/block-status', { params }),

  report: (body: {
    receiverId?: string;
    userId?: string;
    reason: ChatReportReason;
    preview?: string;
  }) => api.post<{ ok: boolean }>('/chat/report', body),

  clear: (body: { receiverId?: string; userId?: string }) =>
    api.post<{ ok: boolean; deletedCount: number }>('/chat/clear', body),

  markRead: (body: { receiverId?: string; userId?: string }) =>
    api.post<{ ok: boolean }>('/chat/mark-read', body),
};

export const callApi = {
  bootstrap: (peerId: string, callId?: string) =>
    api.get<VoiceBootstrapResponse>('/calls/bootstrap', {
      params: { peerId, ...(callId ? { callId } : {}) },
    }),
  randomReceiver: () => api.get<RandomReceiverMatchResponse>('/calls/random-receiver'),
  sessionStart: (callId: string, peerId: string) =>
    api.post<{
      ok: boolean;
      talkStartedAt: string | null;
      talkActive: boolean;
      callRatePerMinute?: number;
      callerWalletBalanceInr?: number;
    }>('/calls/session/start', { callId, peerId }),
  sessionSync: (callId: string, opts?: { light?: boolean }) =>
    api.post<{
      ok: boolean;
      durationSec: number;
      settledAmountInr: number;
      receiverEarnedInr: number;
      canRate: boolean;
      status: string;
      talkStartedAt: string | null;
      talkActive: boolean;
      callRatePerMinute?: number;
      callerWalletBalanceInr?: number;
    }>('/calls/session/sync', { callId, ...(opts?.light ? { light: true } : {}) }),
  sessionEnd: (callId: string) =>
    api.post<{
      ok: boolean;
      durationSec: number;
      estimatedEarning: number;
      settledAmountInr: number;
      receiverEarnedInr: number;
      canRate: boolean;
      /** Present when the authenticated participant is the caller (`user`). */
      callerWalletBalanceInr?: number;
    }>(
      '/calls/session/end',
      { callId }
    ),
  sessionRate: (callId: string, rating: number) =>
    api.post<{ ok: boolean }>('/calls/session/rate', { callId, rating }),
  sessionReport: (callId: string, tags: string[]) =>
    api.post<{ ok: boolean }>('/calls/session/report', { callId, tags }),
};

export default api;