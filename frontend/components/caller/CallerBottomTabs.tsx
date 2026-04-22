import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { CallerStackParamList } from '../../navigation/CallerStackParamList';

const PURPLE = '#7b2cff';

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
  const tab = (id: CallerTabId, icon: string, label: string, onPress: () => void) => {
    const on = active === id;
    return (
      <TouchableOpacity style={styles.tabItem} onPress={onPress} activeOpacity={0.85}>
        <Text style={[styles.tabIcon, on && styles.tabIconActive]}>{icon}</Text>
        <Text style={[styles.tabLbl, on && styles.tabLblActive]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.wrap} edges={['bottom']}>
      <View style={styles.inner}>
        {tab('home', '⌂', 'Home', () => navigation.navigate('CallerDiscover'))}
        {tab('calls', '📞', 'Calls', () => navigation.navigate('CallerCalls'))}
        {tab('alerts', '🔔', 'Alerts', () => navigation.navigate('CallerAlerts'))}
        {tab('profile', '👤', 'Profile', () => navigation.navigate('CallerProfile'))}
      </View>
    </SafeAreaView>
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
  },
  inner: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  tabItem: { alignItems: 'center', minWidth: 56 },
  tabIcon: { fontSize: 20, marginBottom: 2, opacity: 0.45 },
  tabIconActive: { opacity: 1, color: PURPLE },
  tabLbl: { fontSize: 10, fontWeight: '700', color: '#888' },
  tabLblActive: { color: PURPLE },
});
