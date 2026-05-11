import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
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
import {
  CALLER_FEMALE_AVATAR_PRESETS,
  toAvatarImageSource,
  toAvatarUri,
} from '../../constants/userOnboarding';
import { UploadField } from '../../components/ui/UploadField';
import { useAuth } from '../../context/AuthContext';
import { inferResourceType, uploadToCloudinary } from '../../lib/cloudinary';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import { getErrorMessage, profileApi } from '../../services/api';
import { resolveProfileImageSource } from '../../utils/avatarSource';
import { shouldUploadProfileImageToCloudinary } from '../../utils/profileImageUrl';
import type { RouteProp } from '@react-navigation/native';
import { useRoute } from '@react-navigation/native';

type Nav = NativeStackNavigationProp<ReceiverStackParamList, 'ReceiverEditProfile'>;
type PickedDocument = { uri: string; name?: string; mimeType?: string };

async function pickKycDocument(onPicked: (doc: PickedDocument) => void): Promise<void> {
  Alert.alert('Upload document', 'Choose source', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Photo library',
      onPress: async () => {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission', 'Photo library access is required.');
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.9,
        });
        if (result.canceled || !result.assets[0]) return;
        const a = result.assets[0];
        onPicked({
          uri: a.uri,
          name: a.fileName ?? 'document.jpg',
          mimeType: a.mimeType ?? 'image/jpeg',
        });
      },
    },
    {
      text: 'Document (PDF)',
      onPress: async () => {
        const result = await DocumentPicker.getDocumentAsync({
          type: ['application/pdf', 'image/*'],
          copyToCacheDirectory: true,
        });
        if (result.canceled || !result.assets[0]) return;
        const a = result.assets[0];
        onPicked({
          uri: a.uri,
          name: a.name ?? 'document.pdf',
          mimeType: a.mimeType ?? 'application/pdf',
        });
      },
    },
  ]);
}

