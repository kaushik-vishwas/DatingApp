/** Deterministic mock metrics for dashboard columns (no earnings/rating APIs yet). */

export function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(31, h) + id.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function pseudoMetrics(id: string) {
  const h = hashId(id);
  const callsToday = 10 + (h % 90);
  const earningsToday = ((h % 700) + 100) * 30;
  const totalEarnings = earningsToday * (4 + (h % 12));
  const rating = Math.round((4 + (h % 10) / 10) * 10) / 10;
  const online = h % 3 !== 0;
  return { callsToday, earningsToday, totalEarnings, rating, online };
}

export function formatINR(n: number): string {
  const safe = Number.isFinite(n) ? Math.max(0, n) : 0;
  return `₹${safe.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** Receiver passed voice verification (persisted flag, with legacy fallback for older rows). */
export function receiverVoiceVerificationSucceeded(receiver: {
  voiceVerificationApproved?: boolean;
  userAudio?: string | null;
  accountStatus: string;
}): boolean {
  if (receiver.voiceVerificationApproved) return true;
  const audio = String(receiver.userAudio ?? '').trim();
  return receiver.accountStatus === 'approved' && /^https?:\/\//i.test(audio);
}

export function receiverIsLiveAvailable(r: {
  isLiveAvailable?: boolean;
  isAvailable?: boolean;
  isOnline?: boolean;
}): boolean {
  if (typeof r.isLiveAvailable === 'boolean') return r.isLiveAvailable;
  return Boolean(r.isAvailable && r.isOnline);
}

export function receiverAvailabilityState(r: {
  isLiveAvailable?: boolean;
  isAvailable?: boolean;
  isOnline?: boolean;
  isBusyOnCall?: boolean;
}): 'online' | 'busy' | 'offline' {
  const live = receiverIsLiveAvailable(r);
  if (live && r.isBusyOnCall) return 'busy';
  if (live) return 'online';
  return 'offline';
}

export function receiverRatingDisplay(r: {
  accountStatus: string;
  ratingAvg?: number | null;
  ratingCount?: number;
}): string | null {
  if (r.accountStatus !== 'approved') return null;
  if (typeof r.ratingAvg === 'number' && Number.isFinite(r.ratingAvg)) {
    return String(r.ratingAvg);
  }
  return null;
}

export function receiverCode(index: number): string {
  return `R${String(index + 1).padStart(3, '0')}`;
}

export function kycCode(index: number): string {
  return `KYC${String(index + 1).padStart(3, '0')}`;
}
