import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import VoiceVerificationRecorder from '../../components/VoiceVerificationRecorder';
import { CALLER_AUDIO_VERIFICATION_SCRIPT } from '../../constants/userOnboarding';
import { useAuth } from '../../context/AuthContext';
import { useUserOnboarding } from '../../context/UserOnboardingContext';
import type { UserOnboardingStackParamList } from '../../navigation/UserOnboardingStackParamList';
import { getErrorMessage, profileApi } from '../../services/api';

const PURPLE = '#7b2cff';

type Props = NativeStackScreenProps<UserOnboardingStackParamList, 'AudioVerification'>;

export default function AudioVerificationScreen({ navigation }: Props): React.JSX.Element {
  const { gender, userAudio, setUserAudio } = useUserOnboarding();
  const { applyServerUser } = useAuth();

  React.useEffect(() => {
    if (gender && gender !== 'female') {
      navigation.replace('ChooseAvatar');
    }
  }, [gender, navigation]);

  const goNext = () => {
    if (!userAudio) return;
    navigation.navigate('ChooseAvatar');
  };

  const onUploadComplete = (url: string) => {
    setUserAudio(url);
    void (async () => {
      try {
        const { data } = await profileApi.saveCallerUserAudio({ userAudio: url });
        applyServerUser(data.user);
      } catch (e) {
        Alert.alert(
          'Could not save to server yet',
          `${getErrorMessage(e)}\n\nYour recording is kept for this session and will be saved when you finish your profile.`
        );
      }
    })();
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerBtn} />
      </View>

      <Text style={styles.title}>Audio verification</Text>
      <Text style={styles.subtitle}>
        Read the paragraph in your clear voice. Our team will review it before your account is approved.
      </Text>

      <VoiceVerificationRecorder scriptText={CALLER_AUDIO_VERIFICATION_SCRIPT} onUploadComplete={onUploadComplete} />

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.proceed, !userAudio && styles.proceedDisabled]}
          onPress={goNext}
          activeOpacity={0.9}
          disabled={!userAudio}
        >
          <Text style={styles.proceedText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    minWidth: 40,
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
    marginBottom: 16,
  },
  footer: { marginTop: 'auto', paddingTop: 16 },
  proceed: {
    backgroundColor: PURPLE,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  proceedDisabled: { opacity: 0.45 },
  proceedText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
