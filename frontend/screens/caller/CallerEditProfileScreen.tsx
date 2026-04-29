import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { SafeAreaView } from 'react-native-safe-area-context';

import DobPickerField from '../../components/DobPickerField';
import {
  CALLER_INTEREST_OPTIONS,
  CALLER_LANGUAGE_OPTIONS,
  INDIAN_STATES,
  getCallerAvatarPresetsByGender,
} from '../../constants/userOnboarding';
import { useAuth } from '../../context/AuthContext';
import type { CallerStackParamList } from '../../navigation/CallerStackParamList';
import { getErrorMessage, profileApi } from '../../services/api';
import type { Gender } from '../../types/user';
import { ageFromLocalCalendarBirthDate, formatDateOnlyLocal, maxDobDateForMinAge, parseDateOnlyLocalToDate } from '../../utils/birthDateClient';

const PURPLE = '#7b2cff';
const MAX_INTERESTS = 3;
const MAX_LANGUAGES = 2;

type Props = NativeStackScreenProps<CallerStackParamList, 'CallerEditProfile'>;

function toggleLang(prev: string[], item: string): string[] {
  if (prev.includes(item)) return prev.filter((x) => x !== item);
  if (prev.length >= MAX_LANGUAGES) {
    Alert.alert('Limit reached', `You can select up to ${MAX_LANGUAGES} languages.`);
    return prev;
  }
  return [...prev, item];
}

function toggleInterest(prev: string[], item: string): string[] {
  if (prev.includes(item)) return prev.filter((x) => x !== item);
  if (prev.length >= MAX_INTERESTS) {
    Alert.alert('Limit reached', `You can select up to ${MAX_INTERESTS} interests.`);
    return prev;
  }
  return [...prev, item];
}

