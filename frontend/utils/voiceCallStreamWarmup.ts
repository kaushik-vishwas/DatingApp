import Constants from 'expo-constants';
import type { VoiceBootstrapResponse } from '../types/api';
import { profileImageUrlForStreamOrNetwork } from './avatarSource';
import { hasVoiceCallMicrophonePermission } from './voiceCallPermissions';

type StreamSdkModule = {
  StreamVideoClient: {
    getOrCreateInstance: (args: {
      apiKey: string;
      user: { id: string; name: string; image?: string };
      token: string;
    }) => unknown;
  };
};

let cachedStreamSdkModule: StreamSdkModule | null = null;

function loadStreamSdkModule(): StreamSdkModule | null {
  if (Constants.appOwnership === 'expo') return null;
  if (cachedStreamSdkModule) return cachedStreamSdkModule;
  try {
    cachedStreamSdkModule = require('@stream-io/video-react-native-sdk') as StreamSdkModule;
    return cachedStreamSdkModule;
  } catch {
    return null;
  }
}

const warmedCallIds = new Set<string>();

/** Pre-create Stream client during ring so join() is faster after accept (Samsung cold start). */
export async function warmVoiceCallStreamClient(
  boot: VoiceBootstrapResponse,
  displayName: string,
  profileImage: string | null | undefined
): Promise<void> {
  const callId = boot.callId?.trim();
  if (!callId || warmedCallIds.has(callId)) return;

  const streamSdk = loadStreamSdkModule();
  if (!streamSdk) return;

  try {
    // Never prompt here — permissions are asked while ringing / before dial.
    if (!(await hasVoiceCallMicrophonePermission())) return;

    streamSdk.StreamVideoClient.getOrCreateInstance({
      apiKey: boot.apiKey,
      user: {
        id: boot.streamUserId,
        name: displayName.trim() || 'User',
        image: profileImageUrlForStreamOrNetwork(profileImage),
      },
      token: boot.token,
    });
    warmedCallIds.add(callId);
  } catch {
    // Best-effort; VoiceCallScreen join still runs.
  }
}

export function clearVoiceCallStreamWarmup(callId?: string): void {
  const id = callId?.trim();
  if (!id) {
    warmedCallIds.clear();
    return;
  }
  warmedCallIds.delete(id);
}
