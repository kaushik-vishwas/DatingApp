import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import React, { useMemo } from 'react';
import { Platform, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Extra space below scroll/list content so the last row clears the tab bar.
 */
export const RECEIVER_TAB_SCROLL_EXTRA = 28;

export const TAB_BAR_BG = '#ffffff';

/** UIKit default tab content height used by React Navigation. */
const TAB_BAR_CONTENT_HEIGHT = 49;

/** Let tab bar paint through the bottom inset (icons padded inside). */
export const ANDROID_MAIN_TAB_SAFE_AREA_INSETS = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
} as const;

export function TabBarBackground(): React.ReactElement {
  return React.createElement(View, {
    style: { flex: 1, backgroundColor: TAB_BAR_BG },
  });
}

/**
 * Tab bar styles for caller/receiver main tabs.
 * React Navigation sets a fixed tab bar height (~49 + inset); paddingBottom alone
 * does not lift icons unless `height` is increased too.
 */
export function useAppTabBarStyle(kind: 'caller' | 'receiver' = 'receiver'): ViewStyle {
  const insets = useSafeAreaInsets();
  const paddingTop = Platform.OS === 'ios' ? 6 : 8;
  /** Extra gap inside the bar, below icons/labels. */
  const innerBottomGap = kind === 'caller' ? 16 : 14;
  const paddingBottom = insets.bottom + innerBottomGap;
  const height = TAB_BAR_CONTENT_HEIGHT + paddingTop + paddingBottom;

  return {
    backgroundColor: TAB_BAR_BG,
    borderTopColor: '#ececec',
    borderTopWidth: 1,
    paddingTop,
    paddingBottom,
    height,
  };
}

/** Shared bottom-tab screen options (caller + receiver). */
export function useMainTabsScreenOptions(
  kind: 'caller' | 'receiver' = 'receiver'
): BottomTabNavigationOptions {
  const tabBarStyle = useAppTabBarStyle(kind);
  return useMemo(
    () => ({
      tabBarStyle,
      tabBarBackground: TabBarBackground,
      ...(Platform.OS === 'android'
        ? {
            safeAreaInsets: ANDROID_MAIN_TAB_SAFE_AREA_INSETS,
            tabBarItemStyle: { marginBottom: kind === 'caller' ? 4 : 2 },
          }
        : {}),
    }),
    [kind, tabBarStyle]
  );
}

/** Measured tab bar height + extra padding for ScrollView / FlatList content. */
export function useReceiverTabBarBottomInset(
  extra: number = RECEIVER_TAB_SCROLL_EXTRA
): number {
  const tabBarHeight = useBottomTabBarHeight();
  return tabBarHeight + extra;
}
