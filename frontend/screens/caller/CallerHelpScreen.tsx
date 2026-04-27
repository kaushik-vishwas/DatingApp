import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { CallerStackParamList } from '../../navigation/CallerStackParamList';

const PURPLE = '#7b2cff';
const SUPPORT_EMAIL = 'support@selecto.com';

type Props = NativeStackScreenProps<CallerStackParamList, 'CallerHelp'>;

export default function CallerHelpScreen({ navigation }: Props): React.JSX.Element {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help & Support</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.card}>
        <Text style={styles.emoji}>💬</Text>
        <Text style={styles.head}>We are here to help</Text>
        <Text style={styles.body}>
          For billing, safety, or account questions, email our team. We typically reply within two business days.
        </Text>
        <TouchableOpacity
          style={styles.mailBtn}
          onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Support%20request`)}
          activeOpacity={0.9}
        >
          <Text style={styles.mailBtnTxt}>{SUPPORT_EMAIL}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f6f7' },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  backBtn: { padding: 10 },
  back: { fontSize: 22, color: '#111' },
  headerTitle: { fontSize: 17, fontWeight: '900', color: '#111' },
  card: {
    margin: 20,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 22,
    borderWidth: 1,
    borderColor: '#eee',
  },
  emoji: { fontSize: 40, textAlign: 'center', marginBottom: 12 },
  head: { fontSize: 18, fontWeight: '900', color: '#111', textAlign: 'center', marginBottom: 10 },
  body: { fontSize: 14, color: '#666', lineHeight: 22, textAlign: 'center', marginBottom: 20 },
  mailBtn: {
    backgroundColor: PURPLE,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  mailBtnTxt: { color: '#fff', fontWeight: '900', fontSize: 15 },
});
