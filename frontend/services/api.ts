import axios, { AxiosError } from 'axios';
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

type AxiosConfigWithFetchFlag = {
  __fetchRetried?: boolean;
  baseURL?: string;
  url?: string;
  method?: string;
  data?: unknown;
  headers?: Record<string, unknown>;
  timeout?: number;
  params?: Record<string, unknown>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildAbsoluteUrl(baseURL: string | undefined, url: string | undefined): string {
  const path = typeof url === 'string' ? url : '';
  if (/^https?:\/\//i.test(path)) return path;
  const base = (baseURL || getBaseURL()).replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

function appendQueryParams(absoluteUrl: string, params: unknown): string {
  if (!params || typeof params !== 'object') return absoluteUrl;
  const entries = Object.entries(params as Record<string, unknown>).filter(
    ([, v]) => v !== undefined && v !== null
  );
  if (!entries.length) return absoluteUrl;
  const qs = entries
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return absoluteUrl.includes('?') ? `${absoluteUrl}&${qs}` : `${absoluteUrl}?${qs}`;
}

function isTransportFailureMessage(message: string | undefined, code?: string): boolean {
  const c = String(code || '');
  if (c === 'ERR_NETWORK' || c === 'ECONNABORTED') return true;
  return /network error|network request failed|failed to fetch|aborted/i.test(message || '');
}

/** RN Headers.entries() is missing on some Android builds — never assume it exists. */
function responseHeadersToObject(headers: Headers | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  try {
    if (typeof (headers as Headers & { entries?: () => IterableIterator<[string, string]> }).entries === 'function') {
      for (const [k, v] of (headers as Headers).entries()) {
        out[k] = v;
      }
      return out;
    }
  } catch {
    // fall through
  }
  try {
    if (typeof headers.forEach === 'function') {
      headers.forEach((v, k) => {
        out[k] = v;
      });
    }
  } catch {
    // ignore
  }
  return out;
}

/**
 * Fallback transport via RN fetch when Axios→XHR→OkHttp fails (some OEMs / builds).
 * Must not throw on successful responses — that was mis-reported as "network failed".
 */
async function axiosConfigViaFetch(config: AxiosConfigWithFetchFlag) {
  const method = String(config.method || 'get').toUpperCase();
  // Axios usually already serializes params into config.url before the adapter/interceptor.
  // Only append if the URL still has no query and params remain.
  const baseUrl = buildAbsoluteUrl(config.baseURL, config.url);
  const absoluteUrl =
    baseUrl.includes('?') || !config.params ? baseUrl : appendQueryParams(baseUrl, config.params);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const rawHeaders = config.headers as {
    get?: (name: string) => unknown;
    Authorization?: string;
    authorization?: string;
  } | undefined;
  let auth: unknown =
    rawHeaders && typeof rawHeaders.get === 'function'
      ? rawHeaders.get('Authorization')
      : rawHeaders?.Authorization || rawHeaders?.authorization;
  if (typeof auth === 'string' && auth) {
    headers.Authorization = auth;
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutMs = typeof config.timeout === 'number' ? config.timeout : 20000;
  const timer =
    controller && timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

  let body: string | undefined;
  if (config.data != null && method !== 'GET' && method !== 'HEAD') {
    body = typeof config.data === 'string' ? config.data : JSON.stringify(config.data);
  }

  try {
    const res = await fetch(absoluteUrl, {
      method,
      headers,
      body,
      signal: controller?.signal,
    });
    const text = await res.text();
    let data: unknown = text;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    } else {
      data = null;
    }

    const axiosLike = {
      data,
      status: res.status,
      statusText: res.statusText,
      headers: responseHeadersToObject(res.headers),
      config,
      request: {},
    };

    if (!res.ok) {
      const err = new AxiosError(
        `Request failed with status code ${res.status}`,
        String(res.status),
        config as any,
        {},
        axiosLike as any
      );
      return Promise.reject(err);
    }
    return axiosLike;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (isTransportFailureMessage(message) || /aborted/i.test(message)) {
      throw new AxiosError(
        message || 'Network Error',
        /aborted|timeout/i.test(message) ? 'ECONNABORTED' : 'ERR_NETWORK',
        config as any
      );
    }
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Retry fetch a few times — covers cold-start radio and brief transport blips. */
async function fetchWithTransportRetries(config: AxiosConfigWithFetchFlag) {
  const delaysMs = Platform.OS === 'android' ? [0, 350, 900] : [0, 500];
  let lastErr: unknown;
  for (const delay of delaysMs) {
    if (delay > 0) await sleep(delay);
    try {
      return await axiosConfigViaFetch(config);
    } catch (e) {
      lastErr = e;
      if (axios.isAxiosError(e) && e.response) {
        throw e;
      }
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new AxiosError('Network Error', 'ERR_NETWORK', config as any);
}

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

/**
 * Keep Axios as primary (same as builds that worked).
 * Only on pure transport failure, retry via fetch with backoff.
 */
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const cfg = error.config as AxiosConfigWithFetchFlag | undefined;
    if (!cfg || cfg.__fetchRetried || error.response) {
      return Promise.reject(error);
    }
    if (!isTransportFailureMessage(error.message, error.code)) {
      return Promise.reject(error);
    }
    cfg.__fetchRetried = true;
    try {
      return await fetchWithTransportRetries(cfg);
    } catch (fetchErr) {
      return Promise.reject(fetchErr);
    }
  }
);

/** Error handler */
export const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const err = error as AxiosError<{ message?: unknown; responseCode?: unknown }>;
    const data = err.response?.data;
    const msg = data?.message;

    if (typeof msg === 'string' && msg.trim()) return msg;
    if (Array.isArray(msg)) return msg.join(', ');

    const code = data?.responseCode;
    if (typeof code === 'number' || (typeof code === 'string' && code)) {
      const map: Record<string, string> = {
        '702': 'Wrong OTP. Please try again.',
        '705': 'OTP expired. Request a new code.',
        '800': 'Maximum OTP attempts reached. Try again later.',
        '409': 'A verification request already exists. Wait and try again.',
        '506': 'Request already exists. Wait before requesting another OTP.',
        '505': 'Invalid or expired verification. Request a new OTP.',
      };
      const mapped = map[String(code)];
      if (mapped) return mapped;
    }

    if (!err.response) {
      const errCode = String(err.code || '');
      if (errCode === 'ECONNABORTED' || /timeout|aborted/i.test(err.message || '')) {
        return 'Connection timed out. Please check your internet and try again.';
      }
      // OEM / DNS / cold-start transport failures — not necessarily "backend down".
      return 'Could not reach the server. Please check your internet connection and try again.';
    }

    return err.message || 'Request failed';
  }

  if (error instanceof Error) {
    if (isTransportFailureMessage(error.message)) {
      return 'Could not reach the server. Please check your internet connection and try again.';
    }
    return error.message;
  }
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

  updateReceiverPushTokens: (payload: { expoPushToken?: string; fcmDeviceToken?: string }) =>
    api.patch<{ ok: boolean }>('/profile/receiver/push-token', payload),

  updateCallerExpoPushToken: (expoPushToken: string) =>
    api.patch<{ ok: boolean }>('/profile/caller/push-token', { expoPushToken }),

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
  incomingPending: () =>
    api.get<{
      incoming: {
        callId: string;
        fromId: string;
        fromType: 'u' | 'r';
        fromName: string;
        fromImage: string | null;
        expiresAt: string;
      } | null;
    }>('/calls/incoming-pending'),
};

export default api;