import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { LinearGradient } from 'expo-linear-gradient';

import { getCallerAvatarPresetsByGender, toAvatarImageSource, toAvatarUri } from '../../constants/userOnboarding';
import { resolveProfileImageSource } from '../../utils/avatarSource';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';
import { useAuth } from '../../context/AuthContext';
import { profileApi, getErrorMessage } from '../../services/api';
import type { Gender } from '../../types/user';

type Nav = NativeStackNavigationProp<ReceiverStackParamList, 'ReceiverCreateProfile'>;
type Props = NativeStackScreenProps<ReceiverStackParamList, 'ReceiverCreateProfile'>;

type EarnStep = {
  title: string;
  subtitle: string;
  bullets: string[];
};

const EARN_STEPS: EarnStep[] = [
  {
    title: '💰 How You Earn',
    subtitle: 'Your earnings depend on call duration & timing',
    bullets: [
      'Calls under 55 seconds = 0 earnings ❌',
      'Calls 3-10 minutes = 3x score multiplier',
      'Calls above 10 minutes = 5x score multiplier',
      'Longer calls = much higher earnings!',
    ],
  },
  {
    title: '⏰ Best Time to Earn',
    subtitle: 'Extra bonuses during night hours',
    bullets: [
      'Day time (9 AM - 9 PM): 0.5x multiplier',
      'Night (10 PM - 12 AM): 3x multiplier 🎉',
      'Late night (12 AM - 2 AM): 10x multiplier 🔥',
      'Best earning: Take calls after 10 PM!',
    ],
  },
  {
    title: '🏆 Badge Levels',
    subtitle: 'Higher badge = higher pay per minute',
    bullets: [
      'Bronze (1+ score): ₹1.3/min',
      'Silver (1648+ score): ₹1.5/min',
      'Gold (10403+ score): ₹1.7/min',
      'Pro (16686+ score): ₹1.9/min',
      'Platinum (below 8000): ₹2.0/min',
      'Diamond (8000-12000): ₹2.3/min',
      'Supreme (12000+): ₹2.6/min 👑',
    ],
  },
  {
    title: '💬 Phone Etiquette',
    subtitle: 'Best practices for great conversations',
    bullets: [
      'Stay respectful and professional.',
      'Listen actively to customer needs.',
      'Keep conversations appropriate.',
      'Never share personal contact info.',
      'Report inappropriate behavior.',
      'Respond quickly to incoming calls.',
      'Build relationships for repeat customers.',
    ],
  },
  {
    title: '⭐ Pro Tips',
    subtitle: 'Maximize your daily earnings',
    bullets: [
      'Talk for 10+ minutes to get 5x points',
      'Be active after 10 PM for bonus multipliers',
      'Avoid calls shorter than 55 seconds',
      'Higher score = better badge = more ₹ per minute',
      'Consistent earnings = reach Supreme level!',
    ],
  },
];

type TabId = 'details' | 'earn';

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.requiredStar}> *</Text> : null}
      </Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
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

