import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import CallerBottomTabs from '../../components/caller/CallerBottomTabs';
import type { CallerStackParamList } from '../../navigation/CallerStackParamList';

type Props = NativeStackScreenProps<CallerStackParamList, 'CallerCalls'>;

export default function CallerCallsTabScreen({ navigation }: Props): React.JSX.Element {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <Text style={styles.title}>Calls</Text>
      <View style={styles.center}>
        <Text style={styles.emoji}>📞</Text>
        <Text style={styles.head}>No calls yet</Text>
        <Text style={styles.sub}>Your call history will show up here after you connect with someone.</Text>
      </View>
      <CallerBottomTabs active="calls" navigation={navigation} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f6f7' },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111',
    textAlign: 'center',
    paddingVertical: 16,
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, paddingBottom: 88 },
  emoji: { fontSize: 48, marginBottom: 16 },
  head: { fontSize: 18, fontWeight: '900', color: '#111', marginBottom: 8 },
  sub: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 22 },
});
