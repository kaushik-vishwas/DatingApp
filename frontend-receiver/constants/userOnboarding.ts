import type { Gender } from '../types/user';
import { Image } from 'react-native';
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

export type AvatarPreset = string | number;

export const CALLER_FEMALE_AVATAR_PRESETS: AvatarPreset[] = [
  'https://randomuser.me/api/portraits/women/1.jpg',
  'https://randomuser.me/api/portraits/women/2.jpg',
  'https://randomuser.me/api/portraits/women/3.jpg',
  'https://randomuser.me/api/portraits/women/4.jpg',
  'https://randomuser.me/api/portraits/women/5.jpg',
  'https://randomuser.me/api/portraits/women/6.jpg',
  'https://randomuser.me/api/portraits/women/7.jpg',
  'https://randomuser.me/api/portraits/women/8.jpg',
  'https://randomuser.me/api/portraits/women/9.jpg',
  'https://randomuser.me/api/portraits/women/10.jpg',
  'https://randomuser.me/api/portraits/women/11.jpg',
  'https://randomuser.me/api/portraits/women/12.jpg',
  'https://randomuser.me/api/portraits/women/13.jpg',
  'https://randomuser.me/api/portraits/women/14.jpg',
  'https://randomuser.me/api/portraits/women/15.jpg',
  'https://randomuser.me/api/portraits/women/16.jpg',
  'https://randomuser.me/api/portraits/women/17.jpg',
  'https://randomuser.me/api/portraits/women/18.jpg',
  'https://randomuser.me/api/portraits/women/19.jpg',
  'https://randomuser.me/api/portraits/women/20.jpg',
  'https://randomuser.me/api/portraits/women/21.jpg',
  'https://randomuser.me/api/portraits/women/22.jpg',
  'https://randomuser.me/api/portraits/women/23.jpg',
  'https://randomuser.me/api/portraits/women/24.jpg',
  'https://randomuser.me/api/portraits/women/25.jpg',
  'https://randomuser.me/api/portraits/women/26.jpg',
  'https://randomuser.me/api/portraits/women/27.jpg',
];

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
  return typeof preset === 'string' ? { uri: preset } : preset;
}

export function toAvatarUri(preset: AvatarPreset): string {
  if (typeof preset === 'string') return preset;
  return Image.resolveAssetSource(preset)?.uri ?? '';
}

export const CALLER_AUDIO_VERIFICATION_SCRIPT =
  'Hello! Friendship is very special because good friends are always by our side; they increase our happiness, decrease our sadness, and without them, everything feels incomplete—so, thank you, friends!';
