import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { CallerStackParamList } from '../../navigation/CallerStackParamList';

const PURPLE = '#7b2cff';

type Props = NativeStackScreenProps<CallerStackParamList, 'CallerTerms'>;

const BODY = `1. Overview
This platform connects you with people for voice conversations. By using the service you agree to follow these terms and to use the product responsibly.

2. Account Rules
Account Registration: You must provide accurate information. One person should use one account.

Account Security: Keep your login details private. Notify us if you suspect unauthorized access.

Age Requirement: You must be at least 18 years old to use this service.

Account Termination: We may suspend or terminate accounts that violate these terms or harm other users.

3. Payments & wallet
Wallet balances are used according to in-app pricing. Recharges are subject to the packages shown in the app.

4. Conduct
Harassment, illegal activity, or sharing of prohibited content is not allowed.

10. Contact Information
Customer Support: support@nesthama.com
We aim to respond within 2 business days.`;

export default function CallerTermsScreen({ navigation }: Props): React.JSX.Element {
  const [agreed, setAgreed] = useState(false);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms & Privacy</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator>
        <Text style={styles.body}>{BODY}</Text>

        <TouchableOpacity
          style={styles.linkWrap}
          onPress={() => navigation.navigate('CallerPrivacyPolicy')}
          activeOpacity={0.85}
        >
          <Text style={styles.link}>View full Privacy Policy →</Text>
        </TouchableOpacity>

        <Pressable style={styles.checkRow} onPress={() => setAgreed((a) => !a)}>
          <View style={[styles.box, agreed && styles.boxOn]}>
            {agreed ? <Text style={styles.tick}>✓</Text> : null}
          </View>
          <Text style={styles.checkLbl}>
            I have read and agree to the Terms & Conditions. I understand that continued use of the app means acceptance
            of these rules.
          </Text>
        </Pressable>
      </ScrollView>

      <TouchableOpacity
        style={[styles.cta, !agreed && styles.ctaDis]}
        disabled={!agreed}
        onPress={() => navigation.goBack()}
        activeOpacity={0.9}
      >
        <Text style={styles.ctaTxt}>Continue</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
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
  scroll: { paddingHorizontal: 20, paddingBottom: 120 },
  body: { fontSize: 14, color: '#444', lineHeight: 22 },
  linkWrap: { marginTop: 20, marginBottom: 24 },
  link: { fontSize: 14, fontWeight: '800', color: PURPLE },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 8 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#ccc',
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: PURPLE, borderColor: PURPLE },
  tick: { color: '#fff', fontSize: 14, fontWeight: '900' },
  checkLbl: { flex: 1, fontSize: 13, color: '#555', lineHeight: 20 },
  cta: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 28,
    backgroundColor: PURPLE,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  ctaDis: { opacity: 0.4 },
  ctaTxt: { color: '#fff', fontSize: 16, fontWeight: '900' },
});
