import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Alert, StyleSheet, TextInput } from 'react-native';

import ReceiverOnboardingStepLayout from '../../../components/receiver/onboarding/ReceiverOnboardingStepLayout';
import { useReceiverOnboarding } from '../../../context/ReceiverOnboardingContext';
import type { ReceiverOnboardingStackParamList } from '../../../navigation/ReceiverOnboardingStackParamList';

type Props = NativeStackScreenProps<ReceiverOnboardingStackParamList, 'ReceiverOnboardingNickname'>;

export default function ReceiverOnboardingNicknameScreen({ navigation }: Props): React.JSX.Element {
  const { nickname, setNickname } = useReceiverOnboarding();
  const [value, setValue] = useState('');

  const onContinue = () => {
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      Alert.alert('Nickname', 'Please enter a nickname (at least 2 characters).');
      return;
    }
    setNickname(trimmed);
    navigation.navigate('ReceiverOnboardingBirthYear');
  };

  return (
    <ReceiverOnboardingStepLayout
      title="Enter Your Display Name"
      subtitle="This is how callers will see you on the app."
      onContinue={onContinue}
      continueDisabled={value.trim().length < 2}
    >
      <TextInput
        style={styles.input}
        placeholder="Enter nickname"
        placeholderTextColor="#999"
        value={value}
        onChangeText={setValue}
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