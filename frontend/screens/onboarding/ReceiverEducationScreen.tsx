import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import type { RootStackParamList } from '../../navigation/RootStackParamList';

const PURPLE = '#7b2cff';

type Step = {
  title: string;
  subtitle: string;
  icon: string;
  bullets: string[];
};

const STEPS: Step[] = [
  {
    title: 'How Earnings Work',
    subtitle: 'Understanding your income on the platform',
    icon: '📈',
    bullets: [
      'Call rate is fixed at ₹5 per minute.',
      'The platform charges a 20% commission.',
      'Earnings are credited after each call.',
      'Withdraw when you like — no minimum balance.',
      'No hidden fees or surprise deductions.',
    ],
  },
  {
    title: 'Commission explained',
    subtitle: 'What the platform fee covers',
    icon: '🛡️',
    bullets: [
      'Platform maintenance and updates.',
      'Payment processing and security.',
      '24/7 customer support.',
      'Marketing to bring in customers.',
      'Safety and content moderation.',
    ],
  },
  {
    title: 'Phone etiquette',
    subtitle: 'Best practices for great conversations',
    icon: '💬',
    bullets: [
      'Stay respectful and professional.',
      'Listen actively to customer needs.',
      'Keep conversations appropriate.',
      'Never share personal contact info.',
      'Report inappropriate behavior.',
      'Respond quickly to incoming calls.',
      'Build relationships for repeat customers.',
    ],
  },
  {
    title: 'Maximize your earnings',
    subtitle: 'Tips to increase your income',
    icon: '⭐',
    bullets: [
      'Maintain a high rating (4.5+).',
      'Be available during peak hours (6 PM – 11 PM).',
      'Complete your profile with quality photos.',
      'Respond quickly to incoming calls.',
      'Build relationships for repeat customers.',
    ],
  },
];

type Props = NativeStackScreenProps<RootStackParamList, 'ReceiverEducation'>;

export default function ReceiverEducationScreen({ navigation }: Props): React.JSX.Element {
  const [step, setStep] = useState(0);
  const total = STEPS.length;
  const current = STEPS[step]!;
  const progress = (step + 1) / total;

  const finish = () => {
    navigation.replace('ReceiverLogin');
  };

  const onSkip = () => {
    Alert.alert('Skip intro?', 'You can always read policies later in settings.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Skip', style: 'destructive', onPress: finish },
    ]);
  };

  const onNext = () => {
    if (step < total - 1) {
      setStep((s) => s + 1);
    } else {
      void finish();
    }
  };

  const onBack = () => {
    if (step > 0) setStep((s) => s - 1);
    else navigation.goBack();
  };

  const isLast = step === total - 1;

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <TouchableOpacity onPress={onSkip} hitSlop={12}>
          <Text style={styles.skip}>Skip</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.icon}>{current.icon}</Text>
        <Text style={styles.title}>{current.title}</Text>
        <Text style={styles.subtitle}>{current.subtitle}</Text>
        <View style={styles.list}>
          {current.bullets.map((line, i) => (
            <View key={`${step}-${i}`} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bulletText}>{line}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.primaryBtn} onPress={onNext} activeOpacity={0.9}>
          <Text style={styles.primaryBtnText}>
            {isLast ? 'Get Started' : 'Next'}
            {' →'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backLink} onPress={onBack}>
          <Text style={styles.backLinkText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.stepHint}>
          Step {step + 1} of {total}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 52,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 8,
    gap: 12,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ececec',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: PURPLE,
    borderRadius: 2,
  },
  skip: {
    fontSize: 15,
    fontWeight: '700',
    color: '#666',
  },
  scroll: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  icon: {
    fontSize: 48,
    textAlign: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  list: {
    gap: 12,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bulletDot: {
    fontSize: 16,
    color: PURPLE,
    fontWeight: '800',
    marginTop: 2,
  },
  bulletText: {
    flex: 1,
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 28,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e8e8e8',
    backgroundColor: '#fff',
  },
  primaryBtn: {
    backgroundColor: PURPLE,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  backLink: {
    marginTop: 14,
    alignItems: 'center',
  },
  backLinkText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#555',
  },
  stepHint: {
    marginTop: 12,
    textAlign: 'center',
    fontSize: 12,
    color: '#999',
    fontWeight: '600',
  },
});
