import type { ReceiverCallerOnlineNotificationRow } from '../types/api';
import type { ReceiverNotificationRow } from '../types/receiverNotification';

export function callerOnlineNotificationToRow(
  row: ReceiverCallerOnlineNotificationRow
): ReceiverNotificationRow {
  const peerId = row.callerIds[0] ?? '';
  return {
    id: `caller-online-${row.id}`,
    title: row.title,
    subtitle: row.subtitle,
    at: row.at,
    type: 'call',
    peerId,
    peerName: row.callerName,
    peerImage: row.callerImage ?? null,
  };
}

/** Merge live `caller:online` socket events into notification list. */
export function upsertCallerOnlineNotification(
  prev: ReceiverNotificationRow[],
  payload: {
    id?: string;
    callerIds?: string[];
    callerName?: string;
    callerImage?: string | null;
    title?: string;
    subtitle?: string;
    at?: string;
  }
): ReceiverNotificationRow[] {
  const at =
    typeof payload?.at === 'string' && payload.at.trim()
      ? payload.at
      : new Date().toISOString();
  const callerIds = Array.isArray(payload?.callerIds)
    ? payload.callerIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  const peerId = callerIds[0] ?? '';
  const callerName =
    typeof payload?.callerName === 'string' && payload.callerName.trim()
      ? payload.callerName.trim()
      : 'Caller';
  const rowId =
    typeof payload?.id === 'string' && payload.id.trim()
      ? `caller-online-${payload.id.trim()}`
      : `caller-online-live-${peerId}-${Date.now()}`;

  const row: ReceiverNotificationRow = {
    id: rowId,
    title:
      typeof payload?.title === 'string' && payload.title.trim()
        ? payload.title.trim()
        : `${callerName} is online now`,
    subtitle:
      typeof payload?.subtitle === 'string' && payload.subtitle.trim()
        ? payload.subtitle.trim()
        : `Call ${callerName} while he is available.`,
    at,
    type: 'call',
    peerId,
    peerName: callerName,
    peerImage: payload?.callerImage ?? null,
  };

  return [row, ...prev.filter((r) => r.id !== rowId)];
}
