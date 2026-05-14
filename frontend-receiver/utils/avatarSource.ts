import type { ImageSourcePropType } from 'react-native';
import { Image } from 'react-native';

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
  // Never pass `preset:...` through as a network URI — RN throws "No suitable URL request handler".
  if (profileImage.trimStart().startsWith('preset:')) return null;
  return { uri: profileImage };
}

/**
 * Stream / native code that only accepts a string URL (not `require()` sources).
 * Resolves bundled preset ids to a `file://` or `http://localhost` asset URI from Metro.
 */
export function profileImageUrlForStreamOrNetwork(
  profileImage: string | null | undefined,
): string | undefined {
  if (!profileImage?.trim()) return undefined;
  const t = profileImage.trim();
  const preset = resolveCallerAvatarPresetSource(t);
  if (preset != null) {
    const resolved = Image.resolveAssetSource(preset);
    return typeof resolved?.uri === 'string' ? resolved.uri : undefined;
  }
  if (t.startsWith('file:') || t.startsWith('content:') || /^https?:\/\//i.test(t)) {
    return t;
  }
  return undefined;
}
