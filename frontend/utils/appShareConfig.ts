import Constants from 'expo-constants';

export type AppShareDistribution = 'testing' | 'store';

export type AppShareConfig = {
  displayName: string;
  distribution: AppShareDistribution;
  /** Play Console internal/closed testing opt-in link, APK page, etc. */
  androidInstallUrl: string;
  /** Public Play Store listing (after production release). */
  androidStoreUrl: string;
  iosInstallUrl: string;
  referralLandingBaseUrl: string;
};

const ANDROID_PACKAGE = 'com.kaushikvishwas.frontend';

function readExtraShare(): Record<string, unknown> {
  const c = Constants as {
    expoConfig?: { extra?: { appShare?: Record<string, unknown> } };
    manifest?: { extra?: { appShare?: Record<string, unknown> } };
  };
  const raw = c.expoConfig?.extra?.appShare ?? c.manifest?.extra?.appShare;
  return raw && typeof raw === 'object' ? raw : {};
}

export function getAppShareConfig(): AppShareConfig {
  const extra = readExtraShare();
  const displayName =
    (typeof extra.displayName === 'string' && extra.displayName.trim()) ||
    (typeof Constants.expoConfig?.name === 'string' && Constants.expoConfig.name !== 'frontend'
      ? Constants.expoConfig.name
      : 'Selecto');
  const distribution: AppShareDistribution =
    extra.distribution === 'store' ? 'store' : 'testing';
  const androidStoreUrl =
    (typeof extra.androidStoreUrl === 'string' && extra.androidStoreUrl.trim()) ||
    `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
  return {
    displayName,
    distribution,
    androidInstallUrl:
      typeof extra.androidInstallUrl === 'string' ? extra.androidInstallUrl.trim() : '',
    androidStoreUrl,
    iosInstallUrl: typeof extra.iosInstallUrl === 'string' ? extra.iosInstallUrl.trim() : '',
    referralLandingBaseUrl:
      (typeof extra.referralLandingBaseUrl === 'string' && extra.referralLandingBaseUrl.trim()) || '',
  };
}

export function buildReferralInviteUrl(referralCode: string, config = getAppShareConfig()): string {
  const base = config.referralLandingBaseUrl.replace(/\/+$/, '');
  return `${base}/${encodeURIComponent(referralCode.trim().toUpperCase())}`;
}

export function buildAppShareMessage(options?: {
  referralCode?: string | null;
  shareUrl?: string | null;
}): { title: string; message: string } {
  const config = getAppShareConfig();
  const name = config.displayName;
  const lines: string[] = [`Join ${name} — voice calls and chat.`];

  const code = options?.referralCode?.trim().toUpperCase();
  const inviteUrl = options?.shareUrl?.trim() || (code ? buildReferralInviteUrl(code, config) : '');

  if (code) {
    lines.push('');
    lines.push(`My invite code: ${code}`);
  }
  if (inviteUrl) {
    lines.push(inviteUrl);
  }

  lines.push('');

  if (config.distribution === 'store') {
    lines.push('Download the app:');
    lines.push(config.androidStoreUrl);
    if (config.iosInstallUrl) lines.push(config.iosInstallUrl);
  } else if (config.androidInstallUrl) {
    lines.push('Install (Android beta testers):');
    lines.push(config.androidInstallUrl);
  } else {
    lines.push(
      `${name} is in beta testing. Install link coming soon — use the invite code above when you sign up.`
    );
  }

  return {
    title: `Invite to ${name}`,
    message: lines.join('\n'),
  };
}
