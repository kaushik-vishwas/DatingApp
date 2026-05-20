import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { CallerTabParamList } from '../../navigation/CallerTabParamList';

export type CallerTabBackTarget = 'home' | 'none';

export default function CallerTabScreenHeader({
  title,
  subtitle,
  backTarget = 'home',
}: {
  title: string;
  subtitle?: string;
  backTarget?: CallerTabBackTarget;
}): React.JSX.Element {
  const tabNav = useNavigation<BottomTabNavigationProp<CallerTabParamList>>();

  const onBack = (): void => {
    if (backTarget === 'home') {
      tabNav.navigate('CallerHome');
      return;
    }
    if (tabNav.canGoBack()) {
      tabNav.goBack();
    }
  };

  const showBack = backTarget !== 'none';

  return (
    <View style={styles.wrap}>
      {showBack ? (
        <TouchableOpacity
          onPress={onBack}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={26} color="#111" />
        </TouchableOpacity>
      ) : (
        <View style={styles.backBtn} />
      )}
      <View style={styles.titles}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.backBtn} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titles: { flex: 1, alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '900', color: '#111' },
  subtitle: { fontSize: 12, color: '#666', marginTop: 2, fontWeight: '600', textAlign: 'center' },
});
