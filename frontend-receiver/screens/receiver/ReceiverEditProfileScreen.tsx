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
import { LinearGradient } from 'expo-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import {
  getCallerAvatarPresetsByGender,
  isAllowedCallerAvatarUri,
} from '../../constants/userOnboarding';
import { UploadField } from '../../components/ui/UploadField';
import { useAuth } from '../../context/AuthContext';
import { inferResourceType, uploadToCloudinary } from '../../lib/cloudinary';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import { authApi, getErrorMessage, profileApi } from '../../services/api';
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
  const { user, refreshUser, signOut } = useAuth();
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

  // Check if all required fields are filled (non-KYC mode only)
  const isProfileComplete = () => {
    if (isWithdrawKycMode) return true;
    
    const hasName = name && name.trim().length > 0;
    const hasState = stateValue && stateValue.trim().length > 0;
    const hasLanguages = languages.length > 0;
    const hasInterests = interests.length > 0;
    const hasAvatar = profileImageUri && profileImageUri.trim().length > 0;
    
    return hasName && hasState && hasLanguages && hasInterests && hasAvatar;
  };

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
      // Validate all fields are filled
      if (!name.trim()) {
        Alert.alert('Validation', 'Please enter your display name.');
        return;
      }
      if (!stateValue.trim()) {
        Alert.alert('Validation', 'Please enter your state.');
        return;
      }
      if (languages.length === 0) {
        Alert.alert('Validation', 'Please select at least one language.');
        return;
      }
      if (interests.length === 0) {
        Alert.alert('Validation', 'Please select at least one interest.');
        return;
      }
      if (!profileImageUri) {
        Alert.alert('Validation', 'Please select an avatar.');
        return;
      }
      const allowedPreset = isAllowedCallerAvatarUri(profileImageUri, user?.gender ?? null);
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
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
       {/* Header */}
<View style={styles.header}>
<TouchableOpacity 
  onPress={() => {
    // Just go back - no sign out
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace('ReceiverHome');
    }
  }} 
  style={styles.backBtn}
>
  <Icon name="chevron-left" size={26} color="#1a1a1a" />
</TouchableOpacity>
  <Text style={styles.headerTitle}>
    {isWithdrawKycMode ? 'Verify Identity' : 'Complete Profile'}
  </Text>
  <View style={styles.placeholder} />
