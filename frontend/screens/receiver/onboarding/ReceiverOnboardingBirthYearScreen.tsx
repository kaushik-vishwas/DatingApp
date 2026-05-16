import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import ReceiverOnboardingStepLayout from '../../../components/receiver/onboarding/ReceiverOnboardingStepLayout';
import { useReceiverOnboarding } from '../../../context/ReceiverOnboardingContext';
import type { ReceiverOnboardingStackParamList } from '../../../navigation/ReceiverOnboardingStackParamList';

type Props = NativeStackScreenProps<ReceiverOnboardingStackParamList, 'ReceiverOnboardingBirthYear'>;

const MIN_AGE = 18;
const MAX_AGE = 80;

function buildBirthYearOptions(): number[] {
  const currentYear = new Date().getFullYear();
  const minYear = currentYear - MAX_AGE;
  const maxYear = currentYear - MIN_AGE;
  const years: number[] = [];
  for (let y = maxYear; y >= minYear; y -= 1) {
    years.push(y);
  }
  return years;
}

export default function ReceiverOnboardingBirthYearScreen({
  navigation,
}: Props): React.JSX.Element {
  const { birthYear, setBirthYear } = useReceiverOnboarding();
  const [selected, setSelected] = useState<number | null>(birthYear);
  const years = useMemo(() => buildBirthYearOptions(), []);

  const onContinue = () => {
    if (!selected) {
      Alert.alert('Birth year', 'Please select your birth year.');
      return;
    }
    setBirthYear(selected);
    navigation.navigate('ReceiverOnboardingAvatar');
  };

  return (
    <ReceiverOnboardingStepLayout
      title="When is Your Birth Year?"
      subtitle="You must be at least 18 years old to join as a receiver."
      onBack={() => navigation.goBack()}
      onContinue={onContinue}
      continueDisabled={!selected}
    >
      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {years.map((year) => {
          const active = selected === year;
          return (
            <TouchableOpacity
              key={year}
              style={[styles.row, active && styles.rowActive]}
              onPress={() => setSelected(year)}
              activeOpacity={0.85}
            >
              <Text style={[styles.rowText, active && styles.rowTextActive]}>{year}</Text>
            </TouchableOpacity>
          );
        })}
        <View style={styles.listEnd} />
      </ScrollView>
    </ReceiverOnboardingStepLayout>
  );
}

const styles = StyleSheet.create({
  list: { maxHeight: 360 },
  listEnd: { height: 8 },
  row: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    backgroundColor: '#fff',
    marginBottom: 10,
  },
  rowActive: {
    borderColor: '#A855F7',
    backgroundColor: '#F3E8FF',
  },
  rowText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  rowTextActive: {
    color: '#7F00FF',
    fontWeight: '800',
  },
});
