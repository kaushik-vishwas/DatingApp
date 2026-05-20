import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Platform, type ViewStyle } from 'react-native';

/**
 * Extra space below scroll/list content so the last row clears the tab bar.
 * Increase if content still sits under the bar on your device.
 */
export const RECEIVER_TAB_SCROLL_EXTRA = 28;

/**
 * Visual-only tab bar styles. Do NOT set `height` or `paddingBottom` here —
 * React Navigation adds safe-area padding itself; duplicating it breaks
 * `useBottomTabBarHeight()` and causes content to slide under the bar.
 */
export function getReceiverTabBarStyle(): ViewStyle {
  return {
    backgroundColor: '#fff',
    borderTopColor: '#ececec',
    borderTopWidth: 1,
    height: 110,
    paddingTop: Platform.OS === 'ios' ? 6 : 8,
  };
}

/** Measured tab bar height + extra padding for ScrollView / FlatList content. */
export function useReceiverTabBarBottomInset(
  extra: number = RECEIVER_TAB_SCROLL_EXTRA
): number {
  const tabBarHeight = useBottomTabBarHeight();
  return tabBarHeight + extra;
}