</View>

          {/* Subtitle */}
          <Text style={styles.subtitle}>
            {isWithdrawKycMode
              ? 'Upload your identity documents for withdrawal verification'
              : 'All fields are required to complete your profile'}
          </Text>

          {isWithdrawKycMode ? (
            /* KYC Mode Fields */
            <View style={styles.formSection}>
              <Field
                label="Aadhaar Number"
                value={aadhaarNumber}
                onChangeText={(v) => setAadhaarNumber(v.replace(/\D/g, '').slice(0, 12))}
                keyboardType="numeric"
                placeholder="Enter 12-digit Aadhaar number"
                required
              />
              <Field
                label="PAN Number"
                value={panNumber}
                onChangeText={(v) => setPanNumber(v.toUpperCase())}
                placeholder="Enter PAN number (e.g., ABCDE1234F)"
                required
              />
              <UploadField
                label="Aadhaar (Front)"
                uri={aadhaarFront?.uri ?? null}
                mimeType={aadhaarFront?.mimeType}
                displayName={aadhaarFront?.name}
                imageShape="rectangle"
                onPick={() => void pickKycDocument(setAadhaarFront)}
                onClear={() => setAadhaarFront(null)}
                hint="PNG, JPG or PDF"
              />
              <UploadField
                label="Aadhaar (Back)"
                uri={aadhaarBack?.uri ?? null}
                mimeType={aadhaarBack?.mimeType}
                displayName={aadhaarBack?.name}
                imageShape="rectangle"
                onPick={() => void pickKycDocument(setAadhaarBack)}
                onClear={() => setAadhaarBack(null)}
                hint="PNG, JPG or PDF"
              />
              <UploadField
                label="PAN Card (Front)"
                uri={panFront?.uri ?? null}
                mimeType={panFront?.mimeType}
                displayName={panFront?.name}
                imageShape="rectangle"
                onPick={() => void pickKycDocument(setPanFront)}
                onClear={() => setPanFront(null)}
                hint="PNG, JPG or PDF"
              />
            </View>
          ) : (
            /* Profile Mode Fields */
            <View style={styles.formSection}>
              {/* Avatar Selection */}
              <Text style={styles.fieldLabel}>Profile Avatar <Text style={styles.requiredStar}>*</Text></Text>
              <View style={styles.photoWrap}>
                <TouchableOpacity style={styles.photoCircle} onPress={() => setAvatarModal(true)} activeOpacity={0.8}>
                  {profileImageUri ? (
                    (() => {
                      const src = resolveProfileImageSource(profileImageUri);
                      return src ? (
                        <Image source={src} style={styles.photoImage} />
                      ) : (
                        <Icon name="camera" size={32} color="#A855F7" />
                      );
                    })()
                  ) : (
                    <Icon name="camera" size={32} color="#A855F7" />
                  )}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setAvatarModal(true)} activeOpacity={0.7}>
                  <Text style={styles.photoAction}>Choose Avatar</Text>
                </TouchableOpacity>
              </View>

              <Field 
                label="Display Name" 
                value={name} 
                onChangeText={setName} 
                placeholder="Enter your display name"
                required
              />
              
              <Field 
                label="State" 
                value={stateValue} 
                onChangeText={setStateValue} 
                placeholder="Enter your state"
                required
              />

              {/* Languages */}
              <Text style={styles.fieldLabel}>Languages <Text style={styles.requiredStar}>*</Text> (max 4)</Text>
              <ChipGroup
                options={['English', 'Hindi', 'Tamil', 'Telugu', 'Malayalam', 'Kannada', 'Bengali', 'Marathi']}
                selected={languages}
                max={4}
                onChange={setLanguages}
              />

              {/* Interests */}
              <Text style={styles.fieldLabel}>Interests <Text style={styles.requiredStar}>*</Text> (max 3)</Text>
              <ChipGroup
                options={['Technology', 'Movies', 'Music', 'Travel', 'Cooking', 'Sports', 'Books', 'Gaming', 'Art', 'Fashion']}
                selected={interests}
                max={3}
                onChange={setInterests}
              />
            </View>
          )}

          {/* Save/Continue Button */}
          <TouchableOpacity
            style={[
              styles.saveBtnWrapper, 
              (saving || (!isWithdrawKycMode && !isProfileComplete())) && styles.saveBtnDisabled
            ]}
            disabled={saving || (!isWithdrawKycMode && !isProfileComplete())}
            onPress={onSave}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#7F00FF', '#A855F7', '#E100FF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.saveBtn}
            >
              <Text style={styles.saveText}>
                {saving ? 'Saving...' : (isWithdrawKycMode ? 'Verify & Continue' : 'Continue')}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Success Modal */}
          {showSuccess ? (
  <View style={styles.successOverlay}>
    <View style={styles.successCard}>
      <View style={styles.successIconContainer}>
        <Text style={styles.successIcon}>✓</Text>
      </View>
      <Text style={styles.successTitle}>Success!</Text>
      <Text style={styles.successSub}>
        {isWithdrawKycMode ? 'Identity verified successfully' : 'Profile updated successfully'}
      </Text>
      <TouchableOpacity
  style={styles.successBtn}
  onPress={async () => {
    setShowSuccess(false);
    
    if (fromWithdrawKyc) {
      navigation.replace('ReceiverBankDetails');
    } else {
      // ALWAYS go back - no audio verification check
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.replace('ReceiverHome');
      }
    }
  }}
  activeOpacity={0.8}
>
  <LinearGradient
    colors={['#7F00FF', '#A855F7', '#E100FF']}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 0 }}
    style={styles.successBtnGradient}
  >
    <Text style={styles.successBtnText}>{fromWithdrawKyc ? 'Continue to Bank' : 'Done'}</Text>
  </LinearGradient>
