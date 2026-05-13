import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { LayoutAnimation, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, UIManager, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { CallerStackParamList } from '../../navigation/CallerStackParamList';

const PURPLE = '#7b2cff';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type FaqItem = { id: string; q: string; a: string };

const FAQ_ITEMS: FaqItem[] = [
  {
    id: '1',
    q: 'How do wallet top-ups work?',
    a: 'Open Wallet from the discover flow, pick an amount, and complete payment. Bonus credits may apply depending on current offers. Your balance updates after a successful payment.',
  },
  {
    id: '2',
    q: 'How are voice calls charged?',
    a: 'Calls are billed per minute based on the receiver’s rate shown before you connect. Charges accrue during the call from your wallet balance.',
  },
  {
    id: '3',
    q: 'What if a call drops?',
    a: 'If the session ends unexpectedly, billing follows the rules for that session. For billing disputes or safety concerns, use Help & Support to reach our team.',
  },
  {
    id: '4',
    q: 'How do I stay safe?',
    a: 'Never share passwords or OTPs. Use in-app chat and calls only. You can report issues from the post-call screen or contact support for serious concerns.',
  },
  {
    id: '5',
    q: 'How do I update my profile?',
    a: 'Go to Profile → Edit Profile to change your photo, interests, languages, and other details shown to receivers.',
  },
];

type Props = NativeStackScreenProps<CallerStackParamList, 'CallerFaq'>;

export default function CallerFaqScreen({ navigation }: Props): React.JSX.Element {
  const [openId, setOpenId] = useState<string | null>(FAQ_ITEMS[0]?.id ?? null);

  const toggle = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenId((prev) => (prev === id ? null : id));
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>FAQ</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>Quick answers about Selecto for callers.</Text>
        {FAQ_ITEMS.map((item) => {
          const open = openId === item.id;
          return (
            <View key={item.id} style={styles.block}>
              <TouchableOpacity
                style={styles.qRow}
                onPress={() => toggle(item.id)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
              >
                <Text style={styles.qText}>{item.q}</Text>
                <Text style={styles.chev}>{open ? '−' : '+'}</Text>
              </TouchableOpacity>
              {open ? <Text style={styles.aText}>{item.a}</Text> : null}
            </View>
          );
        })}
      </ScrollView>
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
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 32 },
  intro: { fontSize: 14, color: '#666', lineHeight: 20, marginBottom: 16 },
  block: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#eee',
    marginBottom: 10,
    overflow: 'hidden',
  },
  qRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  qText: { flex: 1, fontSize: 15, fontWeight: '800', color: '#111' },
  chev: { fontSize: 20, fontWeight: '300', color: PURPLE, width: 24, textAlign: 'center' },
  aText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 21,
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 0,
  },
});
