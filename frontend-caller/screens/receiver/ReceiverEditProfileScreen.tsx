import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { CALLER_FEMALE_AVATAR_PRESETS, isCallerAvatarPresetId } from '../../constants/userOnboarding';
import { useAuth } from '../../context/AuthContext';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import { getErrorMessage, profileApi } from '../../services/api';
import { resolveProfileImageSource } from '../../utils/avatarSource';

type Nav = NativeStackNavigationProp<ReceiverStackParamList, 'ReceiverEditProfile'>;

export default function ReceiverEditProfileScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const { user, refreshUser } = useAuth();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(user?.name ?? '');
  const [stateValue, setStateValue] = useState(user?.state ?? '');
  const [languages, setLanguages] = useState<string[]>(user?.languages ?? []);
  const [interests, setInterests] = useState<string[]>(user?.interests ?? []);
  const [showSuccess, setShowSuccess] = useState(false);
  const [profileImageUri, setProfileImageUri] = useState<string | null>(user?.profileImage ?? null);
  const [avatarModal, setAvatarModal] = useState(false);

  const allowedFemaleAvatarIds = CALLER_FEMALE_AVATAR_PRESETS.map((preset) => preset.id);
  const profileImageSource = resolveProfileImageSource(profileImageUri);

  const onSave = async () => {
    if (!name.trim()) {
      Alert.alert('Validation', 'Name is required.');
      return;
    }
    if (!profileImageUri) {
      Alert.alert('Validation', 'Please select an avatar.');
      return;
    }
    if (isCallerAvatarPresetId(profileImageUri) && !allowedFemaleAvatarIds.includes(profileImageUri)) {
      Alert.alert('Validation', 'Please select one avatar from the available list.');
      return;
    }
    setSaving(true);
    try {
      await profileApi.updateReceiverProfile({
        name: name.trim(),
        profileImage: profileImageUri.trim(),
        state: stateValue.trim(),
        languages,
        interests,
      });
      await refreshUser();
      setShowSuccess(true);
    } catch (e) {
      Alert.alert('Update failed', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Your Profile</Text>
        <View style={styles.backBtn} />
      </View>

      <Text style={styles.title}>Edit Your Profile</Text>
      <Text style={styles.subtitle}>This information will be visible to users who want to call.</Text>

      <Text style={styles.fieldLabel}>Profile Avatar</Text>
      <View style={styles.photoWrap}>
        <TouchableOpacity style={styles.photoCircle} onPress={() => setAvatarModal(true)}>
          {profileImageUri ? (
            profileImageSource ? <Image source={profileImageSource} style={styles.photoImage} /> : <Text style={styles.photoPlaceholder}>📷</Text>
          ) : (
            <Text style={styles.photoPlaceholder}>📷</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setAvatarModal(true)}>
          <Text style={styles.photoAction}>Choose one of 30 girl avatars</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.fieldLabel}>Display Name</Text>
      <Field label="Full Name" value={name} onChangeText={setName} />
      <Field label="State" value={stateValue} onChangeText={setStateValue} />

      <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Languages You Speak (select up to 2)</Text>
      <ChipGroup
        options={['English', 'Hindi', 'Tamil', 'Telugu', 'Malayalam', 'Kannada', 'Bengali', 'Marathi']}
        selected={languages}
        max={2}
        onChange={setLanguages}
      />

      <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Your interests (select up to 3)</Text>
      <ChipGroup
        options={['Technology', 'Movies', 'Music', 'Travel', 'Cooking', 'Sports', 'Books', 'Gaming', 'Art', 'Fashion']}
        selected={interests}
        max={3}
        onChange={setInterests}
      />

      <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} disabled={saving} onPress={onSave}>
        <Text style={styles.saveText}>{saving ? 'Saving...' : 'Continue'}</Text>
      </TouchableOpacity>

      {showSuccess ? (
        <View style={styles.successOverlay}>
          <View style={styles.successCard}>
            <Text style={styles.successTitle}>Congratulations</Text>
            <Text style={styles.successSub}>Your Profile is Updated!</Text>
            <TouchableOpacity style={styles.successBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.successBtnText}>Go Back</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('ReceiverProfilePreview')}>
              <Text style={styles.previewLink}>View Preview</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
      </ScrollView>
      </KeyboardAvoidingView>
      <Modal visible={avatarModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalDismiss} onPress={() => setAvatarModal(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select Avatar</Text>
            <ScrollView style={styles.modalList} keyboardShouldPersistTaps="handled">
              <View style={styles.avatarGrid}>
                {CALLER_FEMALE_AVATAR_PRESETS.map((avatarPreset) => {
                  const active = profileImageUri === avatarPreset.id;
                  return (
                    <TouchableOpacity
                      key={avatarPreset.id}
                      style={[styles.avatarCell, active && styles.avatarCellActive]}
                      onPress={() => {
                        setProfileImageUri(avatarPreset.id);
                        setAvatarModal(false);
                      }}
                      activeOpacity={0.85}
                    >
                      <Image source={avatarPreset.source} style={styles.avatarThumb} />
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

function Field({
  label,
  value,
  onChangeText,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: 'default' | 'numeric';
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType ?? 'default'}
        placeholder={label}
        placeholderTextColor="#aaa"
      />
    </View>
  );
}

function ChipGroup({
  options,
  selected,
  max,
  onChange,
}: {
  options: string[];
  selected: string[];
  max: number;
  onChange: (next: string[]) => void;
}) {
  return (
    <View style={styles.chipWrap}>
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <TouchableOpacity
            key={opt}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => {
              if (active) {
                onChange(selected.filter((x) => x !== opt));
                return;
              }
              if (selected.length >= max) return;
              onChange([...selected, opt]);
            }}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f7f7f8' },
  screen: { flex: 1, backgroundColor: '#f7f7f8' },
  content: { padding: 16, paddingBottom: 36 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  backBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 20, color: '#111', fontWeight: '700' },
  headerTitle: { fontSize: 16, color: '#111', fontWeight: '900' },
  title: { fontSize: 24, color: '#111', fontWeight: '900', marginBottom: 6 },
  subtitle: { fontSize: 12, color: '#888', fontWeight: '600', marginBottom: 12 },
  fieldWrap: { marginBottom: 10 },
  fieldLabel: { fontSize: 12, color: '#666', fontWeight: '700', marginBottom: 6 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e7e7e7',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111',
    fontWeight: '600',
  },
  saveBtn: {
    marginTop: 12,
    borderRadius: 10,
    backgroundColor: '#7b2cff',
    paddingVertical: 13,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 14,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipActive: { borderColor: '#7b2cff', backgroundColor: '#f5ecff' },
  chipText: { fontSize: 11, color: '#666', fontWeight: '700' },
  chipTextActive: { color: '#7b2cff' },
  photoWrap: { alignItems: 'center', marginBottom: 10 },
  photoCircle: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e6e6e6',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoImage: { width: '100%', height: '100%' },
  photoPlaceholder: { fontSize: 24, color: '#7b2cff' },
  photoAction: { marginTop: 6, fontSize: 11, color: '#999', fontWeight: '600' },
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
    borderColor: '#7b2cff',
    borderWidth: 3,
  },
  avatarThumb: {
    width: '100%',
    height: '100%',
  },
  successOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  successCard: {
    width: '100%',
    maxWidth: 300,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ececec',
    padding: 16,
    alignItems: 'center',
  },
  successTitle: { fontSize: 18, color: '#111', fontWeight: '900' },
  successSub: { marginTop: 8, fontSize: 12, color: '#666', fontWeight: '600' },
  successBtn: {
    marginTop: 12,
    backgroundColor: '#7b2cff',
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 24,
  },
  successBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  previewLink: { marginTop: 8, color: '#7b2cff', fontSize: 12, fontWeight: '700' },
});
