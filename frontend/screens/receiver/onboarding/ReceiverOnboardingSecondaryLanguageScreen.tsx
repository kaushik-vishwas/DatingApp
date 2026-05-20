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

  // Get first letter character for each available language
  const getFirstLetterCharacter = (lang: string): string => {
    const languageMap: { [key: string]: string } = {
      'English': 'A',
      'Hindi': 'अ',
      'Tamil': 'த',
      'Telugu': 'తె',
      'Malayalam': 'മ',
      'Kannada': 'ಕ',
      'Bengali': 'ব',
      'Marathi': 'म',
    };
    return languageMap[lang] || lang.charAt(0).toUpperCase();
  };

  // Group languages into pairs (2 per row)
  const languagePairs: string[][] = [];
  for (let i = 0; i < options.length; i += 2) {
    languagePairs.push(options.slice(i, i + 2));
  }

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
      <View style={styles.container}>
        {languagePairs.map((pair, rowIndex) => (
          <View key={rowIndex} style={styles.row}>
            {pair.map((lang) => {
              const active = selected === lang;
              return (
                <TouchableOpacity
                  key={lang}
                  style={[styles.miniBox, active && styles.miniBoxActive]}
                  onPress={() => setSelected(lang)}
                  activeOpacity={0.7}
                  disabled={loading}
                >
                  <View style={styles.topSection}>
                    <View style={[styles.imageCircle, active && styles.imageCircleActive]}>
                      <Text style={[styles.imageText, active && styles.imageTextActive]}>
                        {getFirstLetterCharacter(lang)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.bottomSection}>
                    <Text style={[styles.languageText, active && styles.languageTextActive]}>
                      {lang}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            {/* Fill empty space if odd number of languages in last row */}
            {pair.length === 1 && <View style={styles.emptyBox} />}
          </View>
        ))}
      </View>
    </ReceiverOnboardingStepLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 16,
    alignItems: 'stretch',
  },
  miniBox: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
  },
  miniBoxActive: {
    borderColor: '#A855F7',
    backgroundColor: '#F3E8FF',
  },
  topSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  bottomSection: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#E9D5FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageCircleActive: {
    backgroundColor: '#A855F7',
  },
  imageText: {
    fontSize: 26,
    fontWeight: '700',
    color: '#A855F7',
  },
  imageTextActive: {
    color: '#FFFFFF',
  },
  languageText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '600',
    textAlign: 'center',
  },
  languageTextActive: {
    color: '#A855F7',
    fontWeight: '700',
  },
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
  emptyBox: {
    flex: 1,
    opacity: 0,
  },
});