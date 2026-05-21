import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from 'react-native-vector-icons/Ionicons';

import { getCallerAvatarPresetsByGender } from '../../constants/userOnboarding';
import { useAuth } from '../../context/AuthContext';
import { useUserOnboarding } from '../../context/UserOnboardingContext';
import type { UserOnboardingStackParamList } from '../../navigation/UserOnboardingStackParamList';

const PURPLE = '#7b2cff';

type Props = NativeStackScreenProps<
  UserOnboardingStackParamList,
  'ChooseAvatar'
>;

const SCREEN_WIDTH = Dimensions.get('window').width;
const HORIZONTAL_PADDING = 20;
const GAP = 18;

// 2 images per row with equal left/right spacing
const CELL =
  (SCREEN_WIDTH - HORIZONTAL_PADDING * 2 - GAP) / 2;

export default function ChooseAvatarScreen({
  navigation,
}: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();

  const { user } = useAuth();

  const { gender, setCallerAvatarPresetUrl } =
    useUserOnboarding();

  const avatarPresets =
    getCallerAvatarPresetsByGender(gender);

  const [selected, setSelected] = useState<string>(
    avatarPresets[0]?.id ?? '',
  );

  const selectedPreset =
    avatarPresets.find(
      (preset) => preset.id === selected,
    ) ?? avatarPresets[0];

  React.useEffect(() => {
    if (
      !avatarPresets.some(
        (preset) => preset.id === selected,
      )
    ) {
      setSelected(avatarPresets[0]?.id ?? '');
    }
  }, [avatarPresets, selected]);

  const displayLabel =
    user?.name?.trim() || 'You';

  const onProceed = () => {
    setCallerAvatarPresetUrl(selected);
    navigation.navigate('UserCompleteProfile');
  };

  const onBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('SelectGender');
  };

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop:
            Math.max(insets.top, 14) + 10,
          paddingBottom:
            Math.max(insets.bottom, 14) + 18,
        },
      ]}
    >
      {/* Back Button */}
      <TouchableOpacity
        style={styles.backWrap}
        onPress={onBack}
        activeOpacity={0.7}
      >
        <Icon
          name="chevron-back"
          size={28}
          color="#7b2cff"
        />
      </TouchableOpacity>

      {/* Title */}
      <Text style={styles.title}>
        Choose your Avatar!
      </Text>

      <View style={styles.underline} />

      <Text style={styles.subtitle}>
        Tell us a bit about yourself
      </Text>

      {/* Featured Avatar */}
      {/* <View style={styles.featured}>
        {selectedPreset ? (
          <Image
            source={selectedPreset.source}
            style={styles.featuredImg}
          />
        ) : null}
      </View> */}

      {/* Avatar Grid */}
      <View style={styles.listWrap}>
      <FlatList
  key={`cols-2`}
  data={avatarPresets}
  keyExtractor={(item) => item.id}
  numColumns={2}
  columnWrapperStyle={styles.row}
  contentContainerStyle={styles.grid}
  showsVerticalScrollIndicator={false}
  scrollEnabled
  renderItem={({ item }) => {
            const active =
              item.id === selected;

            return (
              <TouchableOpacity
                style={[
                  styles.cell,
                  active &&
                    styles.cellActive,
                ]}
                onPress={() =>
                  setSelected(item.id)
                }
                activeOpacity={0.85}
              >
                <Image
                  source={item.source}
                  style={styles.thumb}
                />
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Proceed Button */}
      <TouchableOpacity
        style={styles.buttonWrapper}
        onPress={onProceed}
        activeOpacity={0.9}
      >
        <LinearGradient
          colors={[
            '#7F00FF',
            '#A855F7',
            '#E100FF',
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.button}
        >
          <Text style={styles.buttonText}>
            Proceed
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: HORIZONTAL_PADDING,
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
    marginBottom: 24,
    lineHeight: 20,
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
    marginBottom: 18,
  },

  cell: {
    width: CELL,
    height: CELL,
    borderRadius: CELL / 2,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#e8e8e8',
    alignItems: 'center',
    justifyContent: 'center',
  },

  cellActive: {
    borderColor: PURPLE,
    borderWidth: 4,
  },

  thumb: {
    width: '100%',
    height: '100%',
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