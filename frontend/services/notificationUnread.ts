import AsyncStorage from '@react-native-async-storage/async-storage';

type NotificationAudience = 'caller' | 'receiver';

const LAST_SEEN_KEY_BY_AUDIENCE: Record<NotificationAudience, string> = {
  caller: 'notif:lastSeen:caller',
  receiver: 'notif:lastSeen:receiver',
};

export async function getNotificationLastSeenAt(audience: NotificationAudience): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(LAST_SEEN_KEY_BY_AUDIENCE[audience]);
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export async function markNotificationsSeenNow(audience: NotificationAudience): Promise<number> {
  const now = Date.now();
  try {
    await AsyncStorage.setItem(LAST_SEEN_KEY_BY_AUDIENCE[audience], String(now));
  } catch {
    // Ignore local persistence failures; UI still proceeds.
  }
  return now;
}

export function countUnreadByTimestamp(
  rows: Array<{ at: string }>,
  lastSeenAtMs: number
): number {
  return rows.reduce((sum, row) => {
    const t = new Date(row.at).getTime();
    return Number.isFinite(t) && t > lastSeenAtMs ? sum + 1 : sum;
  }, 0);
}

