import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../../context/AuthContext';
import type { RootStackParamList } from '../../navigation/RootStackParamList';
import { authApi, getErrorMessage, saveJwt } from '../../services/api';

type Props = NativeStackScreenProps<RootStackParamList, 'AuthGender'>;

type SignupGender = 'male' | 'female';

function OptionRow({
  value,
  label,
  selected,
  onPress,
}: {
  value: SignupGender;
  label: string;
  selected: SignupGender | null;
  onPress: (v: SignupGender) => void;
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

export default function AuthGenderScreen({ navigation, route }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { phone } = route.params;
  const { signIn } = useAuth();
  const [selected, setSelected] = useState<SignupGender | null>(null);
  const [loading, setLoading] = useState(false);

  const canContinue = useMemo(() => Boolean(selected), [selected]);

  const onContinue = async () => {
    if (!selected) {
      Alert.alert('Select gender', 'Please choose an option to continue.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await authApi.completeMobileSignup({ phone, gender: selected });
      if (!data?.token) {
        Alert.alert('Error', 'No token returned from server');
        return;
      }
      await saveJwt(data.token);
      signIn(data.token, data.user);
    } catch (e) {
      Alert.alert('Signup failed', getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: Math.max(insets.top, 16) + 12,
          paddingBottom: Math.max(insets.bottom, 16) + 12,
        },
      ]}
    >
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.back}>←</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Select your gender</Text>
      <Text style={styles.subtitle}>
        Male accounts use the caller experience. Female accounts use the receiver experience.
      </Text>

      <View style={styles.list}>
        <OptionRow value="male" label="Male" selected={selected} onPress={setSelected} />
        <OptionRow value="female" label="Female" selected={selected} onPress={setSelected} />
      </View>

      <TouchableOpacity
        style={[styles.ctaWrap, (!canContinue || loading) && styles.ctaDisabled]}
        onPress={() => void onContinue()}
        disabled={!canContinue || loading}
        activeOpacity={0.85}
      >
        <LinearGradient
          colors={['#7F00FF', '#A855F7', '#E100FF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.cta}
        >
          <Text style={styles.ctaText}>{loading ? 'Creating account…' : 'Continue'}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 22,
  },
  backBtn: {
    width: 42,
    height: 42,
    justifyContent: 'center',
    marginBottom: 8,
  },
  back: {
    fontSize: 26,
    color: '#7b2cff',
    fontWeight: '700',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
    marginBottom: 28,
  },
  list: {
    gap: 12,
    marginBottom: 28,
  },
  option: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e5e5e5',
    overflow: 'hidden',
  },
  optionActive: {
    borderColor: '#7b2cff',
  },
  gradientOption: {
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    paddingVertical: 16,
    paddingHorizontal: 18,
    textAlign: 'center',
  },
  optionLabelActive: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  ctaWrap: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  ctaDisabled: {
    opacity: 0.5,
  },
  cta: {
    paddingVertical: 15,
    alignItems: 'center',
  },
  ctaText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
});
