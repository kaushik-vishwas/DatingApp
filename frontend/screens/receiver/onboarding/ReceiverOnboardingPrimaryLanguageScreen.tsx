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

  // Group languages into pairs (2 per row = 4 rows total for 8 languages)
  const languagePairs: string[][] = [];
  for (let i = 0; i < RECEIVER_ONBOARDING_LANGUAGE_OPTIONS.length; i += 2) {
    languagePairs.push(RECEIVER_ONBOARDING_LANGUAGE_OPTIONS.slice(i, i + 2));
  }

  return (
    <ReceiverOnboardingStepLayout
      title="Select Your Primary Language"
      subtitle="Choose the language you are most comfortable speaking."
      onBack={() => navigation.goBack()}
      onContinue={onContinue}
      continueDisabled={!selected}
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
  emptyBox: {
    flex: 1,
    opacity: 0,
  },
});