import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import ReceiverOnboardingStepLayout from '../../../components/receiver/onboarding/ReceiverOnboardingStepLayout';
import { getCallerAvatarPresetsByGender } from '../../../constants/userOnboarding';
import { useReceiverOnboarding } from '../../../context/ReceiverOnboardingContext';
import type { ReceiverOnboardingStackParamList } from '../../../navigation/ReceiverOnboardingStackParamList';
import { resolveProfileImageSource } from '../../../utils/avatarSource';
import type { Gender } from '../../../types/user';

type Props = NativeStackScreenProps<ReceiverOnboardingStackParamList, 'ReceiverOnboardingAvatar'>;

export default function ReceiverOnboardingAvatarScreen({
  navigation,
}: Props): React.JSX.Element {
  const { gender, profileImageUri, setProfileImageUri } = useReceiverOnboarding();
  const selectedGender: Gender | null = gender ?? 'female';
  const [selected, setSelected] = useState<string | null>(profileImageUri);

  const avatarPresets = useMemo(() => {
    if (!selectedGender) return [];
    return getCallerAvatarPresetsByGender(selectedGender);
  }, [selectedGender]);

  const onContinue = () => {
    if (!selected?.trim()) {
      Alert.alert('Avatar', 'Please select an avatar to continue.');
      return;
    }
    const allowedPreset = avatarPresets.some((p) => p.id === selected);
    const isHttpsAvatar = /^https:\/\//i.test(selected.trim());
    if (!allowedPreset && !isHttpsAvatar) {
      Alert.alert('Avatar', 'Please choose one of the available avatars.');
      return;
    }
    setProfileImageUri(selected);
    navigation.navigate('ReceiverOnboardingPrimaryLanguage');
  };

  return (
    <ReceiverOnboardingStepLayout
      title="Select Your Avatar"
      subtitle="Pick a profile photo callers will see."
      onBack={() => navigation.goBack()}
      onContinue={onContinue}
      continueDisabled={!selected}
    >
      <View style={styles.grid}>
        {avatarPresets.map((preset) => {
          const active = selected === preset.id;
          return (
            <TouchableOpacity
              key={preset.id}
              style={[styles.cell, active && styles.cellActive]}
              onPress={() => setSelected(preset.id)}
              activeOpacity={0.85}
            >
              <Image source={preset.source} style={styles.thumb} />
            </TouchableOpacity>
          );
        })}
      </View>
      {/* {selected ? (
        <View style={styles.previewWrap}>
          <Text style={styles.previewLabel}>Preview</Text>
          {(() => {
            const src = resolveProfileImageSource(selected);
            return src ? <Image source={src} style={styles.preview} /> : null;
          })()}
        </View>
      ) : null} */}
    </ReceiverOnboardingStepLayout>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16, // Adjust this value for more/less space between avatars
    marginBottom: 16,
  },
  cell: {
    width: '40%',
    aspectRatio: 1,
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#E8E8E8',
    margin: 8, // Adds gap on all sides
  },
  cellActive: {
    borderColor: '#A855F7',
    borderWidth: 3,
  },
  thumb: { width: '100%', height: '100%', resizeMode: 'cover' },
  previewWrap: { alignItems: 'center', marginTop: 8 },
  previewLabel: { fontSize: 12, color: '#888', marginBottom: 8, fontWeight: '600' },
  preview: { width: 60, height: 60, borderRadius: 30 },
}); 
