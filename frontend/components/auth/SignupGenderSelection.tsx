import React from 'react';
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import MALE_AVATAR from '../../assets/boy.jpg';
import FEMALE_AVATAR from '../../assets/girl.jpg';
import OnboardingLogoutButton from './OnboardingLogoutButton';

export type SignupGender = 'male' | 'female';

function GenderCard({
  value,
  label,
  avatarSource,
  selected,
  onPress,
}: {
  value: SignupGender;
  label: string;
  avatarSource: number;
  selected: SignupGender | null;
  onPress: (v: SignupGender) => void;
}) {
  const active = selected === value;
  const isFemale = value === 'female';

  return (
    <TouchableOpacity
      style={[styles.card, active && styles.cardActive]}
      onPress={() => onPress(value)}
      activeOpacity={0.85}
    >
      {active ? (
        <LinearGradient
          colors={isFemale ? ['#FF1493', '#FF69B4'] : ['#7F00FF', '#A855F7']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientCard}
        >
          <View style={styles.cardContent}>
            <Image source={avatarSource} style={styles.avatar} />
            <Text style={styles.cardLabelActive}>{label}</Text>
          </View>
        </LinearGradient>
      ) : (
        <View style={styles.cardContent}>
          <Image source={avatarSource} style={styles.avatar} />
          <Text style={styles.cardLabel}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

type Props = {
  paddingTop: number;
  paddingBottom: number;
  selected: SignupGender | null;
  onSelect: (g: SignupGender) => void;
  onBack: () => void;
  onContinue: () => void;
  continueDisabled: boolean;
  continueLabel: string;
  onLogout?: () => void;
};

export default function SignupGenderSelection({
  paddingTop,
  paddingBottom,
  selected,
  onSelect,
  onBack,
  onContinue,
  continueDisabled,
  continueLabel,
  onLogout,
}: Props): React.JSX.Element {
  return (
    <View
      style={[
        styles.root,
        { paddingTop, paddingBottom },
      ]}
    >
      <View style={styles.topRow}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Ionicons name="chevron-back" size={28} color="#7b2cff" />
        </TouchableOpacity>
        {onLogout ? (
          <OnboardingLogoutButton
            floating={false}
            onPress={onLogout}
            confirmMessage="Go back and sign in with another account?"
          />
        ) : null}
      </View>

      <Text style={styles.title}>Select Your Gender</Text>
      <Text style={styles.subtitle}>Gender cannot be changed later</Text>

      <View style={styles.cardContainer}>
        <GenderCard
          value="male"
          label="Male"
          avatarSource={MALE_AVATAR}
          selected={selected}
          onPress={onSelect}
        />
        <GenderCard
          value="female"
          label="Female"
          avatarSource={FEMALE_AVATAR}
          selected={selected}
          onPress={onSelect}
        />
      </View>

      {selected === 'female' && (
        <Text style={styles.audioVerificationText}>
          Audio verification required
        </Text>
      )}

      <TouchableOpacity
        style={[styles.ctaWrap, continueDisabled && styles.ctaDisabled]}
        onPress={onContinue}
        disabled={continueDisabled}
        activeOpacity={0.85}
      >
        <LinearGradient
          colors={['#7F00FF', '#A855F7', '#E100FF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.cta}
        >
          <Text style={styles.ctaText}>{continueLabel}</Text>
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
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: '#666',
    lineHeight: 20,
    marginBottom: 24,
  },
  cardContainer: {
    alignItems: 'center',
    gap: 16,
    marginBottom: 20,
  },
  card: {
    width: '50%',
    aspectRatio: 0.9,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#e8e8e8',
    backgroundColor: '#fff',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 8,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  cardActive: {
    borderColor: '#7b2cff',
    borderWidth: 2.5,
  },
  gradientCard: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  avatar: {
    width: 135,
    height: 135,
    borderRadius: 70,
    marginBottom: 2,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#222',
  },
  cardLabelActive: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
  },
  audioVerificationText: {
    fontSize: 12,
    color: '#FF1493',
    textAlign: 'center',
    marginVertical: -5,
    fontWeight: '500',
  },
  ctaWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 25,
    marginHorizontal: 10,
    marginBottom: 20,
  },
  ctaDisabled: {
    opacity: 0.5,
  },
  cta: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
});
