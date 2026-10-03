import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Alert, StyleSheet, TextInput } from 'react-native';

import ReceiverOnboardingStepLayout from '../../../components/receiver/onboarding/ReceiverOnboardingStepLayout';
import { useReceiverOnboarding } from '../../../context/ReceiverOnboardingContext';
import type { ReceiverOnboardingStackParamList } from '../../../navigation/ReceiverOnboardingStackParamList';
import {
  englishDisplayNameError,
  isEnglishDisplayName,
  normalizeEnglishDisplayName,
  sanitizeEnglishDisplayNameInput,
} from '../../../utils/validation';

type Props = NativeStackScreenProps<ReceiverOnboardingStackParamList, 'ReceiverOnboardingNickname'>;

export default function ReceiverOnboardingNicknameScreen({ navigation }: Props): React.JSX.Element {
  const { nickname, setNickname } = useReceiverOnboarding();
  const [value, setValue] = useState('');

  const displayName = normalizeEnglishDisplayName(value);
  const canContinue = isEnglishDisplayName(displayName);

  const onContinue = () => {
    const nameError = englishDisplayNameError(value);
    if (nameError) {
      Alert.alert('Display name', nameError);
      return;
    }
    setNickname(displayName);
    navigation.navigate('ReceiverOnboardingBirthYear');
  };

  return (
    <ReceiverOnboardingStepLayout
      title="Enter Your Display Name"
      subtitle="This is how callers will see you on the app."
      onContinue={onContinue}
      continueDisabled={!canContinue}
    >
      <TextInput
        style={styles.input}
        placeholder="Enter nickname"
        placeholderTextColor="#999"
        value={value}
        onChangeText={(t) => setValue(sanitizeEnglishDisplayNameInput(t))}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={40}
      />
    </ReceiverOnboardingStepLayout>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E8E8',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1a1a1a',
    fontWeight: '500',
  },
});