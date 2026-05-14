import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getCallerAvatarPresetsByGender } from '../../constants/userOnboarding';
import { useAuth } from '../../context/AuthContext';
import { useUserOnboarding } from '../../context/UserOnboardingContext';
import type { UserOnboardingStackParamList } from '../../navigation/UserOnboardingStackParamList';

const PURPLE = '#7b2cff';

type Props = NativeStackScreenProps<UserOnboardingStackParamList, 'ChooseAvatar'>;

export default function ChooseAvatarScreen({ navigation }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { gender, setCallerAvatarPresetUrl } = useUserOnboarding();
  const avatarPresets = getCallerAvatarPresetsByGender(gender);
  const [selected, setSelected] = useState<string>(avatarPresets[0]?.id ?? '');

  const selectedPreset = avatarPresets.find((preset) => preset.id === selected) ?? avatarPresets[0];

  React.useEffect(() => {
    if (!avatarPresets.some((preset) => preset.id === selected)) {
      setSelected(avatarPresets[0]?.id ?? '');
    }
  }, [avatarPresets, selected]);

  const displayLabel = user?.name?.trim() || 'You';

  const onProceed = () => {
    setCallerAvatarPresetUrl(selected);
    navigation.navigate('UserCompleteProfile');
  };

  return (
    <View
      style={[
        styles.root,
        { paddingTop: Math.max(insets.top, 14) + 18, paddingBottom: Math.max(insets.bottom, 14) + 18 },
      ]}
    >
      <TouchableOpacity style={styles.backWrap} onPress={() => navigation.goBack()}>
        <Text style={styles.back}>←</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Choose your Avatar!</Text>
      <Text style={styles.subtitle}>Tell us a bit about yourself</Text>

      <View style={styles.featured}>
        {selectedPreset ? (
          <Image source={selectedPreset.source} style={styles.featuredImg} />
        ) : null}
        <Text style={styles.featuredName}>{displayLabel}</Text>
      </View>

      <View style={styles.listWrap}>
        <FlatList
          data={avatarPresets}
          keyExtractor={(item) => item.id}
          numColumns={3}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.grid}
          scrollEnabled
          renderItem={({ item }) => {
            const active = item.id === selected;
            return (
              <TouchableOpacity
                style={[styles.cell, active && styles.cellActive]}
                onPress={() => setSelected(item.id)}
                activeOpacity={0.85}
              >
                <Image source={item.source} style={styles.thumb} />
              </TouchableOpacity>
            );
          }}
        />
      </View>

      <TouchableOpacity style={styles.proceed} onPress={onProceed} activeOpacity={0.9}>
        <Text style={styles.proceedText}>Proceed</Text>
      </TouchableOpacity>
    </View>
  );
}

const CELL = 88;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
  },
  backWrap: {
    alignSelf: 'flex-start',
    padding: 4,
    marginBottom: 8,
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
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  featured: {
    alignItems: 'center',
    marginBottom: 20,
  },
  featuredImg: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: PURPLE,
  },
  featuredName: {
    marginTop: 10,
    fontSize: 17,
    fontWeight: '800',
    color: '#111',
  },
  listWrap: {
    flex: 1,
    minHeight: 120,
  },
  grid: {
    paddingBottom: 16,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 10,
  },
  cell: {
    width: CELL,
    height: CELL,
    borderRadius: CELL / 2,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#e8e8e8',
  },
  cellActive: {
    borderColor: PURPLE,
    borderWidth: 3,
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  proceed: {
    marginTop: 'auto',
    backgroundColor: PURPLE,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  proceedText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
});
