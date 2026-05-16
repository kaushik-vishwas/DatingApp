import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import ReceiverOnboardingStepLayout from '../../../components/receiver/onboarding/ReceiverOnboardingStepLayout';
import {
  RECEIVER_ONBOARDING_LANGUAGE_OPTIONS,
  useReceiverOnboarding,
} from '../../../context/ReceiverOnboardingContext';
import type { ReceiverOnboardingStackParamList } from '../../../navigation/ReceiverOnboardingStackParamList';

type Props = NativeStackScreenProps<
  ReceiverOnboardingStackParamList,
  'ReceiverOnboardingPrimaryLanguage'
>;

export default function ReceiverOnboardingPrimaryLanguageScreen({
  navigation,
}: Props): React.JSX.Element {
  const { primaryLanguage, setPrimaryLanguage, setSecondaryLanguage } = useReceiverOnboarding();
  const [selected, setSelected] = useState<string | null>(primaryLanguage);

  const onContinue = () => {
    if (!selected) {
      Alert.alert('Language', 'Please select your primary language.');
      return;
    }
    setPrimaryLanguage(selected);
    setSecondaryLanguage(null);
    navigation.navigate('ReceiverOnboardingSecondaryLanguage');
  };

  return (
    <ReceiverOnboardingStepLayout
      title="Select Your Primary Language"
      subtitle="Choose the language you are most comfortable speaking."
      onBack={() => navigation.goBack()}
      onContinue={onContinue}
      continueDisabled={!selected}
    >
      <View style={styles.chipWrap}>
        {RECEIVER_ONBOARDING_LANGUAGE_OPTIONS.map((lang) => {
          const active = selected === lang;
          return (
            <TouchableOpacity
              key={lang}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setSelected(lang)}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{lang}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </ReceiverOnboardingStepLayout>
  );
}

const styles = StyleSheet.create({
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  chipActive: { borderColor: '#A855F7', backgroundColor: '#F3E8FF' },
  chipText: { fontSize: 14, color: '#666', fontWeight: '600' },
  chipTextActive: { color: '#A855F7', fontWeight: '700' },
});
