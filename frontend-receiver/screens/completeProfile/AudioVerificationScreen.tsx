import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import VoiceVerificationRecorder from '../../components/VoiceVerificationRecorder';
import { CALLER_AUDIO_VERIFICATION_SCRIPT } from '../../constants/userOnboarding';
import { useCompleteProfile } from '../../context/CompleteProfileContext';
import type { CompleteProfileStackParamList } from '../../navigation/CompleteProfileStackParamList';

type Props = NativeStackScreenProps<CompleteProfileStackParamList, 'AudioVerification'>;

export default function AudioVerificationScreen({ navigation }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { state, update } = useCompleteProfile();

  const onUploadComplete = (url: string) => {
    update({ userAudio: url });
  };

  const onContinue = () => {
    if (!state.userAudio?.trim()) {
      Alert.alert('Voice verification required', 'Please record and upload your voice sample first.');
      return;
    }
    navigation.navigate('BankDetails', { autoSubmit: true });
  };

  return (
    <View
      style={[
        styles.root,
        { paddingTop: Math.max(insets.top, 14) + 10, paddingBottom: Math.max(insets.bottom, 14) + 18 },
      ]}
    >
      <TouchableOpacity style={styles.backWrap} onPress={() => navigation.goBack()} hitSlop={10}>
        <Text style={styles.back}>←</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Audio verification</Text>
      <Text style={styles.subtitle}>
        Final step before submission. Record your voice sample so your profile can be reviewed.
      </Text>

      <VoiceVerificationRecorder
        scriptText={CALLER_AUDIO_VERIFICATION_SCRIPT}
        onUploadComplete={onUploadComplete}
      />

      <TouchableOpacity
        style={[styles.cta, !state.userAudio && styles.ctaDisabled]}
        onPress={onContinue}
        disabled={!state.userAudio}
        activeOpacity={0.9}
      >
        <Text style={styles.ctaText}>Submit profile</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 22,
  },
  backWrap: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  back: { fontSize: 22, color: '#111' },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 12,
  },
  cta: {
    marginTop: 'auto',
    backgroundColor: '#7b2cff',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaDisabled: { opacity: 0.45 },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});

