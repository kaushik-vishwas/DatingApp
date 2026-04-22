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
} from '../types/api';

const JWT_KEY = 'jwt';

/** Production API (release builds and dev fallback when Metro tunnel cannot reach your PC). */
const PROD_API = 'https://backend.nesthamapp.com';

/** Normalize URL */
function normalizeApiOrigin(raw: string): string {
  let u = raw.trim().replace(/\/+$/, '');
  if (u.endsWith('/auth')) {
    u = u.slice(0, -5).replace(/\/+$/, '');
  }
  return u;
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
  if (!__DEV__) {
    return normalizeApiOrigin(PROD_API);
  }

  const devUrl = getDevApiBase();
  if (devUrl) {
    return normalizeApiOrigin(devUrl);
  }

  const c = Constants as any;
  const hostUri: string | undefined = c.expoConfig?.hostUri || c.manifest?.debuggerHost;
  const onTunnel = Boolean(hostUri?.includes('exp.direct'));
  if (onTunnel) {
    return normalizeApiOrigin(PROD_API);
  }

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
};

export default api;