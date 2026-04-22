import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useAuth } from '../../context/AuthContext';
import { useUserOnboarding } from '../../context/UserOnboardingContext';
import type { UserOnboardingStackParamList } from '../../navigation/UserOnboardingStackParamList';
import type { Gender } from '../../types/user';

const PURPLE = '#7b2cff';

type Props = NativeStackScreenProps<UserOnboardingStackParamList, 'SelectGender'>;

export default function SelectGenderScreen({ navigation }: Props): React.JSX.Element {
  const { setGender } = useUserOnboarding();
  const { signOut } = useAuth();
  const [selected, setSelected] = useState<Gender | null>(null);

  const onLeave = () => {
    Alert.alert('Exit setup?', 'You can sign in again later to continue.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Exit', style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  const onContinue = () => {
    if (!selected) {
      Alert.alert('Select gender', 'Please choose an option to continue.');
      return;
    }
    setGender(selected);
    navigation.navigate('AudioVerification');
  };

  const row = (value: Gender, label: string, icon?: string) => {
    const active = selected === value;
    return (
      <TouchableOpacity
        key={value}
        style={[styles.option, active && styles.optionActive]}
        onPress={() => setSelected(value)}
        activeOpacity={0.85}
      >
        {icon ? <Text style={[styles.optionIcon, active && styles.optionTextActive]}>{icon}</Text> : null}
        <Text style={[styles.optionLabel, active && styles.optionTextActive]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.bg}>
      <View style={styles.card}>
        <TouchableOpacity style={styles.backWrap} onPress={onLeave}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Select Gender</Text>
        <Text style={styles.subtitle}>This helps us personalize your experience</Text>

        <View style={styles.list}>
          {row('male', 'Male')}
          {row('female', 'Female')}
          {row('other', 'Other', '🏳️‍🌈')}
        </View>

        <TouchableOpacity style={styles.button} onPress={onContinue} activeOpacity={0.9}>
          <Text style={styles.buttonText}>Get Started!</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: '#f4f4f5',
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 24,
  },
  card: {
    flex: 1,
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  backWrap: {
    marginBottom: 12,
    alignSelf: 'flex-start',
    padding: 4,
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
    marginBottom: 28,
  },
  list: {
    gap: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  optionActive: {
    backgroundColor: PURPLE,
    borderColor: PURPLE,
  },
  optionIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
  },
  optionTextActive: {
    color: '#fff',
  },
  button: {
    marginTop: 'auto',
    backgroundColor: PURPLE,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
});
