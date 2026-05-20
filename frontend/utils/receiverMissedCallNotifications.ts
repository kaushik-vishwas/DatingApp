import type { ReceiverIncompleteCallGroupRow, ReceiverMissedCallGroupRow } from '../types/api';
import type { ReceiverNotificationRow } from '../types/receiverNotification';
import { formatCallDurationCompact } from './callDurationDisplay';

export function missedCallGroupToNotificationRow(
  group: ReceiverMissedCallGroupRow
): ReceiverNotificationRow {
  const count = Math.max(1, group.missedCount);
  const label =
    count > 1
      ? `${group.callerName} • ${count} missed calls`
      : `${group.callerName} • not picked`;
  return {
    id: `missed-group-${group.callerId}`,
    title: count > 1 ? `${count} Missed Calls` : 'Missed Call',
    subtitle: label,
    at: group.lastAt,
    type: 'call',
    peerId: group.callerId,
    peerName: group.callerName,
    peerImage: group.callerImage ?? null,
  };
}

export function incompleteCallGroupToNotificationRow(
  group: ReceiverIncompleteCallGroupRow
): ReceiverNotificationRow {
  const count = Math.max(1, group.incompleteCount);
  const durLabel = formatCallDurationCompact(group.lastDurationSec);
  const label =
    count > 1
      ? `${group.callerName} • ${count} incomplete calls`
      : `${group.callerName} • incomplete · ${durLabel}`;
  return {
    id: `incomplete-group-${group.callerId}`,
    title: count > 1 ? `${count} Incomplete Calls` : 'Incomplete Call',
    subtitle: label,
    at: group.lastAt,
    type: 'call',
    peerId: group.callerId,
    peerName: group.callerName,
    peerImage: group.callerImage ?? null,
  };
}

/** Merge live `call:missed` events (ring-only) into one row per caller. */
export function upsertMissedCallNotification(
  prev: ReceiverNotificationRow[],
  payload: {
    callerId: string;
    callerName: string;
    callerImage?: string | null;
    at: string;
  }
): ReceiverNotificationRow[] {
  const peerId = payload.callerId.trim();
  if (!peerId) return prev;

  const groupId = `missed-group-${peerId}`;
  const existing = prev.find((r) => r.id === groupId && r.type === 'call');
  const at = payload.at;

  if (existing) {
    const match = existing.subtitle.match(/(\d+)\s+missed calls/);
    const prevCount = match ? Math.max(1, parseInt(match[1], 10)) : 1;
    const nextCount = prevCount + 1;
    const updated: ReceiverNotificationRow = {
      ...existing,
      title: nextCount > 1 ? `${nextCount} Missed Calls` : 'Missed Call',
      subtitle: `${payload.callerName} • ${nextCount} missed calls`,
      at: new Date(at) > new Date(existing.at) ? at : existing.at,
      peerName: payload.callerName,
      peerImage: payload.callerImage ?? existing.peerImage ?? null,
    };
    return [updated, ...prev.filter((r) => r.id !== groupId)];
  }

  const row: ReceiverNotificationRow = {
    id: groupId,
    title: 'Missed Call',
    subtitle: `${payload.callerName} • not picked`,
    at,
    type: 'call',
    peerId,
    peerName: payload.callerName,
    peerImage: payload.callerImage ?? null,
  };
  return [row, ...prev];
}
