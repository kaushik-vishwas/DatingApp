import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import VoiceVerificationRecorder from '../../components/VoiceVerificationRecorder';
import { CALLER_AUDIO_VERIFICATION_SCRIPT } from '../../constants/userOnboarding';
import { useAuth } from '../../context/AuthContext';
import { useCompleteProfile } from '../../context/CompleteProfileContext';
import { inferResourceType, uploadToCloudinary } from '../../lib/cloudinary';
import type { CompleteProfileStackParamList } from '../../navigation/CompleteProfileStackParamList';
import { getErrorMessage, profileApi } from '../../services/api';
import { validateCompleteProfile } from '../../utils/completeProfileSteps';

type Props = NativeStackScreenProps<CompleteProfileStackParamList, 'AudioVerification'>;

export default function AudioVerificationScreen({ navigation, route }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { state, update } = useCompleteProfile();
  const { user, refreshUser, applyServerUser } = useAuth();
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (route.params?.agreedToPolicies && !state.kycTermsAccepted) {
      update({ kycTermsAccepted: true });
    }
  }, [route.params?.agreedToPolicies, state.kycTermsAccepted, update]);

  const goBackToBankDetails = () =>
    navigation.navigate('BankDetails', { agreedToPolicies: true });

  const onUploadComplete = (url: string) => {
    update({ userAudio: url });
  };

  const onContinue = async () => {
    if (!state.userAudio?.trim()) {
      Alert.alert('Voice verification required', 'Please record and upload your voice sample first.');
      return;
    }
    const err = validateCompleteProfile(state);
    if (err) {
      Alert.alert('Validation', err);
      goBackToBankDetails();
      return;
    }
    if (!state.profileImageUri || !state.aadhaarFront || !state.aadhaarBack || !state.panFront) {
      Alert.alert('Validation', 'Missing required files');
      goBackToBankDetails();
      return;
    }
    const dobStr = user?.dateOfBirth?.trim();
    if (!dobStr) {
      Alert.alert(
        'Date of birth required',
        'Your account is missing a date of birth. Please sign out and register again, or contact support.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const profileImageUrl = /^https?:\/\//i.test(state.profileImageUri)
        ? state.profileImageUri.trim()
        : (
            await uploadToCloudinary(state.profileImageUri, {
              mimeType: state.profileImageMime ?? 'image/jpeg',
              resourceType: 'image',
              fileName: 'profile.jpg',
            })
          ).secure_url;

      const frontRes = await uploadToCloudinary(state.aadhaarFront.uri, {
        mimeType: state.aadhaarFront.mimeType,
        resourceType: inferResourceType(state.aadhaarFront.mimeType),
        fileName: state.aadhaarFront.name,
      });

      const backRes = await uploadToCloudinary(state.aadhaarBack.uri, {
        mimeType: state.aadhaarBack.mimeType,
        resourceType: inferResourceType(state.aadhaarBack.mimeType),
        fileName: state.aadhaarBack.name,
      });
      const panFrontRes = await uploadToCloudinary(state.panFront.uri, {
        mimeType: state.panFront.mimeType,
        resourceType: inferResourceType(state.panFront.mimeType),
        fileName: state.panFront.name,
      });

      const { data } = await profileApi.complete({
        name: state.displayName.trim(),
        profileImage: profileImageUrl,
        aadhaarFront: frontRes.secure_url,
        aadhaarBack: backRes.secure_url,
        aadhaarNumber: state.aadhaarNumber.trim(),
        panNumber: state.panNumber.trim().toUpperCase(),
        panFront: panFrontRes.secure_url,
        languages: state.languages,
        interests: state.interests,
        gender: state.gender!,
        dateOfBirth: dobStr,
        state: state.state.trim(),
        bankAccountHolderName: state.bankAccountHolderName.trim(),
        bankAccountType: state.bankAccountType,
        bankAccountNumber: state.bankAccountNumber.trim(),
        bankIfsc: state.bankIfsc.trim().toUpperCase(),
        bankName: state.bankName.trim(),
        userAudio: state.userAudio?.trim() || undefined,
      });

      applyServerUser(data.user);
      await refreshUser();
    } catch (e: unknown) {
      Alert.alert('Error', getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
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
        style={[styles.cta, (!state.userAudio || submitting) && styles.ctaDisabled]}
        onPress={() => void onContinue()}
        disabled={!state.userAudio || submitting}
        activeOpacity={0.9}
      >
        <Text style={styles.ctaText}>{submitting ? 'Submitting…' : 'Submit profile'}</Text>
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

