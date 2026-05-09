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
  RazorpayOrderResponse,
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
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  const normalized = normalizeApiOrigin(raw);
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
    return normalized;
  } catch {
    // Broken app/env config should not brick networking; fall back to auto/prod selection.
    return undefined;
  }
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

  const path = typeof config.url === 'string' ? config.url : '';
  const full = `${base.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;
  if (__DEV__) {
    console.log(`[API] ${String(config.method).toUpperCase()} → ${full}`);
  } else if (path === '/profile/complete') {
    console.warn(`[API] POST /profile/complete → ${full}`);
  }

  const token = await AsyncStorage.getItem(JWT_KEY);
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as any).Authorization = `Bearer ${token}`;
  }

  return config;
});

type ApiErrBody = {
  message?: unknown;
  error?: unknown;
  errorCode?: unknown;
  traceId?: unknown;
};

/** Error handler */
export const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const err = error as AxiosError<ApiErrBody>;
    const data = err.response?.data;
    const msg = data?.message;
    const namedError = data?.error;
    const errorCode = data?.errorCode;
    const traceSuffix =
      typeof data?.traceId === 'string' && data.traceId.trim()
        ? ` (support ref: traceId=${data.traceId.trim()})`
        : '';

    if (typeof msg === 'string' && msg.trim()) return `${msg.trim()}${traceSuffix}`;
    if (typeof errorCode === 'string' && errorCode.trim()) return `${errorCode.trim()}${traceSuffix}`;
    if (typeof namedError === 'string' && namedError.trim()) return `${namedError.trim()}${traceSuffix}`;
    if (Array.isArray(msg)) return `${msg.join(', ')}${traceSuffix}`;
    if (!err.response) {
      const code = typeof err.code === 'string' && err.code ? err.code : 'NO_TRANSPORT_CODE';
      return `NETWORK_OR_TRANSPORT_FAILED (code=${code}, ${err.message || 'unknown'})`;
    }

    const fallback = err.message || `HTTP_${err.response.status}_REQUEST_FAILED`;
    return `${fallback}${traceSuffix}`;
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
  login: (email: string, password: string, accountType: AuthAccountType) =>
    api.post<LoginResponse>('/auth/login', { email, password, accountType }),

  sendOtp: (email: string, accountType: AuthAccountType) =>
    api.post<SendOtpResponse>('/auth/send-otp', { email, accountType }),

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

  verifyOtp: (email: string, otp: string, accountType: AuthAccountType) =>
    api.post<VerifyOtpResponse>('/auth/verify-otp', { email, otp, accountType }),

  register: (payload: RegisterPayload) =>
    api.post<RegisterResponse>('/auth/register', payload),

  me: () => api.get<MeResponse>('/auth/me'),
};

export const profileApi = {
  complete: async (payload: CompleteProfilePayload) => {
    const resolvedBase = getResolvedApiBaseUrl();
    const endpoint = `${resolvedBase.replace(/\/+$/, '')}/profile/complete`;
    try {
      return await api.post<CompleteProfileResponse>('/profile/complete', payload, { timeout: 90_000 });
    } catch (e: unknown) {
      const ax = axios.isAxiosError(e) ? (e as AxiosError<ApiErrBody>) : null;
      if (ax) {
        const h = ax.response?.headers ?? {};
        const traceHeader =
          (typeof h['x-complete-profile-trace-id'] === 'string' && h['x-complete-profile-trace-id']) ||
          (typeof h['X-Complete-Profile-Trace-Id'] === 'string' && h['X-Complete-Profile-Trace-Id']) ||
          (typeof h['x-api-trace-id'] === 'string' && h['x-api-trace-id']) ||
          (typeof h['X-Api-Trace-Id'] === 'string' && h['X-Api-Trace-Id']) ||
          undefined;
        const bodyTrace =
          typeof ax.response?.data === 'object' &&
          ax.response?.data !== null &&
          typeof (ax.response.data as ApiErrBody).traceId === 'string'
            ? (ax.response.data as ApiErrBody).traceId
            : undefined;
        console.error(
          '[profile/complete]',
          JSON.stringify({
            endpoint,
            method: 'POST',
            timeoutMs: 90_000,
            axiosCode: ax.code ?? null,
            axiosMessage: ax.message,
            httpStatus: ax.response?.status ?? null,
            traceHeader: traceHeader ?? null,
            bodyTraceId: bodyTrace ?? null,
            responseBody: ax.response?.data ?? null,
          })
        );
      } else {
        console.error('[profile/complete]', JSON.stringify({ endpoint, error: String(e) }));
      }
      throw e;
    }
  },

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
    }>(
      '/calls/session/end',
      { callId }
    ),
  sessionRate: (callId: string, rating: number) =>
    api.post<{ ok: boolean }>('/calls/session/rate', { callId, rating }),
};

export default api;