export default function ReceiverCreateProfileScreen({ route }: Props): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const { user, applyServerUser } = useAuth();
  const selectedGender: Gender | null =
    (route.params?.gender as Gender | null) ?? ((user?.gender as Gender | null) ?? null);

  const [tab, setTab] = useState<TabId>('details');
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const [name, setName] = useState(user?.name ?? '');
  const [stateValue, setStateValue] = useState(user?.state ?? '');
  const [languages, setLanguages] = useState<string[]>(user?.languages ?? []);
  const [interests, setInterests] = useState<string[]>(user?.interests ?? []);
  const [profileImageUri, setProfileImageUri] = useState<string | null>(user?.profileImage ?? null);

  const [avatarModal, setAvatarModal] = useState(false);

  const avatarPresets = useMemo(() => {
    if (!selectedGender) return [];
    return getCallerAvatarPresetsByGender(selectedGender);
  }, [selectedGender]);

  const isProfileComplete = useMemo(() => {
    const hasName = name && name.trim().length > 0;
    const hasState = stateValue && stateValue.trim().length > 0;
    const hasLanguages = languages.length > 0;
    const hasInterests = interests.length > 0;
    const hasAvatar = profileImageUri && profileImageUri.trim().length > 0;
    return hasName && hasState && hasLanguages && hasInterests && hasAvatar;
  }, [name, stateValue, languages, interests, profileImageUri]);

  const onSave = async (): Promise<void> => {
    if (!selectedGender) {
      Alert.alert('Select gender', 'Please go back and select your gender first.');
      return;
    }

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
    
    // Fixed: Using avatarPresets instead of undefined CALLER_FEMALE_AVATAR_PRESETS
    const allowedPreset = avatarPresets.some((p) => toAvatarUri(p) === profileImageUri);
    const isHttpsAvatar = /^https:\/\//i.test(profileImageUri.trim());
    if (!allowedPreset && !isHttpsAvatar) {
      Alert.alert('Validation', 'Please select one avatar from the available list.');
      return;
    }

    setSaving(true);
    try {
      const { data } = await profileApi.updateReceiverProfile({
        name: name.trim(),
        profileImage: profileImageUri.trim(),
        state: stateValue.trim(),
        languages,
        interests,
        gender: selectedGender,
      });
      applyServerUser(data.user);
      setShowSuccess(true);
    } catch (e) {
      Alert.alert('Update failed', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const onDone = async (): Promise<void> => {
    navigation.replace('ReceiverAutoVerification');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {tab === 'earn' ? (
          <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.replace('ReceiverSelectGender')} style={styles.backBtn}>
                <Icon name="chevron-left" size={26} color="#1a1a1a" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Create Profile</Text>
              <View style={styles.placeholder} />
            </View>

            <Text style={styles.subtitle}>
              How you earn as a receiver. Finish your details in the Details tab and then verify your voice.
            </Text>

            <View style={styles.tabWrap}>
              <TouchableOpacity
                onPress={() => setTab('details')}
                style={[styles.tabBtn, tab === 'details' && styles.tabBtnActive]}
                activeOpacity={0.9}
              >
                <Text style={[styles.tabText, tab === 'details' && styles.tabTextActive]}>Details</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setTab('earn')}
                style={[styles.tabBtn, tab === 'earn' && styles.tabBtnActive]}
                activeOpacity={0.9}
              >
                <Text style={[styles.tabText, tab === 'earn' && styles.tabTextActive]}>How to Earn</Text>
              </TouchableOpacity>
            </View>

            <View style={{ gap: 16, marginTop: 16, paddingBottom: 40 }}>
              {EARN_STEPS.map((s, idx) => (
                <View key={idx} style={styles.earnCard}>
                  <Text style={styles.earnTitle}>{s.title}</Text>
                  <Text style={styles.earnSub}>{s.subtitle}</Text>
                  <View style={styles.earnBullets}>
                    {s.bullets.map((b, i) => (
                      <View key={i} style={styles.earnBulletRow}>
                        <Text style={styles.earnDot}>•</Text>
                        <Text style={styles.earnBulletText}>{b}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        ) : (
          <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.replace('ReceiverSelectGender')} style={styles.backBtn}>
                <Icon name="chevron-left" size={26} color="#1a1a1a" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Create Profile</Text>
              <View style={styles.placeholder} />
            </View>

            <Text style={styles.subtitle}>Add your profile details, then we’ll verify your voice.</Text>

            <View style={styles.tabWrap}>
              <TouchableOpacity
                onPress={() => setTab('details')}
                style={[styles.tabBtn, tab === 'details' && styles.tabBtnActive]}
                activeOpacity={0.9}
              >
                <Text style={[styles.tabText, tab === 'details' && styles.tabTextActive]}>Details</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setTab('earn')}
                style={[styles.tabBtn, tab === 'earn' && styles.tabBtnActive]}
                activeOpacity={0.9}
              >
                <Text style={[styles.tabText, tab === 'earn' && styles.tabTextActive]}>How to Earn</Text>
              </TouchableOpacity>
            </View>

            {/* Avatar Selection */}
            <View style={styles.formSection}>
              <Text style={styles.fieldLabel}>
                Profile Avatar <Text style={styles.requiredStar}>*</Text>
              </Text>
              <View style={styles.photoWrap}>
                <TouchableOpacity
                  style={styles.photoCircle}
                  onPress={() => setAvatarModal(true)}
                  activeOpacity={0.8}
                >
                  {profileImageUri ? (
                    <Image
                      source={resolveProfileImageSource(profileImageUri) ?? { uri: profileImageUri }}
                      style={styles.photoImage}
                    />
                  ) : (
                    <Icon name="camera" size={32} color="#A855F7" />
                  )}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setAvatarModal(true)} activeOpacity={0.7}>
                  <Text style={styles.photoAction}>Choose Avatar</Text>
                </TouchableOpacity>
              </View>

              <Field label="Display Name" value={name} onChangeText={setName} placeholder="Enter your display name" required />

              <Field label="State" value={stateValue} onChangeText={setStateValue} placeholder="Enter your state" required />

              <Text style={styles.fieldLabel}>
                Languages <Text style={styles.requiredStar}>*</Text> (max 4)
              </Text>
              <ChipGroup
                options={['English', 'Hindi', 'Tamil', 'Telugu', 'Malayalam', 'Kannada', 'Bengali', 'Marathi']}
                selected={languages}
                max={4}
                onChange={setLanguages}
              />

              <Text style={styles.fieldLabel}>
                Interests <Text style={styles.requiredStar}>*</Text> (max 3)
              </Text>
              <ChipGroup
                options={['Technology', 'Movies', 'Music', 'Travel', 'Cooking', 'Sports', 'Books', 'Gaming', 'Art', 'Fashion']}
                selected={interests}
                max={3}
                onChange={setInterests}
              />
            </View>

            {/* Save Button */}
            <TouchableOpacity
              style={[styles.saveBtnWrapper, (saving || !isProfileComplete) && styles.saveBtnDisabled]}
              disabled={saving || !isProfileComplete}
              onPress={() => void onSave()}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#7F00FF', '#A855F7', '#E100FF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.saveBtn}
              >
                <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save & Verify Voice'}</Text>
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
                  <Text style={styles.successSub}>Profile updated successfully. Now verify your voice.</Text>
                  <TouchableOpacity style={styles.successBtn} onPress={() => void onDone()} activeOpacity={0.8}>
                    <LinearGradient
                      colors={['#7F00FF', '#A855F7', '#E100FF']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.successBtnGradient}
                    >
                      <Text style={styles.successBtnText}>Continue</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </ScrollView>
        )}

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
                  {avatarPresets.map((preset) => {
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F9FA' },
  screen: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 8 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
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
  placeholder: { width: 40, height: 40 },

  subtitle: {
    fontSize: 13,
    color: '#888',
    marginBottom: 18,
    lineHeight: 18,
    letterSpacing: -0.2,
  },

  tabWrap: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  tabBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabBtnActive: { borderColor: '#A855F7', backgroundColor: '#F3E8FF' },
  tabText: { fontSize: 13, fontWeight: '800', color: '#666' },
  tabTextActive: { color: '#A855F7' },

  formSection: { marginBottom: 8 },

  fieldWrap: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, color: '#444', fontWeight: '600', marginBottom: 8, letterSpacing: -0.2 },
  requiredStar: { color: '#E53935', fontSize: 13 },
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

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4, marginBottom: 16 },
  chip: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: { borderColor: '#A855F7', backgroundColor: '#F3E8FF' },
  chipText: { fontSize: 12, color: '#666', fontWeight: '600' },
  chipTextActive: { color: '#A855F7' },

  photoWrap: { alignItems: 'center', marginBottom: 24 },
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
  photoImage: { width: '100%', height: '100%' },
  photoAction: { marginTop: 10, fontSize: 12, color: '#A855F7', fontWeight: '600' },

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
  saveBtn: { paddingVertical: 14, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.6 },
  saveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },

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
  successIcon: { fontSize: 32, color: '#FFFFFF', fontWeight: '700' },
  successTitle: { fontSize: 20, color: '#1a1a1a', fontWeight: '800', marginBottom: 8 },
  successSub: { fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 20, lineHeight: 18 },
  successBtn: { borderRadius: 12, overflow: 'hidden', width: '100%' },
  successBtnGradient: { paddingVertical: 12, alignItems: 'center' },
  successBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalDismiss: { ...StyleSheet.absoluteFillObject },
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
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalList: { padding: 16 },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
  avatarCell: {
    width: 74,
    height: 74,
    borderRadius: 37,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#F0F0F0',
  },
  avatarCellActive: { borderColor: '#A855F7', borderWidth: 3 },
  avatarThumb: { width: '100%', height: '100%' },

  earnCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ECECEC',
    padding: 16,
  },
  earnTitle: { fontSize: 16, fontWeight: '900', color: '#111', marginBottom: 4 },
  earnSub: { fontSize: 13, color: '#666', marginBottom: 10 },
  earnBullets: { gap: 10 },
  earnBulletRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  earnDot: { fontSize: 18, lineHeight: 20, color: '#A855F7', fontWeight: '900' },
  earnBulletText: { flex: 1, fontSize: 13, color: '#333', lineHeight: 20, fontWeight: '600' },
});