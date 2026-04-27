import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { CallerStackParamList } from '../../navigation/CallerStackParamList';

type Props = NativeStackScreenProps<CallerStackParamList, 'CallerPrivacyPolicy'>;

const CONTENT = `Last Updated: 11/04/2026

1. Privacy Policy
We respect your privacy. This policy explains what we collect and how we use it when you use our calling and social features.

2. Information We Collect
• Name, email, and phone number you provide at registration
• Profile details such as photo, age range, gender, interests, and languages
• Account and usage data including call activity and wallet transactions where applicable
• Device information such as operating system and app version, and IP address when required for security

3. How We Use Your Information
• To operate matching, discovery, and voice features
• To process payments and maintain your wallet balance
• To verify identity where required and prevent fraud
• To improve the app and respond to support requests

4. Sharing
We do not sell your personal data. We may share information with service providers who help us run the app (for example hosting or analytics), under strict confidentiality.

5. Your choices
You can update profile information in the app. You may contact support to request account deletion or data questions.

6. Contact
support@selecto.com`;

export default function CallerPrivacyPolicyScreen({ navigation }: Props): React.JSX.Element {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator>
        <Text style={styles.body}>{CONTENT}</Text>
      </ScrollView>
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
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },
  body: { fontSize: 14, color: '#444', lineHeight: 22 },
});
