import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';

import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';

type Nav = NativeStackNavigationProp<ReceiverStackParamList, 'ReceiverHowToEarn'>;

type EarnStep = {
  title: string;
  subtitle: string;
  bullets: string[];
};

const EARN_STEPS: EarnStep[] = [
  {
    title: '💰 How You Earn',
    subtitle: 'Your earnings depend on call duration & timing',
    bullets: [
      'Calls under 1 minute = 0 earnings ❌',
      'Calls 3-10 minutes = 3x score multiplier',
      'Calls above 10 minutes = 5x score multiplier',
      'Longer calls = much higher earnings!',
    ],
  },
  {
    title: '⏰ Best Time to Earn',
    subtitle: 'Extra bonuses during night hours',
    bullets: [
      'Day time (9 AM - 9 PM): 0.5x multiplier',
      'Night (10 PM - 12 AM): 3x multiplier 🎉',
      'Late night (12 AM - 2 AM): 10x multiplier 🔥',
      'Best earning: Take calls after 10 PM!',
    ],
  },
  {
    title: '🏆 Badge Levels',
    subtitle: 'Higher badge = higher pay per minute',
    bullets: [
      'Bronze (1+ score): ₹1.3/min',
      'Silver (1648+ score): ₹1.5/min',
      'Gold (10403+ score): ₹1.7/min',
      'Pro (16686+ score): ₹1.9/min',
      'Platinum (below 8000): ₹2.0/min',
      'Diamond (8000-12000): ₹2.3/min',
      'Supreme (12000+): ₹2.6/min 👑',
    ],
  },
  {
    title: '💬 Phone Etiquette',
    subtitle: 'Best practices for great conversations',
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
    title: '⭐ Pro Tips',
    subtitle: 'Maximize your daily earnings',
    bullets: [
      'Talk for 10+ minutes to get 5x points',
      'Be active after 10 PM for bonus multipliers',
      'Avoid calls shorter than 1 minute',
      'Higher score = better badge = more ₹ per minute',
      'Consistent earnings = reach Supreme level!',
    ],
  },
];

export default function ReceiverHowToEarnScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Icon name="chevron-left" size={24} color="#1a1a1a" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>How to Earn</Text>
          <View style={styles.backBtn} />
        </View>

        <Text style={styles.subtitle}>How you earn as a receiver on the platform.</Text>

        <View style={{ gap: 16, marginTop: 8, paddingBottom: 32 }}>
          {EARN_STEPS.map((s, idx) => (
            <View key={idx} style={styles.earnCard}>
              <Text style={styles.earnTitle}>{s.title}</Text>
              <Text style={styles.earnSub}>{s.subtitle}</Text>
              <View style={styles.earnBullets}>
                {s.bullets.map((b, i) => (
                  <View key={i} style={styles.earnBulletRow}>
                    <Text style={styles.earnDot}>•</Text>
                    <Text style={styles.earnBulletText}>{b}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F9FA' },
  screen: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 8 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingVertical: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTitle: {
    fontSize: 18,
    color: '#1a1a1a',
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    color: '#888',
    marginBottom: 8,
    lineHeight: 18,
    letterSpacing: -0.2,
  },
  earnCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ECECEC',
    padding: 16,
  },
  earnTitle: { fontSize: 16, fontWeight: '900', color: '#111', marginBottom: 4 },
  earnSub: { fontSize: 13, color: '#666', marginBottom: 10 },
  earnBullets: { gap: 10 },
  earnBulletRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  earnDot: { fontSize: 18, lineHeight: 20, color: '#A855F7', fontWeight: '900' },
  earnBulletText: { flex: 1, fontSize: 13, color: '#333', lineHeight: 20, fontWeight: '600' },
});
