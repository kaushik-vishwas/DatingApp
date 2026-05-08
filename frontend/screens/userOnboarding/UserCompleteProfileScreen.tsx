import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  CALLER_INTEREST_OPTIONS,
  CALLER_LANGUAGE_OPTIONS,
  INDIAN_STATES,
  getCallerAvatarPresetsByGender,
} from '../../constants/userOnboarding';
import { useAuth } from '../../context/AuthContext';
import { useUserOnboarding } from '../../context/UserOnboardingContext';
import type { UserOnboardingStackParamList } from '../../navigation/UserOnboardingStackParamList';
import { getErrorMessage, profileApi } from '../../services/api';

const PURPLE = '#7b2cff';

type Props = NativeStackScreenProps<UserOnboardingStackParamList, 'UserCompleteProfile'>;

function toggleInList(list: string[], item: string): string[] {
  if (list.includes(item)) return list.filter((x) => x !== item);
  return [...list, item];
}

export default function UserCompleteProfileScreen({ navigation }: Props): React.JSX.Element {
  const { gender, callerAvatarPresetUrl, userAudio, setUserAudio } = useUserOnboarding();
  const { user, refreshUser, applyServerUser } = useAuth();
  const allowedAvatarPresets = getCallerAvatarPresetsByGender(gender);

  const [fullName, setFullName] = useState('');
  const [state, setState] = useState('Karnataka');
  const [stateModal, setStateModal] = useState(false);
  const [interests, setInterests] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    if (!gender) {
      navigation.replace('SelectGender');
    }
  }, [gender, navigation]);

  /** Restore voice URL from server if context was cleared (e.g. app restart) while still `pending_profile`. */
  React.useEffect(() => {
    const fromServer = user?.userAudio?.trim();
    if (fromServer && !userAudio) {
      setUserAudio(fromServer);
    }
  }, [user?.userAudio, userAudio, setUserAudio]);

  useFocusEffect(
    useCallback(() => {
      if (callerAvatarPresetUrl) {
        setImageUri(callerAvatarPresetUrl);
      }
    }, [callerAvatarPresetUrl])
  );

  const onSubmit = useCallback(async () => {
    if (!gender) return;

    const name = fullName.trim();
    if (name.length < 2) {
      Alert.alert('Validation', 'Please enter your full name.');
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
    if (!state.trim()) {
      Alert.alert('Validation', 'Please select your state.');
      return;
    }
    if (interests.length === 0) {
      Alert.alert('Validation', 'Pick at least one interest.');
      return;
    }
    if (languages.length === 0) {
      Alert.alert('Validation', 'Pick at least one language.');
      return;
    }
    if (!imageUri) {
      Alert.alert('Validation', 'Please choose an avatar.');
      return;
    }
    if (!allowedAvatarPresets.includes(imageUri)) {
      Alert.alert('Validation', 'Please choose a valid avatar for the selected gender.');
      return;
    }
    if (gender === 'female' && !userAudio?.trim()) {
      Alert.alert('Voice verification required', 'Go back and complete the audio verification step.');
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await profileApi.completeCaller({
        name,
        profileImage: imageUri.trim(),
        languages,
        interests,
        gender,
        dateOfBirth: dobStr,
        state: state.trim(),
        ...(gender === 'female' ? { userAudio: userAudio!.trim() } : {}),
      });
      if (gender === 'female' && data.voiceVerification) {
        const v = data.voiceVerification;
        Alert.alert(
          'Voice verification result',
          `Provider: ${v.provider}\nModel: ${v.model}\nPredicted: ${v.predictedGender}\nConfidence: ${v.confidence.toFixed(3)}\nThreshold: ${v.threshold.toFixed(3)}\nApproved: ${v.approved ? 'Yes' : 'No'}${v.reason ? `\nReason: ${v.reason}` : ''}`
        );
      }
      applyServerUser(data.user);
      await refreshUser();
    } catch (e) {
      Alert.alert('Error', getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }, [
    gender,
    fullName,
    user?.dateOfBirth,
    state,
    interests,
    languages,
    imageUri,
    allowedAvatarPresets,
    userAudio,
    refreshUser,
    applyServerUser,
  ]);

  const chip = (label: string, selected: boolean, onPress: () => void) => (
    <TouchableOpacity
      key={label}
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.bg}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={styles.backWrap} onPress={() => navigation.goBack()}>
            <Text style={styles.back}>←</Text>
          </TouchableOpacity>

          <Text style={styles.title}>sssS</Text>
          <Text style={styles.subtitle}>Tell us a bit about yourself</Text>

          <TouchableOpacity
            style={styles.avatarWrap}
            onPress={() => navigation.navigate('ChooseAvatar')}
            activeOpacity={0.9}
          >
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.camera}>📷</Text>
              </View>
            )}
            <View style={styles.cameraBadge}>
              <Text style={styles.cameraSmall}>＋</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('ChooseAvatar')}>
            <Text style={styles.changePhoto}>Change avatar</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your name"
            placeholderTextColor="#999"
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
          />

          <Text style={styles.label}>Interests</Text>
          <View style={styles.chipGrid}>
            {CALLER_INTEREST_OPTIONS.map((opt) =>
              chip(opt, interests.includes(opt), () => setInterests((prev) => toggleInList(prev, opt)))
            )}
          </View>

          <Text style={styles.label}>State</Text>
          <TouchableOpacity style={styles.select} onPress={() => setStateModal(true)} activeOpacity={0.85}>
            <Text style={styles.selectText}>{state}</Text>
            <Text style={styles.chev}>▼</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Languages</Text>
          <View style={styles.chipGrid}>
            {CALLER_LANGUAGE_OPTIONS.map((opt) =>
              chip(opt, languages.includes(opt), () => setLanguages((prev) => toggleInList(prev, opt)))
            )}
          </View>
        </ScrollView>

        <TouchableOpacity
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={() => void onSubmit()}
          disabled={submitting}
          activeOpacity={0.9}
        >
          <Text style={styles.buttonText}>{submitting ? 'Saving…' : 'Continue'}</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>

      <Modal visible={stateModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalDismiss} onPress={() => setStateModal(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select State</Text>
            <ScrollView style={styles.modalList} keyboardShouldPersistTaps="handled">
              {INDIAN_STATES.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.stateRow, s === state && styles.stateRowActive]}
                  onPress={() => {
                    setState(s);
                    setStateModal(false);
                  }}
                >
                  <Text style={[styles.stateRowText, s === state && styles.stateRowTextActive]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: '#f4f4f5',
  },
  flex: {
    flex: 1,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 120,
  },
  backWrap: {
    alignSelf: 'flex-start',
    padding: 4,
    marginBottom: 8,
  },
  back: {
    fontSize: 22,
    color: '#111',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 20,
  },
  avatarWrap: {
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#e8e8e8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  camera: {
    fontSize: 28,
  },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  cameraSmall: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    marginTop: -2,
  },
  changePhoto: {
    alignSelf: 'center',
    color: PURPLE,
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: '#fff',
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  chipSelected: {
    backgroundColor: PURPLE,
    borderColor: PURPLE,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  chipTextSelected: {
    color: '#fff',
  },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: '#fff',
  },
  selectText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
  },
  chev: {
    fontSize: 12,
    color: '#888',
  },
  button: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 24,
    maxWidth: 400,
    alignSelf: 'center',
    backgroundColor: PURPLE,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  modalDismiss: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    maxHeight: '70%',
    paddingVertical: 12,
    zIndex: 1,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    paddingHorizontal: 18,
    paddingBottom: 10,
    color: '#111',
  },
  modalList: {
    paddingHorizontal: 8,
  },
  stateRow: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  stateRowActive: {
    backgroundColor: 'rgba(123,44,255,0.12)',
  },
  stateRowText: {
    fontSize: 15,
    color: '#222',
  },
  stateRowTextActive: {
    fontWeight: '700',
    color: PURPLE,
  },
});
