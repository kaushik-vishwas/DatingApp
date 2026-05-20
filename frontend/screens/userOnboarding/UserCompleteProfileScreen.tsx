import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  Image,
  type ImageSourcePropType,
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
  FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from 'react-native-vector-icons/Ionicons';

import {
  CALLER_INTEREST_OPTIONS,
  CALLER_LANGUAGE_OPTIONS,
  INDIAN_STATES,
  resolveCallerAvatarPresetSource,
} from '../../constants/userOnboarding';
import { useAuth } from '../../context/AuthContext';
import { useUserOnboarding } from '../../context/UserOnboardingContext';
import type { UserOnboardingStackParamList } from '../../navigation/UserOnboardingStackParamList';
import { getErrorMessage, profileApi } from '../../services/api';

const PURPLE = '#7b2cff';

type Props = NativeStackScreenProps<
  UserOnboardingStackParamList,
  'UserCompleteProfile'
>;

function toggleInList(list: string[], item: string, max?: number): string[] {
  if (list.includes(item)) return list.filter((x) => x !== item);
  if (max && list.length >= max) return list;
  return [...list, item];
}

export default function UserCompleteProfileScreen({
  navigation,
}: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();

  const { gender, callerAvatarPresetUrl } = useUserOnboarding();

  const { refreshUser, applyServerUser } = useAuth();

  const [fullName, setFullName] = useState('');
  const [state, setState] = useState('');
  const [showStateDropdown, setShowStateDropdown] = useState(false);
  const [stateSearch, setStateSearch] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);

  const [imageUri, setImageUri] =
    useState<ImageSourcePropType | null>(null);

  const [submitting, setSubmitting] = useState(false);

  const filteredStates = INDIAN_STATES.filter(stateOption =>
    stateOption.toLowerCase().includes(stateSearch.toLowerCase())
  );

  React.useEffect(() => {
    if (!gender) {
      navigation.replace('ChooseAvatar');
    }
  }, [gender, navigation]);

  useFocusEffect(
    useCallback(() => {
      if (callerAvatarPresetUrl) {
        setImageUri(resolveCallerAvatarPresetSource(callerAvatarPresetUrl));
      }
    }, [callerAvatarPresetUrl]),
  );

  const onSubmit = useCallback(async () => {
    if (!gender) return;

    const name = fullName.trim();

    if (name.length < 2) {
      Alert.alert('Validation', 'Please enter your full name.');
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
    if (!callerAvatarPresetUrl?.trim()) {
      Alert.alert('Validation', 'Please choose an avatar.');
      return;
    }

    setSubmitting(true);

    try {
      const { data } = await profileApi.completeCaller({
        name,
        profileImage: callerAvatarPresetUrl.trim(),
        languages,
        interests,
        gender,
        state: state.trim(),
      });

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
    state,
    interests,
    languages,
    imageUri,
    refreshUser,
    applyServerUser,
    callerAvatarPresetUrl,
  ]);

  const chip = (
    label: string,
    selected: boolean,
    onPress: () => void,
  ) => (
    <TouchableOpacity
      key={label}
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Text
        style={[
          styles.chipText,
          selected && styles.chipTextSelected,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.bg}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            {
              paddingTop: Math.max(insets.top, 14) + 18,
              paddingBottom: Math.max(insets.bottom, 14) + 140,
            },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            style={styles.backWrap}
            onPress={() => navigation.goBack()}
          >
            <Icon name="chevron-back" size={24} color={PURPLE} />
          </TouchableOpacity>

          <Text style={styles.title}>Complete Your Profile</Text>

          <Text style={styles.subtitle}>
            Tell us a bit about yourself
          </Text>

          <TouchableOpacity
            style={styles.avatarWrap}
            onPress={() => navigation.navigate('ChooseAvatar')}
            activeOpacity={0.9}
          >
            {imageUri ? (
              <Image source={imageUri} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.camera}>📷</Text>
              </View>
            )}

            <View style={styles.cameraBadge}>
              <Text style={styles.cameraSmall}>＋</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.navigate('ChooseAvatar')}
          >
            <Text style={styles.changePhoto}>Change avatar</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Display Name</Text>

          <TextInput
            style={styles.input}
            placeholder="Enter your name"
            placeholderTextColor="#999"
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
          />

          <Text style={styles.label}>Interests (max 2)</Text>

          <View style={styles.chipGrid}>
            {CALLER_INTEREST_OPTIONS.map((opt) =>
              chip(
                opt,
                interests.includes(opt),
                () => {
                  setInterests((prev) => {
                    if (prev.includes(opt)) {
                      return prev.filter((x) => x !== opt);
                    }
                
                    if (prev.length >= 2) {
                      Alert.alert(
                        'Maximum 2 interests',
                        'You can select only 2 interests.',
                      );
                      return prev;
                    }
                
                    return [...prev, opt];
                  });
                },
              ),
            )}
          </View>

          <Text style={styles.label}>State</Text>

          <TouchableOpacity 
            style={styles.dropdown}
            onPress={() => setShowStateDropdown(true)}
            activeOpacity={0.7}
          >
            <Text style={[styles.dropdownText, !state && styles.placeholderText]}>
              {state || 'Select your state'}
            </Text>
            <Icon name="chevron-down" size={20} color="#666" />
          </TouchableOpacity>

          <Text style={styles.label}>Languages (max 4)</Text>

          <View style={styles.chipGrid}>
            {CALLER_LANGUAGE_OPTIONS.map((opt) =>
              chip(
                opt,
                languages.includes(opt),
                () =>
                  setLanguages((prev) => {
                    if (prev.includes(opt)) {
                      return prev.filter((x) => x !== opt);
                    }
                    if (prev.length >= 4) {
                      Alert.alert(
                        'Maximum 4 languages',
                        'You can select only 4 languages.',
                      );
                      return prev;
                    }
                    return [...prev, opt];
                  }),
              ),
            )}
          </View>
        </ScrollView>

        <TouchableOpacity
          style={styles.buttonWrapper}
          onPress={() => void onSubmit()}
          disabled={submitting}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#7F00FF', '#A855F7', '#E100FF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.button, submitting && styles.buttonDisabled]}
          >
            <Text style={styles.buttonText}>
              {submitting ? 'Saving…' : 'Continue'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </KeyboardAvoidingView>

      {/* State Dropdown Modal */}
      <Modal visible={showStateDropdown} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalDismiss} onPress={() => setShowStateDropdown(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select State</Text>
              <TouchableOpacity onPress={() => setShowStateDropdown(false)} style={styles.closeBtn} activeOpacity={0.7}>
                <Icon name="close" size={20} color="#666" />
              </TouchableOpacity>
            </View>
            
            {/* Search Input */}
            <View style={styles.searchContainer}>
              <Icon name="search" size={20} color="#999" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search state..."
                value={stateSearch}
                onChangeText={setStateSearch}
                placeholderTextColor="#999"
              />
              {stateSearch.length > 0 && (
                <TouchableOpacity onPress={() => setStateSearch('')}>
                  <Icon name="close" size={20} color="#999" />
                </TouchableOpacity>
              )}
            </View>
            
            <FlatList
              data={filteredStates}
              keyExtractor={(item) => item}
              style={styles.modalList}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.stateItem, state === item && styles.stateItemActive]}
                  onPress={() => {
                    setState(item);
                    setShowStateDropdown(false);
                    setStateSearch('');
                  }}
                >
                  <Text style={[styles.stateText, state === item && styles.stateTextActive]}>
                    {item}
                  </Text>
                  {state === item && <Icon name="checkmark" size={20} color={PURPLE} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: '#fff',
  },

  flex: {
    flex: 1,
    width: '100%',
  },

  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },

  backWrap: {
    alignSelf: 'flex-start',
    padding: 4,
    marginBottom: 8,
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

  dropdown: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: '#fff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  dropdownText: {
    fontSize: 15,
    color: '#111',
  },

  placeholderText: {
    color: '#999',
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

  buttonWrapper: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 24,
    borderRadius: 12,
    overflow: 'hidden',
  },

  button: {
    paddingVertical: 16,
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalDismiss: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    maxHeight: '80%',
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    backgroundColor: '#FFFFFF',
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1a1a1a',
    paddingVertical: 8,
  },
  stateItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  stateItemActive: {
    backgroundColor: '#F3E8FF',
  },
  stateText: {
    fontSize: 14,
    color: '#333',
  },
  stateTextActive: {
    color: PURPLE,
    fontWeight: '600',
  },
});