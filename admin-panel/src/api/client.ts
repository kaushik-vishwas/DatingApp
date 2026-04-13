import axios, { AxiosHeaders } from 'axios';

/** 🔥 PRODUCTION SERVER (EC2 + NGINX) */
const PROD_API = 'http://43.205.217.58';

/** Normalize URL */
function normalizeUrl(url: string) {
  return url.trim().replace(/\/+$/, '');
}

/** Detect base URL */
function getBaseURL(): string {
  // 1️⃣ ENV (highest priority - Vite)
  const fromEnv = import.meta.env.VITE_API_URL;
  if (fromEnv && typeof fromEnv === 'string') {
    return normalizeUrl(fromEnv);
  }

  // 2️⃣ Production (when built)
  if (import.meta.env.PROD) {
    return PROD_API;
  }

  // 3️⃣ Local dev
  return 'http://localhost:5000';
}

/** Axios instance */
export const api = axios.create({
  baseURL: getBaseURL(),
  headers: { 'Content-Type': 'application/json' },
});

/** Attach admin token */
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminToken');
  if (token) {
    const headers = AxiosHeaders.from(config.headers);
    headers.set('Authorization', `Bearer ${token}`);
    config.headers = headers;
  }

  // Debug log (only in dev)
  if (import.meta.env.DEV) {
    console.log(`[ADMIN API] ${config.method?.toUpperCase()} → ${config.baseURL}${config.url}`);
  }

  return config;
});

/** ================= TYPES ================= */

export type ReceiverRecord = {
  _id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  accountStatus: string;
  profileImage: string | null;
  aadhaarFront?: string | null;
  aadhaarBack?: string | null;
  createdAt: string;
  updatedAt: string;
  audioCallRate?: number | null;
};

export type AppUserStatusTab = 'all' | 'active' | 'suspended';
export type AppUserRange = '7d' | '30d' | 'all';

export type AppUserRecord = {
  _id: string;
  name: string;
  email: string;
  phone: string;
  isVerified: boolean;
  role: string;
  accountStatus: string;
  profileImage: string | null;
  suspended: boolean;
  walletBalance: number;
  createdAt: string;
  updatedAt: string;
};

/** ================= AUTH ================= */

export async function adminLogin(email: string, password: string) {
  const { data } = await api.post<{
    token: string;
    admin: { _id: string; email: string; name: string; role: string };
  }>('/admin/auth/login', { email, password });

  return data;
}

export async function adminForgotPassword(email: string) {
  const { data } = await api.post<{ message: string; emailSent: boolean }>(
    '/admin/auth/forgot-password',
    { email }
  );
  return data;
}

export async function adminResetPassword(
  otp: string,
  newPassword: string,
  confirmPassword: string
) {
  const { data } = await api.post<{
    message: string;
    token: string;
    admin: { _id: string; email: string; name: string; role: string };
  }>('/admin/auth/reset-password', {
    otp,
    newPassword,
    confirmPassword,
  });

  return data;
}

/** ================= RECEIVERS ================= */

export async function fetchAllReceivers() {
  const { data } = await api.get<{ receivers: ReceiverRecord[] }>(
    '/admin/receivers'
  );
  return data.receivers;
}

export async function fetchKycStats() {
  const { data } = await api.get<{
    pendingApprovals: number;
    approvedToday: number;
    rejectedToday: number;
  }>('/admin/kyc/stats');

  return data;
}

export async function approveReceiver(receiverId: string) {
  const { data } = await api.patch<{ receiver: ReceiverRecord }>(
    `/admin/receivers/${receiverId}/approve`
  );
  return data;
}

export async function rejectReceiver(receiverId: string) {
  const { data } = await api.patch<{ receiver: ReceiverRecord }>(
    `/admin/receivers/${receiverId}/reject`
  );
  return data;
}

/** ================= USERS ================= */

export async function fetchAppUsers(params: {
  status: AppUserStatusTab;
  q?: string;
  range: AppUserRange;
  page: number;
  limit?: number;
}) {
  const { data } = await api.get<{
    users: AppUserRecord[];
    total: number;
    page: number;
    limit: number;
    tabCounts: { all: number; active: number; suspended: number };
  }>('/admin/users', {
    params: {
      status: params.status,
      q: params.q?.trim() || undefined,
      range: params.range,
      page: params.page,
      limit: params.limit ?? 20,
    },
  });

  return data;
}

export async function updateAppUserSuspension(
  userId: string,
  suspended: boolean
) {
  const { data } = await api.patch<{ user: AppUserRecord }>(
    `/admin/users/${userId}`,
    { suspended }
  );
  return data;
}