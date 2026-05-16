import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import ReceiverOnboardingStepLayout from '../../../components/receiver/onboarding/ReceiverOnboardingStepLayout';
import { useAuth } from '../../../context/AuthContext';
import {
  RECEIVER_ONBOARDING_LANGUAGE_OPTIONS,
  useReceiverOnboarding,
} from '../../../context/ReceiverOnboardingContext';
import type { ReceiverOnboardingStackParamList } from '../../../navigation/ReceiverOnboardingStackParamList';
import { getErrorMessage } from '../../../services/api';
import {
  goToReceiverAudioVerification,
  submitReceiverOnboardingProfile,
} from '../../../utils/receiverOnboardingSubmit';

type Props = NativeStackScreenProps<
  ReceiverOnboardingStackParamList,
  'ReceiverOnboardingSecondaryLanguage'
>;

export default function ReceiverOnboardingSecondaryLanguageScreen({
  navigation,
}: Props): React.JSX.Element {
  const { applyServerUser } = useAuth();
  const {
    gender,
    nickname,
    birthYear,
    profileImageUri,
    primaryLanguage,
    secondaryLanguage,
    setSecondaryLanguage,
  } = useReceiverOnboarding();
  const [selected, setSelected] = useState<string | null>(secondaryLanguage);
  const [loading, setLoading] = useState(false);

  const options = RECEIVER_ONBOARDING_LANGUAGE_OPTIONS.filter((l) => l !== primaryLanguage);

  const finishOnboarding = async (secondary: string | null) => {
    if (!nickname?.trim() || !birthYear || !profileImageUri?.trim() || !primaryLanguage) {
      Alert.alert('Incomplete', 'Please go back and complete the previous steps.');
      return;
    }
    const resolvedGender = gender ?? 'female';
    setLoading(true);
    try {
      const user = await submitReceiverOnboardingProfile({
        nickname,
        birthYear,
        profileImageUri,
        primaryLanguage,
        secondaryLanguage: secondary,
        gender: resolvedGender,
      });
      applyServerUser(user);
      goToReceiverAudioVerification();
    } catch (e) {
      Alert.alert('Could not save profile', getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const onSkip = () => {
    setSecondaryLanguage(null);
    void finishOnboarding(null);
  };

  const onContinue = () => {
    if (!selected) {
      Alert.alert('Language', 'Select a secondary language or tap Skip.');
      return;
    }
    setSecondaryLanguage(selected);
    void finishOnboarding(selected);
  };

  return (
    <ReceiverOnboardingStepLayout
      title="Select Secondary Language"
      subtitle="Optional — add another language you can speak with callers."
      onBack={() => navigation.goBack()}
      onContinue={onContinue}
      continueLabel="Save & continue"
      continueDisabled={!selected}
      loading={loading}
      footerExtra={
        <TouchableOpacity style={styles.skipBtn} onPress={onSkip} disabled={loading}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      }
    >
      <View style={styles.chipWrap}>
        {options.map((lang) => {
          const active = selected === lang;
          return (
            <TouchableOpacity
              key={lang}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setSelected(lang)}
              activeOpacity={0.7}
              disabled={loading}
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
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 8,
  },
  skipText: {
    color: '#7b2cff',
    fontSize: 14,
    fontWeight: '700',
  },
});
