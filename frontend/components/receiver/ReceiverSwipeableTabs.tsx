import React, { useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import PagerView from 'react-native-pager-view';

export type SwipeableTabItem<T extends string> = {
  key: T;
  label: string;
};

type Props<T extends string> = {
  tabs: readonly SwipeableTabItem<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  renderPage: (tab: T) => React.ReactNode;
  swipeEnabled?: boolean;
  tabPressEnabled?: boolean;
  tabBarExtra?: React.ReactNode;
  belowTabBar?: React.ReactNode;
  tabBarStyle?: StyleProp<ViewStyle>;
  tabButtonStyle?: StyleProp<ViewStyle>;
  tabButtonActiveStyle?: StyleProp<ViewStyle>;
  tabTextStyle?: StyleProp<TextStyle>;
  tabTextActiveStyle?: StyleProp<TextStyle>;
};

export default function ReceiverSwipeableTabs<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  renderPage,
  swipeEnabled = true,
  tabPressEnabled = true,
  tabBarExtra,
  belowTabBar,
  tabBarStyle,
  tabButtonStyle,
  tabButtonActiveStyle,
  tabTextStyle,
  tabTextActiveStyle,
}: Props<T>): React.JSX.Element {
  const pagerRef = useRef<PagerView>(null);
  const activeIndex = Math.max(
    0,
    tabs.findIndex((item) => item.key === activeTab)
  );

  const onPageSelected = useCallback(
    (event: { nativeEvent: { position: number } }) => {
      const nextTab = tabs[event.nativeEvent.position]?.key;
      if (nextTab && nextTab !== activeTab) {
        onTabChange(nextTab);
      }
    },
    [activeTab, onTabChange, tabs]
  );

  const onTabPress = useCallback(
    (tab: T, index: number) => {
      if (tab === activeTab) return;
      onTabChange(tab);
      pagerRef.current?.setPage(index);
    },
    [activeTab, onTabChange]
  );

  return (
    <View style={styles.root}>
      <View style={[styles.tabBar, tabBarStyle]}>
        <View style={styles.tabButtons}>
          {tabs.map((item, index) => {
            const isActive = item.key === activeTab;
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.tabBtn, tabButtonStyle, isActive && styles.tabBtnActive, isActive && tabButtonActiveStyle]}
                onPress={() => onTabPress(item.key, index)}
                activeOpacity={0.85}
                disabled={!tabPressEnabled}
              >
                <Text
                  style={[styles.tabText, tabTextStyle, isActive && styles.tabTextActive, isActive && tabTextActiveStyle]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {tabBarExtra}
      </View>
      {belowTabBar}

      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={activeIndex}
        onPageSelected={onPageSelected}
        scrollEnabled={swipeEnabled}
      >
        {tabs.map((item) => (
          <View key={item.key} style={styles.page} collapsable={false}>
            {renderPage(item.key)}
          </View>
        ))}
      </PagerView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  tabButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, flexShrink: 1 },
  tabBtn: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ddd',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  tabBtnActive: { backgroundColor: '#7b2cff', borderColor: '#7b2cff' },
  tabText: { fontSize: 12, color: '#444', fontWeight: '700' },
  tabTextActive: { color: '#fff' },
  pager: { flex: 1 },
  page: { flex: 1 },
});
