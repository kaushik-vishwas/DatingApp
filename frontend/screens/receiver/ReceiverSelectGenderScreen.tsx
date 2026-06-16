import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { Gender } from '../../types/user';
import OnboardingLogoutButton from '../../components/auth/OnboardingLogoutButton';
import { useAuth } from '../../context/AuthContext';
import { profileApi, getErrorMessage } from '../../services/api';
import type { ReceiverStackParamList } from '../../navigation/ReceiverStackParamList';

type Props = NativeStackScreenProps<ReceiverStackParamList, 'ReceiverSelectGender'>;

function OptionRow({
  value,
  label,
  selected,
  onPress,
}: {
  value: Gender;
  label: string;
  selected: Gender | null;
  onPress: (v: Gender) => void;
}) {
  const active = selected === value;
  return (
    <TouchableOpacity
      style={[styles.option, active && styles.optionActive]}
      onPress={() => onPress(value)}
      activeOpacity={0.85}
    >
      {active ? (
        <LinearGradient
          colors={['#7F00FF', '#A855F7', '#E100FF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradientOption}
        >
          <Text style={styles.optionLabelActive}>{label}</Text>
        </LinearGradient>
      ) : (
        <Text style={styles.optionLabel}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const PURPLE = '#7b2cff';

export default function ReceiverSelectGenderScreen({ navigation }: Props): React.JSX.Element {
  const { user, applyServerUser } = useAuth();
  const [selected, setSelected] = useState<Gender | null>(
    (user?.gender as Gender | null) ?? null
  );

  const canContinue = useMemo(() => Boolean(selected), [selected]);

  const onContinue = async (): Promise<void> => {
    if (!selected) {
      Alert.alert('Select gender', 'Please choose an option to continue.');
      return;
    }
    try {
      const { data } = await profileApi.updateReceiverProfile({ gender: selected });
      applyServerUser(data.user);
      navigation.replace('ReceiverOnboarding', { gender: selected });
    } catch (e) {
      Alert.alert('Update failed', getErrorMessage(e));
    }
  };

  return (
    <View style={styles.bg}>
      <OnboardingLogoutButton style={{ paddingTop: 16, paddingRight: 20 }} />
      <View style={styles.card}>
        <Text style={styles.title}>Select Gender</Text>
        <Text style={styles.subtitle}>This helps us personalize your receiver profile</Text>

        <View style={styles.list}>
          <OptionRow
            value="male"
            label="Male"
            selected={selected}
            onPress={(v) => setSelected(v)}
          />
          <OptionRow
            value="female"
            label="Female"
            selected={selected}
            onPress={(v) => setSelected(v)}
          />
          <OptionRow
            value="other"
            label="Other"
            selected={selected}
            onPress={(v) => setSelected(v)}
          />
        </View>

        <TouchableOpacity
          style={[styles.button, !canContinue && styles.buttonDisabled]}
          onPress={() => void onContinue()}
          activeOpacity={0.9}
          disabled={!canContinue}
        >
          <LinearGradient
            colors={['#7F00FF', '#A855F7', '#E100FF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradientButton}
          >
            <Text style={styles.buttonText}>Continue</Text>
          </LinearGradient>
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
    paddingTop: 52,
  },
  card: {
    flex: 1,
    width: '100%',
  },
  backWrap: {
    marginBottom: 12,
    alignSelf: 'flex-start',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
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
    marginBottom: 22,
    lineHeight: 18,
  },
  list: {
    gap: 12,
  },
  option: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  optionActive: {
    shadowColor: '#7F00FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  gradientOption: {
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
    paddingVertical: 16,
    paddingHorizontal: 18,
    textAlign: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e8e8e8',
    borderRadius: 12,
    overflow: 'hidden',
  },
  optionLabelActive: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  button: {
    marginTop: 'auto',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#7F00FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  gradientButton: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
});