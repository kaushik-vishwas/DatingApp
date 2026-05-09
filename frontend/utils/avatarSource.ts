import type { ImageSourcePropType } from 'react-native';

import { CALLER_AVATAR_PRESETS, resolveCallerAvatarPresetSource } from '../constants/userOnboarding';

export function resolveProfileImageSource(
  profileImage: string | null | undefined,
): ImageSourcePropType | null {
  if (!profileImage) return null;
  if (profileImage === 'local-avatar') {
    return CALLER_AVATAR_PRESETS[0]?.source ?? null;
  }
  const presetSource = resolveCallerAvatarPresetSource(profileImage);
  if (presetSource) return presetSource;
  return { uri: profileImage };
}
