import React, { useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { ToggleGroup } from '../../components/ui/ToggleGroup';
import { UploadField } from '../../components/ui/UploadField';
import { useCompleteProfile } from '../../context/CompleteProfileContext';
import { INTEREST_OPTIONS, LANGUAGE_OPTIONS } from '../../constants/profileOptions';
import { CALLER_FEMALE_AVATAR_PRESETS, INDIAN_STATES } from '../../constants/userOnboarding';
import type { CompleteProfileStackParamList } from '../../navigation/CompleteProfileStackParamList';
import type { Gender } from '../../types/user';
import { validateProfileInfo } from '../../utils/completeProfileSteps';

type Props = NativeStackScreenProps<CompleteProfileStackParamList, 'ProfileInfo'>;

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

export default function ProfileInfoScreen({ navigation }: Props): React.JSX.Element {
  const { state, update } = useCompleteProfile();
  const [stateModal, setStateModal] = useState(false);
  const [avatarModal, setAvatarModal] = useState(false);

  const pickProfileImage = () => {
    setAvatarModal(true);
  };

  const onNext = () => {
    const err = validateProfileInfo(state);
    if (err) {
      Alert.alert('Validation', err);
      return;
    }
    navigation.navigate('DocumentUpload');
  };

  return (
    <View style={styles.bg}>
      <View style={styles.card}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ScreenHeader
            title="Complete Yoaaur Profile"
            subtitle="Step 1 of 3"
            navigation={navigation}
            showBack
          />
          <Text style={styles.lead}>All fields are required to continue</Text>

          <UploadField
            label="Profile avatar *"
            uri={state.profileImageUri}
            mimeType={state.profileImageMime}
            onPick={pickProfileImage}
            onClear={() => update({ profileImageUri: null, profileImageMime: null })}
            hint="Select one female avatar from the list"
          />

          <Input
            label="Display name *"
            value={state.displayName}
            onChangeText={(t) => update({ displayName: t })}
            placeholder="How should users call you?"
            autoCapitalize="words"
          />

          <Text style={styles.fieldLabel}>Gender *</Text>
          <View style={styles.segmentWrap}>
            {GENDERS.map(({ value, label }) => (
              <TouchableOpacity
                key={value}
                style={[styles.segment, state.gender === value && styles.segmentActive]}
                onPress={() => update({ gender: value })}
                activeOpacity={0.85}
              >
                <Text
                  style={[styles.segmentText, state.gender === value && styles.segmentTextActive]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>State *</Text>
          <TouchableOpacity style={styles.stateSelect} onPress={() => setStateModal(true)} activeOpacity={0.85}>
            <Text style={state.state.trim() ? styles.stateSelectText : styles.stateSelectPh}>
              {state.state.trim() || 'Tap to select state'}
            </Text>
            <Text style={styles.stateChev}>▼</Text>
          </TouchableOpacity>

          <ToggleGroup
            label="Languages *"
            options={LANGUAGE_OPTIONS}
            selected={state.languages}
            onChange={(languages) => update({ languages })}
          />

          <ToggleGroup
            label="Interests *"
            options={INTEREST_OPTIONS}
            selected={state.interests}
            onChange={(interests) => update({ interests })}
          />

          <Button title="Continue" onPress={onNext} />
        </ScrollView>
      </View>

      <Modal visible={stateModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalDismiss} onPress={() => setStateModal(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select State</Text>
            <ScrollView style={styles.modalList} keyboardShouldPersistTaps="handled">
              {INDIAN_STATES.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.stateRow, s === state.state && styles.stateRowActive]}
                  onPress={() => {
                    update({ state: s });
                    setStateModal(false);
                  }}
                >
                  <Text style={[styles.stateRowText, s === state.state && styles.stateRowTextActive]}>{s}</Text>
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
                {CALLER_FEMALE_AVATAR_PRESETS.map((avatarUrl) => {
                  const active = state.profileImageUri === avatarUrl;
                  return (
                    <TouchableOpacity
                      key={avatarUrl}
                      style={[styles.avatarCell, active && styles.avatarCellActive]}
                      onPress={() => {
                        update({ profileImageUri: avatarUrl, profileImageMime: null });
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
    </View>
  );
}

const PURPLE = '#7b2cff';

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: '#262626',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  lead: {
    fontSize: 13,
    color: '#666',
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  segmentWrap: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  segmentActive: {
    borderColor: PURPLE,
    backgroundColor: 'rgba(123,44,255,0.08)',
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#555',
  },
  segmentTextActive: {
    color: PURPLE,
  },
  stateSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: '#fff',
    marginBottom: 18,
  },
  stateSelectText: { fontSize: 15, fontWeight: '600', color: '#111' },
  stateSelectPh: { fontSize: 15, color: '#999' },
  stateChev: { fontSize: 12, color: '#888' },
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
  modalList: { paddingHorizontal: 8 },
  stateRow: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
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
