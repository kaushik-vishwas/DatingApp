import axios, { AxiosHeaders } from 'axios';

/** Production API (Vite production build). */
const PROD_API = 'https://backend.nesthamapp.com';

function normalizeApiOrigin(raw: string): string {
  let u = raw.trim().replace(/\/+$/, '');
  if (u.endsWith('/auth')) {
    u = u.slice(0, -5).replace(/\/+$/, '');
  }
  return u;
}

/** Local in dev (`npm run dev`); live URL only when built for production. */
function getBaseURL(): string {
  if (import.meta.env.PROD) {
    return normalizeApiOrigin(PROD_API);
  }
  return normalizeApiOrigin('http://localhost:5000');
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
  userAudio?: string | null;
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
    pendingCallerApprovals: number;
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

export async function approveAppUser(userId: string) {
  const { data } = await api.patch<{ user: AppUserRecord }>(`/admin/users/${userId}/approve`);
  return data;
}

export async function rejectAppUser(userId: string) {
  const { data } = await api.patch<{ user: AppUserRecord }>(`/admin/users/${userId}/reject`);
  return data;
}

/** ================= REPORTS ================= */

export type ModerationReportRow = {
  _id: string;
  reportId: string;
  reporterName: string;
  reportedName: string;
  reason: string;
  preview: string;
  createdAt: string;
  status: string;
  resolution: string | null;
};

export type ModerationReportStats = {
  pendingReports: number;
  resolvedToday: number;
  usersWarned: number;
  usersSuspended: number;
};

export async function fetchModerationReports(params?: { q?: string; status?: string; page?: number }) {
  const { data } = await api.get<{
    stats: ModerationReportStats;
    reports: ModerationReportRow[];
    total: number;
    page: number;
    limit: number;
  }>('/admin/reports', {
    params: {
      q: params?.q?.trim() || undefined,
      status: params?.status && params.status !== 'all' ? params.status : undefined,
      page: params?.page ?? 1,
    },
  });
  return data;
}

export async function resolveModerationReport(
  reportId: string,
  action: 'ignore' | 'warn' | 'suspend'
) {
  const { data } = await api.patch<{ ok: boolean }>(`/admin/reports/${reportId}`, { action });
  return data;
}