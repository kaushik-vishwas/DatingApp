import { useNavigationState } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';

import type { CallerTabParamList } from '../navigation/CallerTabParamList';
import { profileApi } from '../services/api';
import {
  countUnreadByTimestamp,
  getNotificationLastSeenAt,
  markNotificationsSeenNow,
} from '../services/notificationUnread';

export function useCallerAlertsTabBadge(): {
  badge: number | string | undefined;
  clearBadge: () => void;
} {
  const tabRouteName = useNavigationState((state) => {
    const route = state?.routes[state?.index ?? 0];
    return route?.name as keyof CallerTabParamList | undefined;
  });
  const [notificationUnread, setNotificationUnread] = useState(0);

  const clearBadge = useCallback(() => {
    void markNotificationsSeenNow('caller').then(() => setNotificationUnread(0));
  }, []);

  const refresh = useCallback(async () => {
    try {
      if (tabRouteName === 'CallerAlerts') {
        clearBadge();
        return;
      }
      const [lastSeenAt, { data }] = await Promise.all([
        getNotificationLastSeenAt('caller'),
        profileApi.callerNotifications(),
      ]);
      setNotificationUnread(countUnreadByTimestamp(data.notifications, lastSeenAt));
    } catch {
      // Keep prior badge on transient failures.
    }
  }, [tabRouteName, clearBadge]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const badge =
    notificationUnread <= 0 ? undefined : notificationUnread > 99 ? '99+' : notificationUnread;

  return { badge, clearBadge };
}
