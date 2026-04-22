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

import { CALLER_AVATAR_PRESETS } from '../../constants/userOnboarding';
import { useAuth } from '../../context/AuthContext';
import { useUserOnboarding } from '../../context/UserOnboardingContext';
import type { UserOnboardingStackParamList } from '../../navigation/UserOnboardingStackParamList';

const PURPLE = '#7b2cff';

type Props = NativeStackScreenProps<UserOnboardingStackParamList, 'ChooseAvatar'>;

export default function ChooseAvatarScreen({ navigation }: Props): React.JSX.Element {
  const { user } = useAuth();
  const { setCallerAvatarPresetUrl } = useUserOnboarding();
  const [selected, setSelected] = useState<string>(CALLER_AVATAR_PRESETS[0]!);

  const displayLabel = user?.name?.trim() || 'You';

  const onProceed = () => {
    setCallerAvatarPresetUrl(selected);
    navigation.navigate('UserCompleteProfile');
  };

  return (
    <View style={styles.root}>
      <TouchableOpacity style={styles.backWrap} onPress={() => navigation.goBack()}>
        <Text style={styles.back}>←</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Choose your Avatar!</Text>
      <Text style={styles.subtitle}>Tell us a bit about yourself</Text>

      <View style={styles.featured}>
        <Image source={{ uri: selected }} style={styles.featuredImg} />
        <Text style={styles.featuredName}>{displayLabel}</Text>
      </View>

      <View style={styles.listWrap}>
        <FlatList
          data={CALLER_AVATAR_PRESETS}
          keyExtractor={(item) => item}
          numColumns={3}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.grid}
          scrollEnabled
          renderItem={({ item }) => {
            const active = item === selected;
            return (
              <TouchableOpacity
                style={[styles.cell, active && styles.cellActive]}
                onPress={() => setSelected(item)}
                activeOpacity={0.85}
              >
                <Image source={{ uri: item }} style={styles.thumb} />
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
    paddingTop: 48,
    paddingBottom: 24,
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
