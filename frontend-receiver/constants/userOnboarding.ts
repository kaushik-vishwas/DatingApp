import type { Gender } from '../types/user';
import type { ImageSourcePropType } from 'react-native';

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

/** Preset profile photos for caller onboarding/edit profile. */
export const CALLER_MALE_AVATAR_PRESETS: string[] = [
  'https://randomuser.me/api/portraits/men/1.jpg',
  'https://randomuser.me/api/portraits/men/2.jpg',
  'https://randomuser.me/api/portraits/men/3.jpg',
  'https://randomuser.me/api/portraits/men/4.jpg',
  'https://randomuser.me/api/portraits/men/5.jpg',
  'https://randomuser.me/api/portraits/men/6.jpg',
  'https://randomuser.me/api/portraits/men/7.jpg',
  'https://randomuser.me/api/portraits/men/8.jpg',
  'https://randomuser.me/api/portraits/men/9.jpg',
  'https://randomuser.me/api/portraits/men/10.jpg',
  'https://randomuser.me/api/portraits/men/11.jpg',
  'https://randomuser.me/api/portraits/men/12.jpg',
  'https://randomuser.me/api/portraits/men/13.jpg',
  'https://randomuser.me/api/portraits/men/14.jpg',
  'https://randomuser.me/api/portraits/men/15.jpg',
  'https://randomuser.me/api/portraits/men/16.jpg',
  'https://randomuser.me/api/portraits/men/17.jpg',
  'https://randomuser.me/api/portraits/men/18.jpg',
  'https://randomuser.me/api/portraits/men/19.jpg',
  'https://randomuser.me/api/portraits/men/20.jpg',
  'https://randomuser.me/api/portraits/men/21.jpg',
  'https://randomuser.me/api/portraits/men/22.jpg',
  'https://randomuser.me/api/portraits/men/23.jpg',
  'https://randomuser.me/api/portraits/men/24.jpg',
  'https://randomuser.me/api/portraits/men/25.jpg',
  'https://randomuser.me/api/portraits/men/26.jpg',
  'https://randomuser.me/api/portraits/men/27.jpg',
  'https://randomuser.me/api/portraits/men/28.jpg',
  'https://randomuser.me/api/portraits/men/29.jpg',
  'https://randomuser.me/api/portraits/men/30.jpg',
];

/** Same pattern as frontend-caller: bundled assets + stable ids (works in production APK). */
export type CallerAvatarPreset = {
  id: string;
  source: ImageSourcePropType;
};

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

export const CALLER_FEMALE_AVATAR_PRESETS: CallerAvatarPreset[] = CALLER_FEMALE_AVATAR_SOURCES.map(
  (source, idx) => ({
    id: `preset:female:${idx + 1}`,
    source,
  }),
);

const CALLER_FEMALE_PRESET_SOURCE_BY_ID = new Map<string, ImageSourcePropType>(
  CALLER_FEMALE_AVATAR_PRESETS.map((p) => [p.id, p.source]),
);

export function resolveCallerAvatarPresetSource(
  presetId: string | null | undefined,
): ImageSourcePropType | null {
  if (!presetId) return null;
  return CALLER_FEMALE_PRESET_SOURCE_BY_ID.get(presetId) ?? null;
}

export function isCallerAvatarPresetId(value: string | null | undefined): boolean {
  if (!value) return false;
  return CALLER_FEMALE_PRESET_SOURCE_BY_ID.has(value);
}

/** Male: HTTPS URL strings. Female: bundled preset objects. */
export type AvatarPreset = string | CallerAvatarPreset;

export const CALLER_AVATAR_PRESETS: AvatarPreset[] = [
  ...CALLER_MALE_AVATAR_PRESETS,
  ...CALLER_FEMALE_AVATAR_PRESETS,
];

export function getCallerAvatarPresetsByGender(gender: Gender | null | undefined): AvatarPreset[] {
  if (gender === 'male') return CALLER_MALE_AVATAR_PRESETS;
  if (gender === 'female') return CALLER_FEMALE_AVATAR_PRESETS;
  return CALLER_AVATAR_PRESETS;
}

export function toAvatarImageSource(preset: AvatarPreset): ImageSourcePropType {
  if (typeof preset === 'object' && preset !== null && 'source' in preset) {
    return preset.source;
  }
  if (typeof preset === 'string') {
    return { uri: preset };
  }
  return preset as ImageSourcePropType;
}

/** Stored value: HTTPS for male presets, `preset:female:N` for bundled female avatars. */
export function toAvatarUri(preset: AvatarPreset): string {
  if (typeof preset === 'object' && preset !== null && 'id' in preset) {
    return preset.id;
  }
  if (typeof preset === 'string') {
    return preset;
  }
  return '';
}

export function isAllowedCallerAvatarUri(
  uri: string | null | undefined,
  gender: Gender | null | undefined,
): boolean {
  if (!uri) return false;
  return getCallerAvatarPresetsByGender(gender).some((p) =>
    typeof p === 'string' ? p === uri : p.id === uri,
  );
}

export function getDefaultCallerAvatarUriForGender(gender: Gender): string | null {
  const presets = getCallerAvatarPresetsByGender(gender);
  const first = presets[0];
  if (!first) return null;
  return typeof first === 'string' ? first : first.id;
}

export const CALLER_AUDIO_VERIFICATION_SCRIPT =
  'Hello! Friendship is very special because good friends are always by our side; they increase our happiness, decrease our sadness, and without them, everything feels incomplete—so, thank you, friends!';