async function ensureUploadedUrl(doc: PickedDocument, fileName: string): Promise<string> {
  const raw = doc.uri.trim();
  if (/^https:\/\//i.test(raw) && !shouldUploadProfileImageToCloudinary(raw)) return raw;
  try {
    const res = await uploadToCloudinary(raw, {
      mimeType: doc.mimeType,
      resourceType: inferResourceType(doc.mimeType ?? 'image/jpeg'),
      fileName: doc.name || fileName,
    });
    return res.secure_url;
  } catch {
    return raw;
  }
}

export default function ReceiverEditProfileScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<ReceiverStackParamList, 'ReceiverEditProfile'>>();
  const fromWithdrawKyc = Boolean(route.params?.fromWithdrawKyc);
  const { user, refreshUser } = useAuth();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(user?.name ?? '');
  const [stateValue, setStateValue] = useState(user?.state ?? '');
  const [languages, setLanguages] = useState<string[]>(user?.languages ?? []);
  const [interests, setInterests] = useState<string[]>(user?.interests ?? []);
  const [aadhaarNumber, setAadhaarNumber] = useState(String(user?.aadhaarNumber ?? ''));
  const [panNumber, setPanNumber] = useState(String(user?.panNumber ?? ''));
  const [aadhaarFront, setAadhaarFront] = useState<PickedDocument | null>(
    user?.aadhaarFront ? { uri: user.aadhaarFront, name: 'aadhaar-front' } : null
  );
  const [aadhaarBack, setAadhaarBack] = useState<PickedDocument | null>(
    user?.aadhaarBack ? { uri: user.aadhaarBack, name: 'aadhaar-back' } : null
  );
  const [panFront, setPanFront] = useState<PickedDocument | null>(
    user?.panFront ? { uri: user.panFront, name: 'pan-front' } : null
  );
  const [showSuccess, setShowSuccess] = useState(false);
  const [profileImageUri, setProfileImageUri] = useState<string | null>(user?.profileImage ?? null);
  const [avatarModal, setAvatarModal] = useState(false);
  const isWithdrawKycMode = fromWithdrawKyc;

  const onSave = async () => {
    const aadhaarDigits = aadhaarNumber.replace(/\D/g, '');
    const pan = panNumber.trim().toUpperCase();
    if (isWithdrawKycMode) {
      if (!/^\d{12}$/.test(aadhaarDigits)) {
        Alert.alert('Validation', 'Please enter a valid 12-digit Aadhaar number.');
        return;
      }
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
        Alert.alert('Validation', 'Please enter a valid PAN (example: ABCDE1234F).');
        return;
      }
      if (!aadhaarFront || !aadhaarBack || !panFront) {
        Alert.alert('Validation', 'Please upload Aadhaar front, Aadhaar back, and PAN front.');
        return;
      }
    } else {
      if (!name.trim()) {
        Alert.alert('Validation', 'Name is required.');
        return;
      }
      if (!profileImageUri) {
        Alert.alert('Validation', 'Please select an avatar.');
        return;
      }
      const allowedPreset = CALLER_FEMALE_AVATAR_PRESETS.some((p) => toAvatarUri(p) === profileImageUri);
      const isHttpsAvatar = /^https:\/\//i.test(profileImageUri.trim());
      if (!allowedPreset && !isHttpsAvatar) {
        Alert.alert('Validation', 'Please select one avatar from the available list.');
        return;
      }
    }
    setSaving(true);
    try {
      const aadhaarFrontUrl =
        isWithdrawKycMode && aadhaarFront ? await ensureUploadedUrl(aadhaarFront, 'aadhaar-front') : undefined;
      const aadhaarBackUrl =
        isWithdrawKycMode && aadhaarBack ? await ensureUploadedUrl(aadhaarBack, 'aadhaar-back') : undefined;
      const panFrontUrl =
        isWithdrawKycMode && panFront ? await ensureUploadedUrl(panFront, 'pan-front') : undefined;
      await profileApi.updateReceiverProfile({
        name: isWithdrawKycMode ? undefined : name.trim(),
        profileImage: isWithdrawKycMode ? undefined : profileImageUri?.trim(),
        state: isWithdrawKycMode ? undefined : stateValue.trim(),
        languages: isWithdrawKycMode ? undefined : languages,
        interests: isWithdrawKycMode ? undefined : interests,
        aadhaarNumber: isWithdrawKycMode ? aadhaarDigits : undefined,
        panNumber: isWithdrawKycMode ? pan : undefined,
        aadhaarFront: aadhaarFrontUrl,
        aadhaarBack: aadhaarBackUrl,
        panFront: panFrontUrl,
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
        <Text style={styles.headerTitle}>{isWithdrawKycMode ? 'Verify your identity' : 'Complete Your Profile'}</Text>
        <View style={styles.backBtn} />
      </View>

      <Text style={styles.subtitle}>
        {isWithdrawKycMode
          ? 'Upload your identity documents for withdrawal KYC.'
          : 'This information will be visible to users who want to call.'}
      </Text>

      {isWithdrawKycMode ? (
        <>
          <Field
            label="Aadhaar Number"
            value={aadhaarNumber}
            onChangeText={(v) => setAadhaarNumber(v.replace(/\D/g, '').slice(0, 12))}
            keyboardType="numeric"
          />
          <Field
            label="PAN Number"
            value={panNumber}
            onChangeText={(v) => setPanNumber(v.toUpperCase())}
          />
          <UploadField
            label="Aadhaar — front *"
            uri={aadhaarFront?.uri ?? null}
            mimeType={aadhaarFront?.mimeType}
            displayName={aadhaarFront?.name}
            imageShape="rectangle"
            onPick={() => void pickKycDocument(setAadhaarFront)}
            onClear={() => setAadhaarFront(null)}
            hint="PNG, JPG or PDF"
          />
          <UploadField
            label="Aadhaar — back *"
            uri={aadhaarBack?.uri ?? null}
            mimeType={aadhaarBack?.mimeType}
            displayName={aadhaarBack?.name}
            imageShape="rectangle"
            onPick={() => void pickKycDocument(setAadhaarBack)}
            onClear={() => setAadhaarBack(null)}
            hint="PNG, JPG or PDF"
          />
          <UploadField
            label="PAN — front *"
            uri={panFront?.uri ?? null}
            mimeType={panFront?.mimeType}
            displayName={panFront?.name}
            imageShape="rectangle"
            onPick={() => void pickKycDocument(setPanFront)}
            onClear={() => setPanFront(null)}
            hint="PNG, JPG or PDF"
          />
        </>
      ) : (
        <>
          <Text style={styles.fieldLabel}>Profile Avatar</Text>
          <View style={styles.photoWrap}>
            <TouchableOpacity style={styles.photoCircle} onPress={() => setAvatarModal(true)}>
              {profileImageUri ? (
              <Image
              source={resolveProfileImageSource(profileImageUri) ?? { uri: profileImageUri }}
              style={styles.photoImage}
            />
              ) : (
                <Text style={styles.photoPlaceholder}>📷</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setAvatarModal(true)}>
              <Text style={styles.photoAction}>Choose one of 30 girl avatars</Text>
            </TouchableOpacity>
          </View>

          <Field label="Display Name" value={name} onChangeText={setName} />
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
        </>
      )}

      <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} disabled={saving} onPress={onSave}>
        <Text style={styles.saveText}>{saving ? 'Saving...' : 'Continue'}</Text>
      </TouchableOpacity>

      {showSuccess ? (
        <View style={styles.successOverlay}>
          <View style={styles.successCard}>
            <Text style={styles.successTitle}>Congratulations</Text>
            <Text style={styles.successSub}>
              {fromWithdrawKyc ? 'Your identity details are saved.' : 'Your Profile is Updated!'}
            </Text>
            <TouchableOpacity
              style={styles.successBtn}
              onPress={() => {
                if (fromWithdrawKyc) {
                  navigation.replace('ReceiverBankDetails');
                } else {
                  if (user?.accountStatus === 'pending_profile') {
                    navigation.replace('ReceiverAutoVerification');
                  } else if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.replace('ReceiverHome');
                  }
                }
              }}
            >
              <Text style={styles.successBtnText}>{fromWithdrawKyc ? 'Continue' : 'Next'}</Text>
            </TouchableOpacity>
            {fromWithdrawKyc ? (
              <TouchableOpacity onPress={() => navigation.navigate('ReceiverProfilePreview')}>
                <Text style={styles.previewLink}>View Preview</Text>
              </TouchableOpacity>
            ) : null}
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
                {CALLER_FEMALE_AVATAR_PRESETS.map((preset) => {
                  const presetUri = toAvatarUri(preset);
                  const active = profileImageUri === presetUri;
                  return (
                    <TouchableOpacity
                      key={presetUri}
                      style={[styles.avatarCell, active && styles.avatarCellActive]}
                      onPress={() => {
                        setProfileImageUri(presetUri);
                        setAvatarModal(false);
                      }}
                      activeOpacity={0.85}
                    >
                     <Image source={toAvatarImageSource(preset)} style={styles.avatarThumb} />
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