export default function CallerEditProfileScreen({ navigation }: Props): React.JSX.Element {
  const { user, refreshUser } = useAuth();
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState<Date | null>(null);
  const [gender, setGender] = useState<Gender>('male');
  const [state, setState] = useState('Karnataka');
  const [stateModal, setStateModal] = useState(false);
  const [interests, setInterests] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [avatarModal, setAvatarModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const allowedAvatarPresets = getCallerAvatarPresetsByGender(gender);

  useEffect(() => {
    if (!user) return;
    setFullName(user.name ?? '');
    setDob(user.dateOfBirth ? parseDateOnlyLocalToDate(user.dateOfBirth) : null);
    if (user.gender === 'male' || user.gender === 'female' || user.gender === 'other') {
      setGender(user.gender);
    }
    setState(user.state?.trim() || 'Karnataka');
    const ints = (user.interests ?? []).filter((i) => CALLER_INTEREST_OPTIONS.includes(i)).slice(0, MAX_INTERESTS);
    const langs = (user.languages ?? []).filter((l) => CALLER_LANGUAGE_OPTIONS.includes(l)).slice(0, MAX_LANGUAGES);
    setInterests(ints);
    setLanguages(langs);
    if (user.profileImage) setImageUri(user.profileImage);
  }, [user]);

  useEffect(() => {
    if (imageUri && !allowedAvatarPresets.includes(imageUri)) {
      setImageUri(allowedAvatarPresets[0] ?? null);
    }
  }, [allowedAvatarPresets, imageUri]);

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

  const onSubmit = async () => {
    if (!user) return;
    const name = fullName.trim();
    if (name.length < 2) {
      Alert.alert('Validation', 'Please enter your full name.');
      return;
    }
    if (!dob) {
      Alert.alert('Validation', 'Select your date of birth.');
      return;
    }
    const years = ageFromLocalCalendarBirthDate(dob);
    if (years < 18 || years > 120) {
      Alert.alert('Validation', 'You must be between 18 and 120 years old.');
      return;
    }
    if (!state.trim()) {
      Alert.alert('Validation', 'Please select your state.');
      return;
    }
    if (interests.length === 0) {
      Alert.alert('Validation', `Pick at least one interest (up to ${MAX_INTERESTS}).`);
      return;
    }
    if (languages.length === 0) {
      Alert.alert('Validation', `Pick at least one language (up to ${MAX_LANGUAGES}).`);
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

    setSubmitting(true);
    try {
      await profileApi.updateCaller({
        name,
        profileImage: imageUri.trim(),
        languages,
        interests,
        gender,
        dateOfBirth: formatDateOnlyLocal(dob),
        state: state.trim(),
      });
      await refreshUser();
      navigation.goBack();
    } catch (e: unknown) {
      Alert.alert('Error', getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.back}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Profile</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={styles.avatarWrap} onPress={() => setAvatarModal(true)} activeOpacity={0.9}>
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
          <TouchableOpacity onPress={() => setAvatarModal(true)}>
            <Text style={styles.changePhoto}>Edit avatar</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Full Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="Full name"
            placeholderTextColor="#999"
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
          />

          <DobPickerField
            label="Date of Birth *"
            value={dob}
            onChange={setDob}
            fallbackDate={maxDobDateForMinAge(25)}
          />

          <Text style={styles.label}>Gender *</Text>
          <View style={styles.segRow}>
            {(['male', 'female', 'other'] as const).map((g) => (
              <TouchableOpacity
                key={g}
                style={[styles.seg, gender === g && styles.segOn]}
                onPress={() => setGender(g)}
                activeOpacity={0.9}
              >
                <Text style={[styles.segTxt, gender === g && styles.segTxtOn]}>
                  {g === 'male' ? 'Male' : g === 'female' ? 'Female' : 'Other'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Interests (Select up to {MAX_INTERESTS})</Text>
          <View style={styles.chipGrid}>
            {CALLER_INTEREST_OPTIONS.map((opt) =>
              chip(opt, interests.includes(opt), () => setInterests((prev) => toggleInterest(prev, opt)))
            )}
          </View>
          <Text style={styles.counter}>
            {interests.length}/{MAX_INTERESTS} selected
          </Text>

          <Text style={styles.label}>State *</Text>
          <TouchableOpacity style={styles.select} onPress={() => setStateModal(true)} activeOpacity={0.85}>
            <Text style={styles.selectText}>{state}</Text>
            <Text style={styles.chev}>▼</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Languages (Select up to {MAX_LANGUAGES})</Text>
          <View style={styles.chipGrid}>
            {CALLER_LANGUAGE_OPTIONS.map((opt) =>
              chip(opt, languages.includes(opt), () => setLanguages((prev) => toggleLang(prev, opt)))
            )}
          </View>
          <Text style={styles.counter}>
            {languages.length}/{MAX_LANGUAGES} selected
          </Text>
        </ScrollView>

        <TouchableOpacity
          style={[styles.cta, submitting && styles.ctaDis]}
          onPress={() => void onSubmit()}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.ctaTxt}>Continue</Text>
          )}
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

      <Modal visible={avatarModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalDismiss} onPress={() => setAvatarModal(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select Avatar</Text>
            <ScrollView style={styles.modalList} keyboardShouldPersistTaps="handled">
              <View style={styles.avatarGrid}>
                {allowedAvatarPresets.map((avatarUrl) => {
                  const active = imageUri === avatarUrl;
                  return (
                    <TouchableOpacity
                      key={avatarUrl}
                      style={[styles.avatarCell, active && styles.avatarCellActive]}
                      onPress={() => {
                        setImageUri(avatarUrl);
                        setAvatarModal(false);
                      }}
                      activeOpacity={0.85}
                    >
                      <Image source={{ uri: avatarUrl }} style={styles.avatarThumb} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  backBtn: { padding: 10 },
  back: { fontSize: 22, color: '#111' },
  headerTitle: { fontSize: 17, fontWeight: '900', color: '#111' },
  scroll: { paddingHorizontal: 20, paddingBottom: 100 },
  avatarWrap: { alignSelf: 'center', marginTop: 4, marginBottom: 4 },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#e8e8e8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: { width: 100, height: 100, borderRadius: 50 },
  camera: { fontSize: 28 },
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
  cameraSmall: { color: '#fff', fontSize: 16, fontWeight: '800', marginTop: -2 },
  changePhoto: {
    alignSelf: 'center',
    color: PURPLE,
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 16,
  },
  label: { fontSize: 12, fontWeight: '700', color: '#333', marginBottom: 8, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: '#fafafa',
  },
  segRow: { flexDirection: 'row', gap: 8 },
  seg: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  segOn: { backgroundColor: PURPLE },
  segTxt: { fontSize: 13, fontWeight: '700', color: '#555' },
  segTxtOn: { color: '#fff' },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  chipSelected: { backgroundColor: PURPLE, borderColor: PURPLE },
  chipText: { fontSize: 13, fontWeight: '600', color: '#333' },
  chipTextSelected: { color: '#fff' },
  counter: { fontSize: 12, color: '#888', marginTop: 6, fontWeight: '600' },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: '#fafafa',
  },
  selectText: { fontSize: 15, fontWeight: '600', color: '#111' },
  chev: { fontSize: 12, color: '#888' },
  cta: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 24,
    backgroundColor: PURPLE,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  ctaDis: { opacity: 0.65 },
  ctaTxt: { color: '#fff', fontSize: 16, fontWeight: '900' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  modalDismiss: { ...StyleSheet.absoluteFillObject },
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
  modalList: { paddingHorizontal: 8 },
  stateRow: { paddingVertical: 14, paddingHorizontal: 14, borderRadius: 10 },
  stateRowActive: { backgroundColor: 'rgba(123,44,255,0.12)' },
  stateRowText: { fontSize: 15, color: '#222' },
  stateRowTextActive: { fontWeight: '700', color: PURPLE },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
    paddingBottom: 8,
  },
  avatarCell: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#e5e5e5',
  },
  avatarCellActive: {
    borderColor: PURPLE,
    borderWidth: 3,
  },
  avatarThumb: {
    width: '100%',
    height: '100%',
  },
});
