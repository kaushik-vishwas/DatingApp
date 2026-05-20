import { formatCallDurationCompact } from './callDurationDisplay';

/** Align with backend `MISSED_OR_INCOMPLETE_MAX_SEC`. */
export const CALL_INCOMPLETE_MAX_SEC = 55;

export type CallerCallDisplayStatus = 'completed' | 'missed' | 'incomplete';

export function callerCallStatusFromDuration(durationSec: number): CallerCallDisplayStatus {
  const d = Math.max(0, Math.floor(Number(durationSec) || 0));
  if (d <= 0) return 'missed';
  if (d < CALL_INCOMPLETE_MAX_SEC) return 'incomplete';
  return 'completed';
}

export function callerCallStatusLabel(status: CallerCallDisplayStatus): string {
  if (status === 'missed') return 'Missed';
  if (status === 'incomplete') return 'Incomplete';
  return 'Completed';
}

export function callerCallMetaLine(durationSec: number, status: CallerCallDisplayStatus): string {
  if (status === 'missed') return 'Not connected';
  if (status === 'incomplete') {
    return `${formatCallDurationCompact(durationSec)} • Incomplete`;
  }
  return `${formatCallDurationCompact(durationSec)} • Completed`;
}

export function callerCallNotificationSubtitle(durationSec: number): string {
  const d = Math.max(0, Math.floor(Number(durationSec) || 0));
  if (d <= 0) return 'Missed call · not connected';
  if (d < CALL_INCOMPLETE_MAX_SEC) {
    return `Incomplete call · ${formatCallDurationCompact(d)}`;
  }
  const mins = Math.max(1, Math.round(d / 60));
  return `Completed · ${mins} min`;
}
