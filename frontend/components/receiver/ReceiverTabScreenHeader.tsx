import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import type { ReceiverTabParamList } from '../../navigation/ReceiverTabParamList';

export type ReceiverTabBackTarget = 'home' | 'settings' | 'stackBack';

export default function ReceiverTabScreenHeader({
  title,
  subtitle,
  backTarget = 'home',
}: {
  title: string;
  subtitle?: string;
  backTarget?: ReceiverTabBackTarget;
}): React.JSX.Element {
  const tabNav = useNavigation<BottomTabNavigationProp<ReceiverTabParamList>>();
  const stackNav = tabNav.getParent<NativeStackNavigationProp<ReceiverStackParamList>>();

  const onBack = (): void => {
    if (backTarget === 'home') {
      tabNav.navigate('ReceiverHome');
      return;
    }
    if (backTarget === 'settings') {
      stackNav?.navigate('ReceiverSettings');
      return;
    }
    if (stackNav?.canGoBack()) {
      stackNav.goBack();
      return;
    }
    if (tabNav.canGoBack()) {
      tabNav.goBack();
    }
  };

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        onPress={onBack}
        style={styles.backBtn}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        activeOpacity={0.7}
      >
        <Ionicons name="chevron-back" size={26} color="#111" />
      </TouchableOpacity>
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
