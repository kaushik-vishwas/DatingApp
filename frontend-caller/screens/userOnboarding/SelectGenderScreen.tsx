import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from 'react-native-vector-icons/Ionicons';

import { useAuth } from '../../context/AuthContext';
import { useUserOnboarding } from '../../context/UserOnboardingContext';
import type { UserOnboardingStackParamList } from '../../navigation/UserOnboardingStackParamList';
import type { Gender } from '../../types/user';

const PURPLE = '#7b2cff';

type Props = NativeStackScreenProps<
  UserOnboardingStackParamList,
  'SelectGender'
>;

export default function SelectGenderScreen({
  navigation,
}: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();

  const { setGender } = useUserOnboarding();
  const { signOut } = useAuth();

  const [selected, setSelected] = useState<Gender | null>(null);

  const onLeave = () => {
    Alert.alert(
      'Exit setup?',
      'You can sign in again later to continue.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Exit',
          style: 'destructive',
          onPress: () => void signOut(),
        },
      ],
    );
  };

  const onContinue = () => {
    if (!selected) {
      Alert.alert(
        'Select gender',
        'Please choose an option to continue.',
      );
      return;
    }

    setGender(selected);
    navigation.navigate('ChooseAvatar');
  };

  const row = (value: Gender, label: string) => {
    const active = selected === value;

    return (
      <TouchableOpacity
        key={value}
        style={styles.option}
        onPress={() => setSelected(value)}
        activeOpacity={0.85}
      >
        {active ? (
          <LinearGradient
            colors={['#7F00FF', '#A855F7', '#E100FF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.optionGradient}
          >
            <Text
              style={[
                styles.optionLabel,
                styles.optionTextActive,
              ]}
            >
              {label}
            </Text>
          </LinearGradient>
        ) : (
          <View style={styles.optionInner}>
            <Text style={styles.optionLabel}>
              {label}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View
      style={[
        styles.bg,
        {
          paddingTop: Math.max(insets.top, 14) + 10,
          paddingBottom: Math.max(insets.bottom, 14) + 18,
        },
      ]}
    >
      <View style={styles.card}>
        {/* Back Button */}
        <TouchableOpacity
          style={styles.backWrap}
          onPress={onLeave}
          activeOpacity={0.7}
        >
          <Icon
            name="chevron-back"
            size={28}
            color="#7b2cff"
          />
        </TouchableOpacity>

        {/* Title */}
        <Text style={styles.title}>Select Gender</Text>

        <View style={styles.underline} />

        <Text style={styles.subtitle}>
          This helps us personalize your experience
        </Text>

        {/* Gender Options */}
        <View style={styles.list}>
          {row('male', 'Male')}
          {row('female', 'Female')}
          {row('other', 'Other')}
        </View>

        {/* Bottom Button */}
        <TouchableOpacity
          style={styles.buttonWrapper}
          onPress={onContinue}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={['#7F00FF', '#A855F7', '#E100FF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.button}
          >
            <Text style={styles.buttonText}>
              Get Started!
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
  },

  card: {
    flex: 1,
    width: '100%',
  },

  backWrap: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },

  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111',
  },

  underline: {
    height: 3,
    backgroundColor: PURPLE,
    width: 72,
    borderRadius: 2,
    marginTop: 10,
    marginBottom: 14,
  },

  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 30,
    lineHeight: 20,
  },

  list: {
    gap: 14,
  },

  option: {
    borderRadius: 14,
    overflow: 'hidden',
  },

  optionGradient: {
    paddingVertical: 18,
    paddingHorizontal: 18,
    alignItems: 'center',
    borderRadius: 14,
  },

  optionInner: {
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e8e8e8',
    alignItems: 'center',
  },

  optionLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111',
  },

  optionTextActive: {
    color: '#fff',
  },

  buttonWrapper: {
    marginTop: 'auto',
    borderRadius: 14,
    overflow: 'hidden',
  },

  button: {
    paddingVertical: 16,
    alignItems: 'center',
  },

  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
});