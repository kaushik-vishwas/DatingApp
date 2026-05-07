import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CallerStackParamList } from '../../navigation/CallerStackParamList';
import { profileApi } from '../../services/api';
import {
  countUnreadByTimestamp,
  getNotificationLastSeenAt,
  markNotificationsSeenNow,
} from '../../services/notificationUnread';

const PURPLE = '#7b2cff';
export const CALLER_TAB_BAR_HEIGHT = 62;
const TAB_BAR_BOTTOM_COVER = 0;
export const getCallerTabBarContentPadding = (bottomInset: number): number =>
  CALLER_TAB_BAR_HEIGHT + Math.max(bottomInset, 0) + TAB_BAR_BOTTOM_COVER;

export type CallerTabId = 'home' | 'calls' | 'alerts' | 'profile';

/** Stack navigator handle (any active screen) for shared tab bar. */
export type CallerTabBarNavigation = NativeStackNavigationProp<
  CallerStackParamList,
  keyof CallerStackParamList
>;

type Props = {
  active: CallerTabId;
  navigation: CallerTabBarNavigation;
};

export default function CallerBottomTabs({ active, navigation }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [notificationUnread, setNotificationUnread] = useState(0);
  const bottomInset = Math.max(insets.bottom, 0);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        if (active === 'alerts') {
          await markNotificationsSeenNow('caller');
          if (!cancelled) setNotificationUnread(0);
          return;
        }
        const [lastSeenAt, { data }] = await Promise.all([
          getNotificationLastSeenAt('caller'),
          profileApi.callerNotifications(),
        ]);
        const unread = countUnreadByTimestamp(data.notifications, lastSeenAt);
        if (!cancelled) setNotificationUnread(unread);
      } catch {
        // Keep prior unread badge on transient failures.
      }
    };
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active]);
  const tab = (
    id: CallerTabId,
    icon: string,
    label: string,
    onPress: () => void,
    badgeCount = 0
  ) => {
    const on = active === id;
    return (
      <TouchableOpacity style={styles.tabItem} onPress={onPress} activeOpacity={0.85}>
        <View>
          <Text style={[styles.tabIcon, on && styles.tabIconActive]}>{icon}</Text>
          {badgeCount > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badgeCount > 99 ? '99+' : String(badgeCount)}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.tabLbl, on && styles.tabLblActive]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View
      style={[
        styles.wrap,
        {
          bottom: -TAB_BAR_BOTTOM_COVER,
          height: CALLER_TAB_BAR_HEIGHT + bottomInset + TAB_BAR_BOTTOM_COVER,
          paddingBottom: bottomInset + TAB_BAR_BOTTOM_COVER,
        },
      ]}
    >
      <View style={styles.inner}>
        {tab('home', '⌂', 'Home', () => navigation.navigate('CallerDiscover'))}
        {tab('calls', '📞', 'Calls', () => navigation.navigate('CallerCalls'))}
        {tab('alerts', '🔔', 'Alerts', () => navigation.navigate('CallerAlerts'), notificationUnread)}
        {tab('profile', '👤', 'Profile', () => navigation.navigate('CallerProfile'))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    zIndex: 50,
    elevation: 20,
    overflow: 'hidden',
  },
  inner: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    height: CALLER_TAB_BAR_HEIGHT,
    paddingHorizontal: 8,
    backgroundColor: '#fff',
  },
  tabItem: {
    flexDirection: 'column',
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  tabIcon: {
    fontSize: 20,
    lineHeight: 20,
    marginBottom: 3,
    opacity: 0.45,
    textAlign: 'center',
    includeFontPadding: false,
  },
  tabIconActive: { opacity: 1, color: PURPLE },
  tabLbl: { fontSize: 10, lineHeight: 12, fontWeight: '700', color: '#888' },
  tabLblActive: { color: PURPLE },
  badge: {
    position: 'absolute',
    right: -10,
    top: -5,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },
});
