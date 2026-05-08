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
  // Use IPv4 loopback in dev. On some Windows setups `localhost` resolves to `::1`
  // and can hit a different local process than the backend bound on 0.0.0.0:5000.
  return normalizeApiOrigin('http://127.0.0.1:5000');
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
  isVerified: boolean;
  role: string;
  accountStatus: string;
  profileImage: string | null;
  aadhaarFront?: string | null;
  aadhaarBack?: string | null;
  aadhaarNumber?: string | null;
  panNumber?: string | null;
  panFront?: string | null;
  documents?: string[];
  createdAt: string;
  updatedAt: string;
  audioCallRate?: number | null;
  userAudio?: string | null;
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

/** ================= SETTINGS ================= */

export type AdminRole = 'super_admin' | 'support_admin' | 'finance_admin';

export type AdminSettingsResponse = {
  notificationControls: {
    kycSubmissionsEmail: boolean;
    pendingWithdrawalsEmail: boolean;
    dailyRevenueSummaryEmail: boolean;
  };
  rolesCatalog: Array<{ id: AdminRole; label: string; description: string }>;
  admins: Array<{
    _id: string;
    name: string;
    email: string;
    role: AdminRole;
    status: 'active';
    createdAt: string;
  }>;
};

export async function fetchAdminSettings() {
  const { data } = await api.get<AdminSettingsResponse>('/admin/settings');
  return data;
}

export async function updateAdminSettingsNotifications(payload: {
  kycSubmissionsEmail: boolean;
  pendingWithdrawalsEmail: boolean;
  dailyRevenueSummaryEmail: boolean;
}) {
  const { data } = await api.patch<{
    ok: boolean;
    notificationControls: AdminSettingsResponse['notificationControls'];
  }>('/admin/settings/notifications', payload);
  return data;
}

export async function updateAdminRole(adminId: string, role: AdminRole) {
  const { data } = await api.patch<{
    ok: boolean;
    admin: { _id: string; name: string; email: string; role: AdminRole; status: 'active' };
  }>(`/admin/settings/admins/${adminId}/role`, { role });
  return data;
}

/** ================= OVERVIEW ================= */

export type OverviewDashboardResponse = {
  cards: {
    totalRevenue: number;
    totalCalls: number;
    activeReceivers: number;
    activeUsers: number;
  };
  trend: Array<{ label: string; amount: number }>;
  actionRequired: {
    pendingKycApprovals: number;
    pendingWithdrawals: number;
    flaggedReports: number;
  };
};

export async function fetchOverviewDashboard(params?: { range?: '7d' | '30d' | 'all' }) {
  const { data } = await api.get<OverviewDashboardResponse>('/admin/overview', {
    params: { range: params?.range ?? '7d' },
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

export async function rejectReceiver(receiverId: string, reason: string) {
  const { data } = await api.patch<{ receiver: ReceiverRecord }>(
    `/admin/receivers/${receiverId}/reject`,
    { reason }
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

/** ================= REVENUE ================= */

export type RevenueDashboardResponse = {
  cards: {
    grossRevenue: number;
    platformCommission: number;
    netPayout: number;
    platformProfit: number;
  };
  dailyBreakdown: Array<{
    date: string;
    callsRevenue: number;
    commission: number;
    payout: number;
  }>;
  topEarners: Array<{
    receiverId: string;
    name: string;
    calls: number;
    earnings: number;
    payout: number;
  }>;
};

export async function fetchRevenueDashboard(params?: { range?: '7d' | '30d' | 'all' }) {
  const { data } = await api.get<RevenueDashboardResponse>('/admin/revenue', {
    params: { range: params?.range ?? '7d' },
  });
  return data;
}

/** ================= WITHDRAWALS ================= */

export type AdminWithdrawalStatus = 'pending' | 'approved' | 'rejected';

export type AdminWithdrawalRow = {
  _id: string;
  withdrawalId: string;
  receiverName: string;
  amount: number;
  bankName: string;
  accountMasked: string;
  createdAt: string;
  status: AdminWithdrawalStatus;
  payoutStatus?: 'processing' | 'success' | 'failed';
  payoutUtr?: string | null;
};

export type AdminWithdrawalStats = {
  pendingCount: number;
  pendingAmount: number;
  approvedTodayCount: number;
  approvedTodayAmount: number;
  rejectedTodayCount: number;
  rejectedTodayAmount: number;
  processedCount: number;
  processedTodayAmount: number;
};

export async function fetchWithdrawals(params?: {
  q?: string;
  range?: '7d' | '30d' | 'all';
  status?: 'all' | 'pending' | 'approved' | 'rejected';
  page?: number;
}) {
  const { data } = await api.get<{
    stats: AdminWithdrawalStats;
    rows: AdminWithdrawalRow[];
    total: number;
    page: number;
    limit: number;
  }>('/admin/withdrawals', {
    params: {
      q: params?.q?.trim() || undefined,
      range: params?.range ?? '7d',
      status: params?.status ?? 'all',
      page: params?.page ?? 1,
    },
  });
  return data;
}

export async function resolveWithdrawal(withdrawalId: string, action: 'approve' | 'reject') {
  const { data } = await api.patch<{ ok: boolean }>(`/admin/withdrawals/${withdrawalId}`, { action });
  return data;
}