</TouchableOpacity>
    </View>
  </View>
) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Avatar Modal */}
      <Modal visible={avatarModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalDismiss} onPress={() => setAvatarModal(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose Avatar</Text>
              <TouchableOpacity onPress={() => setAvatarModal(false)} style={styles.closeBtn} activeOpacity={0.7}>
                <Icon name="x" size={20} color="#666" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
              <View style={styles.avatarGrid}>
                {getCallerAvatarPresetsByGender(
                  user?.gender === 'male' || user?.gender === 'female' ? user.gender : 'female'
                ).map((preset) => {
                  const presetUri = preset.id;
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
                      <Image source={preset.source} style={styles.avatarThumb} />
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
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: 'default' | 'numeric';
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}{required && <Text style={styles.requiredStar}> *</Text>}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType ?? 'default'}
        placeholder={placeholder || label}
        placeholderTextColor="#999"
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
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F9FA' },
  screen: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 8 },


  placeholder: {
    width: 40,
    height: 40,
  },
  
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    marginBottom: 20,
    paddingVertical: 8,
  },
  backBtn: { 
    width: 40, 
    height: 40, 
    alignItems: 'center', 
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTitle: { 
    fontSize: 18, 
    color: '#1a1a1a', 
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: { 
    fontSize: 13, 
    color: '#888', 
    marginBottom: 24,
    lineHeight: 18,
    letterSpacing: -0.2,
  },
  
  formSection: {
    marginBottom: 8,
  },
  
  fieldWrap: { 
    marginBottom: 16,
  },
  fieldLabel: { 
    fontSize: 13, 
    color: '#444', 
    fontWeight: '600', 
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  requiredStar: {
    color: '#E53935',
    fontSize: 13,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E8E8',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  
  saveBtnWrapper: {
    marginTop: 24,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#7F00FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnDisabled: { 
    opacity: 0.6,
  },
  saveText: { 
    color: '#FFFFFF', 
    fontSize: 15, 
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  
  chipWrap: { 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    gap: 10,
    marginTop: 4,
    marginBottom: 16,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: { 
    borderColor: '#A855F7', 
    backgroundColor: '#F3E8FF',
  },
  chipText: { 
    fontSize: 12, 
    color: '#666', 
    fontWeight: '600',
  },
  chipTextActive: { 
    color: '#A855F7',
  },
  
  photoWrap: { 
    alignItems: 'center', 
    marginBottom: 24,
  },
  photoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E8E8E8',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  photoImage: { 
    width: '100%', 
    height: '100%' 
  },
  photoAction: { 
    marginTop: 10, 
    fontSize: 12, 
    color: '#A855F7', 
    fontWeight: '600',
  },
  
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalDismiss: { 
    ...StyleSheet.absoluteFillObject 
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    maxHeight: '70%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalList: { 
    padding: 16,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  avatarCell: {
    width: 74,
    height: 74,
    borderRadius: 37,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#F0F0F0',
  },
  avatarCellActive: {
    borderColor: '#A855F7',
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  successCard: {
    width: '100%',
    maxWidth: 280,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  successIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successIcon: {
    fontSize: 32,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  successTitle: { 
    fontSize: 20, 
    color: '#1a1a1a', 
    fontWeight: '800',
    marginBottom: 8,
  },
  successSub: { 
    fontSize: 13, 
    color: '#666', 
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  successBtn: {
    borderRadius: 12,
    overflow: 'hidden',
    width: '100%',
  },
  successBtnGradient: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  successBtnText: { 
    color: '#FFFFFF', 
    fontSize: 14, 
    fontWeight: '700',
  },
});