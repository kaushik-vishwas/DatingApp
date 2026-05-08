import type { ImageSourcePropType } from 'react-native';

import type { Gender } from '../types/user';

/** Indian states / UTs for caller profile (subset; extend as needed) */
export const INDIAN_STATES: string[] = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Delhi',
  'Puducherry',
];

/** Caller “interests” chips aligned with product UI */
export const CALLER_INTEREST_OPTIONS: string[] = [
  'Confidence',
  'Lifestyle',
  'Career',
  'Personal',
  'Relationships',
  'Marriage',
  'Education',
  'Art',
  'Music',
  'Sports',
  'Travel',
  'Movies',
  'Reading',
  'Food',
  'Fitness',
  'Technology',
  'Fashion',
  'Dancing',
];

export const CALLER_LANGUAGE_OPTIONS: string[] = [
  'Telugu',
  'Kannada',
  'Tamil',
  'Hindi',
  'English',
  'Malayalam',
  'Marathi',
];

export type CallerAvatarPreset = {
  id: string;
  source: ImageSourcePropType;
};

const CALLER_MALE_AVATAR_SOURCES: ImageSourcePropType[] = [
  require('../assets/boyavt/boyavt1.png'),
  require('../assets/boyavt/boyavt2.png'),
  require('../assets/boyavt/boyavt3.png'),
  require('../assets/boyavt/boyavt4.png'),
  require('../assets/boyavt/boyavt5.png'),
  require('../assets/boyavt/boyavt6.png'),
  require('../assets/boyavt/boyavt7.png'),
  require('../assets/boyavt/boyavt8.png'),
  require('../assets/boyavt/boyavt9.png'),
  require('../assets/boyavt/boyavt10.png'),
  require('../assets/boyavt/boyavt11.png'),
  require('../assets/boyavt/boyavt12.png'),
  require('../assets/boyavt/boyavt13.png'),
  require('../assets/boyavt/boyavt14.png'),
  require('../assets/boyavt/boyavt15.png'),
  require('../assets/boyavt/boyavt16.png'),
  require('../assets/boyavt/boyavt17.png'),
  require('../assets/boyavt/boyavt18.png'),
  require('../assets/boyavt/boyavt19.png'),
  require('../assets/boyavt/boyavt20.png'),
  require('../assets/boyavt/boyavt21.png'),
  require('../assets/boyavt/boyavt22.png'),
  require('../assets/boyavt/boyavt23.png'),
  require('../assets/boyavt/boyavt24.png'),
  require('../assets/boyavt/boyavt25.png'),
  require('../assets/boyavt/boyavt26.png'),
  require('../assets/boyavt/boyavt27.png'),
];

const CALLER_FEMALE_AVATAR_SOURCES: ImageSourcePropType[] = [
  require('../assets/girlavt/girlavt1.png'),
  require('../assets/girlavt/girlavt2.png'),
  require('../assets/girlavt/girlavt3.png'),
  require('../assets/girlavt/girlavt4.png'),
  require('../assets/girlavt/girlavt5.png'),
  require('../assets/girlavt/girlavt6.png'),
  require('../assets/girlavt/girlavt7.png'),
  require('../assets/girlavt/girlavt8.png'),
  require('../assets/girlavt/girlavt9.png'),
  require('../assets/girlavt/girlavt10.png'),
  require('../assets/girlavt/girlavt11.png'),
  require('../assets/girlavt/girlavt12.png'),
  require('../assets/girlavt/girlavt13.png'),
  require('../assets/girlavt/girlavt14.png'),
  require('../assets/girlavt/girlavt15.png'),
  require('../assets/girlavt/girlavt16.png'),
  require('../assets/girlavt/girlavt17.png'),
  require('../assets/girlavt/girlavt18.png'),
  require('../assets/girlavt/girlavt19.png'),
  require('../assets/girlavt/girlavt20.png'),
  require('../assets/girlavt/girlavt21.png'),
  require('../assets/girlavt/girlavt22.png'),
  require('../assets/girlavt/girlavt23.png'),
  require('../assets/girlavt/girlavt24.png'),
  require('../assets/girlavt/girlavt25.png'),
  require('../assets/girlavt/girlavt26.png'),
  require('../assets/girlavt/girlavt27.png'),
];

/** Preset profile photos for caller onboarding/edit profile. */
export const CALLER_MALE_AVATAR_PRESETS: CallerAvatarPreset[] = CALLER_MALE_AVATAR_SOURCES.map(
  (source, idx) => ({
    id: `preset:male:${idx + 1}`,
    source,
  }),
);

export const CALLER_FEMALE_AVATAR_PRESETS: CallerAvatarPreset[] = CALLER_FEMALE_AVATAR_SOURCES.map(
  (source, idx) => ({
    id: `preset:female:${idx + 1}`,
    source,
  }),
);

export const CALLER_AVATAR_PRESETS: CallerAvatarPreset[] = [
  ...CALLER_MALE_AVATAR_PRESETS,
  ...CALLER_FEMALE_AVATAR_PRESETS,
];

const CALLER_AVATAR_PRESET_SOURCE_BY_ID = new Map<string, ImageSourcePropType>(
  CALLER_AVATAR_PRESETS.map((preset) => [preset.id, preset.source]),
);

export function getCallerAvatarPresetsByGender(
  gender: Gender | null | undefined,
): CallerAvatarPreset[] {
  if (gender === 'male') return CALLER_MALE_AVATAR_PRESETS;
  if (gender === 'female') return CALLER_FEMALE_AVATAR_PRESETS;
  return CALLER_AVATAR_PRESETS;
}

export function resolveCallerAvatarPresetSource(
  presetId: string | null | undefined,
): ImageSourcePropType | null {
  if (!presetId) return null;
  return CALLER_AVATAR_PRESET_SOURCE_BY_ID.get(presetId) ?? null;
}

export function isCallerAvatarPresetId(value: string | null | undefined): boolean {
  if (!value) return false;
  return CALLER_AVATAR_PRESET_SOURCE_BY_ID.has(value);
}

export const CALLER_AUDIO_VERIFICATION_SCRIPT =
  'Hello! Friendship is very special because good friends are always by our side; they increase our happiness, decrease our sadness, and without them, everything feels incomplete—so, thank you, friends!';
