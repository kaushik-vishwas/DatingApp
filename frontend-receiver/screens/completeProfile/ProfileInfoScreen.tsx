import React, { useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { ToggleGroup } from '../../components/ui/ToggleGroup';
import { UploadField } from '../../components/ui/UploadField';
import { useAuth } from '../../context/AuthContext';
import { useCompleteProfile } from '../../context/CompleteProfileContext';
import { uploadToCloudinary } from '../../lib/cloudinary';
import { INTEREST_OPTIONS, LANGUAGE_OPTIONS } from '../../constants/profileOptions';
import {
  CALLER_FEMALE_AVATAR_PRESETS,
  INDIAN_STATES,
  toAvatarImageSource,
  toAvatarUri,
} from '../../constants/userOnboarding';
import type { CompleteProfileStackParamList } from '../../navigation/CompleteProfileStackParamList';
import { formatApiErrorForAlert, getResolvedApiBaseUrl, profileApi } from '../../services/api';
import type { Gender } from '../../types/user';
import { resolveProfileImageSource } from '../../utils/avatarSource';
import { shouldUploadProfileImageToCloudinary } from '../../utils/profileImageUrl';
import { validateProfileInfo } from '../../utils/completeProfileSteps';

type Props = NativeStackScreenProps<CompleteProfileStackParamList, 'ProfileInfo'>;

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

export default function ProfileInfoScreen({ navigation }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { state, update } = useCompleteProfile();
  const { applyServerUser, refreshUser } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [avatarModal, setAvatarModal] = useState(false);
  const [showStateSuggestions, setShowStateSuggestions] = useState(false);
  const [stateInput, setStateInput] = useState(state.state || '');

  const filteredStates = INDIAN_STATES.filter(s =>
    s.toLowerCase().includes(stateInput.toLowerCase())
  );

  const pickProfileImage = () => {
    setAvatarModal(true);
  };

  const handleStateInputChange = (text: string) => {
    setStateInput(text);
    update({ state: text });
    setShowStateSuggestions(text.length > 0);
  };

  const selectState = (selectedState: string) => {
    setStateInput(selectedState);
    update({ state: selectedState });
    setShowStateSuggestions(false);
  };

  const handleInterestsChange = (interests: string[]) => {
    if (interests.length <= 2) {
      update({ interests });
    } else {
      Alert.alert('Maximum Selection', 'You can select up to 2 interests only');
    }
  };

  const onNext = async () => {
    const err = validateProfileInfo(state);
    if (err) {
      Alert.alert('Validation', err);
      return;
    }
    if (!state.profileImageUri) {
      Alert.alert('Validation', 'Please add a profile picture');
      return;
    }
    setSubmitting(true);
    try {
      let profileImageUrl: string;
      // Metro turns require() avatars into http://192.168.x:8081/... — must upload, not save as-is.
      if (!shouldUploadProfileImageToCloudinary(state.profileImageUri)) {
        profileImageUrl = state.profileImageUri.trim();
      } else {
        try {
          profileImageUrl = (
            await uploadToCloudinary(state.profileImageUri, {
              mimeType: state.profileImageMime ?? 'image/jpeg',
              resourceType: 'image',
              fileName: 'profile.jpg',
            })
          ).secure_url;
        } catch (uploadErr: unknown) {
          Alert.alert(
            'Photo upload failed',
            `${formatApiErrorForAlert(uploadErr)}\n\nUploads go to Cloudinary (api.cloudinary.com). Preset photos are bundled in the app but still upload from the device — same as a gallery pick. Try Wi‑Fi, disable VPN, or check firewall to Cloudinary.`
          );
          return;
        }
      }

      const { data } = await profileApi.saveReceiverKycProfileInfo({
        name: state.displayName.trim(),
        profileImage: profileImageUrl,
        languages: state.languages,
        interests: state.interests,
        gender: state.gender!,
        state: state.state.trim(),
      });
      applyServerUser(data.user);
      await refreshUser();
      navigation.navigate('DocumentUpload');
    } catch (e: unknown) {
      const apiBase = getResolvedApiBaseUrl();
      Alert.alert(
        'Could not save step 1 (server)',
        `${formatApiErrorForAlert(e)}\n\nAPI base in this build:\n${apiBase}\n\nPATCH: /profile/receiver/kyc/profile-info\n\nIf login works but this fails, deploy the latest backend (KYC step routes). "Network request failed" with no HTTP status usually means the phone never reached the server (DNS, firewall, SSL, or wrong API URL in the release build).`
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.bg}>
      <View style={styles.card}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: Math.max(insets.top, 14) + 12, paddingBottom: Math.max(insets.bottom, 14) + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <ScreenHeader
            title="Complete Your Profile"
            subtitle="Step 1 of 3"
            navigation={navigation}
            showBack
          />
          <Text style={styles.lead}>All fieldsss are required to continue</Text>

          <UploadField
            label="Profile avatar *"
            uri={state.profileImageUri}
            mimeType={state.profileImageMime}
            imageSource={resolveProfileImageSource(state.profileImageUri)}
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

          {/* State Input with Autocomplete */}
          <View style={styles.stateInputContainer}>
            <Text style={styles.fieldLabel}>State *</Text>
            <TextInput
              style={styles.stateInput}
              placeholder="Type your state name"
              value={stateInput}
              onChangeText={handleStateInputChange}
              onFocus={() => setShowStateSuggestions(stateInput.length > 0)}
              autoCapitalize="words"
            />
            {showStateSuggestions && filteredStates.length > 0 && (
              <View style={styles.suggestionsContainer}>
                <ScrollView 
                  style={styles.suggestionsList}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                >
                  {filteredStates.map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={styles.suggestionItem}
                      onPress={() => selectState(s)}
                    >
                      <Text style={styles.suggestionText}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          <ToggleGroup
            label="Languages *"
            options={LANGUAGE_OPTIONS}
            selected={state.languages}
            onChange={(languages) => update({ languages })}
          />

          <ToggleGroup
            label="Interests * (Max 2)"
            options={INTEREST_OPTIONS}
            selected={state.interests}
            onChange={handleInterestsChange}
          />

          <Button title="Continue" onPress={() => void onNext()} loading={submitting} disabled={submitting} />
        </ScrollView>
      </View>

      <Modal visible={avatarModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalDismiss} onPress={() => setAvatarModal(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select Avatar</Text>
            <ScrollView style={styles.modalList} keyboardShouldPersistTaps="handled">
              <View style={styles.avatarGrid}>
                {CALLER_FEMALE_AVATAR_PRESETS.map((avatarUrl) => {
                  const avatarUri = toAvatarUri(avatarUrl);
                  const active = state.profileImageUri === avatarUri;
                  return (
                    <TouchableOpacity
                      key={avatarUri}
                      style={[styles.avatarCell, active && styles.avatarCellActive]}
                      onPress={() => {
                        update({ profileImageUri: avatarUri, profileImageMime: 'image/png' });
                        setAvatarModal(false);
                      }}
                      activeOpacity={0.85}
                    >
                    <Image source={toAvatarImageSource(avatarUrl)} style={styles.avatarThumb} />
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
    backgroundColor: '#f4f4f5',
  },
  card: {
    width: '100%',
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 0,
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
  stateInputContainer: {
    marginBottom: 18,
    position: 'relative',
    zIndex: 1,
  },
  stateInput: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    backgroundColor: '#fff',
  },
  suggestionsContainer: {
    position: 'absolute',
    top: 72,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    maxHeight: 200,
    zIndex: 1000,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  suggestionsList: {
    maxHeight: 200,
  },
  suggestionItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  suggestionText: {
    fontSize: 14,
    color: '#333',
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