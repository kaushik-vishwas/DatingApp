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
  VoiceBootstrapResponse,
  RandomReceiverMatchResponse,
  SendWithdrawalOtpResponse,
  VerifyWithdrawalOtpResponse,
  CallerCallHistoryResponse,
  CallerAppReviewMeResponse,
  CallerNotificationsResponse,
  ReceiverEarningsBreakdownResponse,
  ReceiverNotifyCandidatesResponse,
  ReceiverNotifyUserResponse,
} from '../types/api';

const JWT_KEY = 'jwt';

/** Production API (release builds and dev fallback when Metro tunnel cannot reach your PC). */
const PROD_API = 'https://backend.nesthamapp.com';
const PROD_ORIGIN = normalizeApiOrigin(PROD_API);

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
    return 'http://10.0.2.2:5000';
  }

  // Expo tunnel only proxies Metro; your :5000 backend is not on the phone — use prod until you use LAN/USB.
  if (host.endsWith('.exp.direct')) {
    return undefined;
  }

  if (host === 'localhost' || host === '127.0.0.1') {
    return Platform.OS === 'android'
      ? 'http://10.0.2.2:5000'
      : 'http://127.0.0.1:5000';
  }

  return `http://${host}:5000`;
}

const getBaseURL = (): string => {
  const configured = getConfiguredApiBase();
  if (!__DEV__) return configured || PROD_ORIGIN;

  // In dev, honor explicit non-prod override first (e.g. custom staging/local URL in .env).
  if (configured && configured !== PROD_ORIGIN) {
    return configured;
  }

  // Prefer local backend automatically on LAN/emulator when reachable by host metadata.
  const devUrl = getDevApiBase();
  if (devUrl) return normalizeApiOrigin(devUrl);

  const c = Constants as any;
  const hostUri: string | undefined = c.expoConfig?.hostUri || c.manifest?.debuggerHost;
  const onTunnel = Boolean(hostUri?.includes('exp.direct'));
  if (onTunnel) return PROD_ORIGIN;

  // Last-resort local fallback for simulators/emulators.
  return normalizeApiOrigin(
    Platform.OS === 'android' ? 'http://10.0.2.2:5000' : 'http://127.0.0.1:5000'
  );
};

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

  forgotPassword: (email: string, accountType: AuthAccountType) =>
    api.post<SendOtpResponse>('/auth/forgot-password', { email, accountType }),

  resetPassword: (
    email: string,
    otp: string,
    newPassword: string,
    accountType: AuthAccountType
  ) =>
    api.post<LoginResponse>('/auth/reset-password', {
      email,
      otp,
      newPassword,
      accountType,
    }),

  verifyOtp: (phone: string, otp: string, accountType: AuthAccountType) =>
    api.post<VerifyOtpResponse>('/auth/verify-otp', { phone, otp, accountType }),

  register: (payload: RegisterPayload) =>
    api.post<RegisterResponse>('/auth/register', payload),

  me: () => api.get<MeResponse>('/auth/me'),
};

export const profileApi = {
  complete: (payload: CompleteProfilePayload) =>
    api.post<CompleteProfileResponse>('/profile/complete', payload),

  saveCallerUserAudio: (payload: SaveCallerUserAudioPayload) =>
    api.patch<SaveCallerUserAudioResponse>('/profile/caller-audio', payload),

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

  updateReceiverProfile: (payload: UpdateReceiverProfilePayload) =>
    api.patch<CompleteProfileResponse>('/profile/receiver', payload),

  deleteReceiverAccount: (payload?: DeleteReceiverAccountPayload) =>
    api.delete<{ message: string }>('/profile/receiver', { data: payload ?? {} }),

  callerCallHistory: (range: 'all' | 'week' | 'month' = 'all') =>
    api.get<CallerCallHistoryResponse>('/profile/caller-call-history', {
      params: { range },
    }),

  getCallerAppReview: () =>
    api.get<CallerAppReviewMeResponse>('/profile/caller-app-review'),

  putCallerAppReview: (body: { stars: number; review: string }) =>
    api.put<{ ok: boolean }>('/profile/caller-app-review', body),

  callerNotifications: () =>
    api.get<CallerNotificationsResponse>('/profile/caller-notifications'),

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

  credit: (body: { payAmount: number; bonusPercent: number }) =>
    api.post<WalletCreditResponse>('/wallet/credit', body),

  createRazorpayOrder: (body: { payAmount: number; bonusPercent: number }) =>
    api.post<RazorpayOrderResponse>('/wallet/razorpay-order', body),

  verifyRazorpayPayment: (body: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
    payAmount: number;
    bonusPercent: number;
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
    api.post<{ ok: boolean }>('/calls/session/start', { callId, peerId }),
  sessionSync: (callId: string) =>
    api.post<{
      ok: boolean;
      durationSec: number;
      settledAmountInr: number;
      receiverEarnedInr: number;
      canRate: boolean;
      status: string;
    }>(
      '/calls/session/sync',
      { callId }
    ),
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