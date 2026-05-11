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

/** Keep type for compatibility, but receiver now uses URL presets. */
export type CallerAvatarPreset = {
  id: string;
  source: ImageSourcePropType;
};

/** Female avatars use remote URLs only (no local asset upload). */
export const CALLER_FEMALE_AVATAR_PRESETS: string[] = [
  'https://res.cloudinary.com/dfeeqvx3v/image/upload/v1778499409/girlavt/wexwq9wrjzmmjtirknps.png',
  'https://res.cloudinary.com/dfeeqvx3v/image/upload/v1778499409/girlavt/sca7sjsdkxn3bkkzyk1b.png',
  'https://res.cloudinary.com/dfeeqvx3v/image/upload/v1778499409/girlavt/s0xonzfkqv92qyrwcvz4.png',
  'https://res.cloudinary.com/dfeeqvx3v/image/upload/v1778499409/girlavt/s0kpzium3jhfk1mhm2nq.png',
  'https://res.cloudinary.com/dfeeqvx3v/image/upload/v1778499408/girlavt/kllrg1zosnj0og2uskk7.png',
  'https://res.cloudinary.com/dfeeqvx3v/image/upload/v1778499408/girlavt/qabvx7hppbiedegicgfm.png',
  'https://res.cloudinary.com/dfeeqvx3v/image/upload/v1778499408/girlavt/ivcai4nd6vznx2gtgnoz.png',
  'https://res.cloudinary.com/dfeeqvx3v/image/upload/v1778499408/girlavt/k1daiflhmsipixs88ei3.png',
  'https://res.cloudinary.com/dfeeqvx3v/image/upload/v1778499408/girlavt/a2wemd1qf4pu94crmzyo.png',
  'https://res.cloudinary.com/dfeeqvx3v/image/upload/v1778499408/girlavt/dfpifcwevzvpe2ivuhgx.png',
  'https://res.cloudinary.com/dfeeqvx3v/image/upload/v1778499408/girlavt/yfwuel4gnc1fbaps1adu.png',
  'https://res.cloudinary.com/dfeeqvx3v/image/upload/v1778499407/girlavt/be7qcpmszpxd0dxvyxyk.png',
  'https://res.cloudinary.com/dfeeqvx3v/image/upload/v1778499407/girlavt/ihebuaeozubmumklyn0d.png',
  'https://res.cloudinary.com/dfeeqvx3v/image/upload/v1778499407/girlavt/gmiretont6jdciubcfsl.png',
  'https://res.cloudinary.com/dfeeqvx3v/image/upload/v1778499407/girlavt/ovg3wbgqrlkdrrrtds5e.png',
  'https://res.cloudinary.com/dfeeqvx3v/image/upload/v1778499407/girlavt/rlfudwpbrnr6vajmbziq.png',
  'https://res.cloudinary.com/dfeeqvx3v/image/upload/v1778499407/girlavt/jfnp6izyhpokmxbmuuey.png',
  'https://res.cloudinary.com/dfeeqvx3v/image/upload/v1778499407/girlavt/cbqv8ya0uk7xe5ldlx8n.png',
  'https://res.cloudinary.com/dfeeqvx3v/image/upload/v1778499406/girlavt/hdeqf4gtbrp4dsq66u7i.png',
  'https://res.cloudinary.com/dfeeqvx3v/image/upload/v1778499407/girlavt/vq7k6pmupo5o7fdyktzk.png',
  'https://res.cloudinary.com/dfeeqvx3v/image/upload/v1778499406/girlavt/c8eb7yyalnyhnvpajyjk.png',
  'https://res.cloudinary.com/dfeeqvx3v/image/upload/v1778499406/girlavt/wmutjkcvixgpmyprbvwi.png',
  'https://res.cloudinary.com/dfeeqvx3v/image/upload/v1778499406/girlavt/n11gv4pnrpdfyuku4wlx.png',
  'https://res.cloudinary.com/dfeeqvx3v/image/upload/v1778499406/girlavt/mmhmarcalyznpr04bksw.png',
  'https://res.cloudinary.com/dfeeqvx3v/image/upload/v1778499406/girlavt/wjvs2jfvngnkn23cmsej.png',
  'https://res.cloudinary.com/dfeeqvx3v/image/upload/v1778499405/girlavt/m2ays7unaozygjqlhiwi.png',
  'https://res.cloudinary.com/dfeeqvx3v/image/upload/v1778499405/girlavt/qr8lrmwqqmhpg153slp7.png',
];

/** Backward compatibility for older saved values like `preset:female:1`. */
const LEGACY_FEMALE_PRESET_URL_BY_ID = new Map<string, string>(
  CALLER_FEMALE_AVATAR_PRESETS.map((url, idx) => [`preset:female:${idx + 1}`, url]),
);

export function resolveCallerAvatarPresetSource(
  presetId: string | null | undefined,
): ImageSourcePropType | null {
  if (!presetId) return null;
  const url = LEGACY_FEMALE_PRESET_URL_BY_ID.get(presetId);
  return url ? { uri: url } : null;
}

export function isCallerAvatarPresetId(value: string | null | undefined): boolean {
  if (!value) return false;
  return LEGACY_FEMALE_PRESET_URL_BY_ID.has(value);
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
