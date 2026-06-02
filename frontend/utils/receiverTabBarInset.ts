import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Platform, type ViewStyle } from 'react-native';

/**
 * Extra space below scroll/list content so the last row clears the tab bar.
 */
export const RECEIVER_TAB_SCROLL_EXTRA = 28;

/**
 * Tab bar styles for caller/receiver main tabs.
 * Do not set a fixed `height` or manual `paddingBottom` — React Navigation applies
 * bottom safe-area inset itself; a fixed height (e.g. 110) plus edge-to-edge on
 * Android APK leaves an empty strip under the tab icons.
 */
export function useAppTabBarStyle(): ViewStyle {
  return {
    backgroundColor: '#fff',
    borderTopColor: '#ececec',
    borderTopWidth: 1,
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
