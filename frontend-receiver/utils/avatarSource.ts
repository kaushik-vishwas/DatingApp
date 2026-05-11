import type { ImageSourcePropType } from 'react-native';

import {
  CALLER_FEMALE_AVATAR_PRESETS,
  resolveCallerAvatarPresetSource,
} from '../constants/userOnboarding';

/** Resolve stored profileImage for display: preset id → bundled asset, else HTTPS/local URI. */
export function resolveProfileImageSource(
  profileImage: string | null | undefined,
): ImageSourcePropType | null {
  if (!profileImage) return null;
  if (profileImage === 'local-avatar') {
    const firstFemaleUrl = CALLER_FEMALE_AVATAR_PRESETS[0];
    return firstFemaleUrl ? { uri: firstFemaleUrl } : null;
  }
  const presetSource = resolveCallerAvatarPresetSource(profileImage);
  if (presetSource) return presetSource;
  return { uri: profileImage };
}
