import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

export const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/** Receiver row from `/admin/receivers` (matches backend `toApiReceiver` / `SafeUser` JSON). */
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

export async function adminLogin(email: string, password: string) {
  const { data } = await api.post<{ token: string; admin: { _id: string; email: string; name: string; role: string } }>(
    '/admin/auth/login',
    { email, password }
  );
  return data;
}

export async function adminForgotPassword(email: string) {
  const { data } = await api.post<{ message: string; emailSent: boolean }>('/admin/auth/forgot-password', { email });
  return data;
}

export async function adminResetPassword(otp: string, newPassword: string, confirmPassword: string) {
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

export async function fetchAllReceivers() {
  const { data } = await api.get<{ receivers: ReceiverRecord[] }>('/admin/receivers');
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
  const { data } = await api.patch<{ receiver: ReceiverRecord }>(`/admin/receivers/${receiverId}/approve`);
  return data;
}

export async function rejectReceiver(receiverId: string) {
  const { data } = await api.patch<{ receiver: ReceiverRecord }>(`/admin/receivers/${receiverId}/reject`);
  return data;
}

export type AppUserStatusTab = 'all' | 'active' | 'suspended';
export type AppUserRange = '7d' | '30d' | 'all';

/** App user row from `/admin/users` (caller / `users` collection). */
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

export async function updateAppUserSuspension(userId: string, suspended: boolean) {
  const { data } = await api.patch<{ user: AppUserRecord }>(`/admin/users/${userId}`, { suspended });
  return data;
}
