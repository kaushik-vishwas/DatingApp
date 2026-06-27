/* eslint-env node */
/**
 * Unified Expo app — no forced appKind; role chosen at login (RoleGate).
 * Loads `frontend/.env` at config time for EXPO_PUBLIC_API_BASE_URL.
 * Call-screen capture protection: EXPO_PUBLIC_CALL_SCREEN_CAPTURE_PROTECTION=true blocks recording.
 */
const path = require('path');
const fs = require('fs');
const PROD_API = 'https://backend.nesthamapp.com';

require('dotenv').config({ path: path.join(__dirname, '.env') });

const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'app.json'), 'utf8'));
const referralLandingJsonPath = path.join(__dirname, '..', 'config', 'referralLanding.json');
const referralLandingConfig = fs.existsSync(referralLandingJsonPath)
  ? JSON.parse(fs.readFileSync(referralLandingJsonPath, 'utf8'))
  : {};

const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
const disablePackagerHost = process.env.EXPO_PUBLIC_API_DISABLE_PACKAGER_HOST === 'true';
const callScreenCaptureProtection =
  process.env.EXPO_PUBLIC_CALL_SCREEN_CAPTURE_PROTECTION?.trim().toLowerCase() === 'true';
const fromAppJson = appJson.expo?.extra?.apiBaseUrl?.trim();
const cloudNameFromEnv = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim();
const uploadPresetFromEnv = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET?.trim();
const cloudNameFromAppJson = appJson.expo?.extra?.cloudinaryCloudName?.trim();
const uploadPresetFromAppJson = appJson.expo?.extra?.cloudinaryUploadPreset?.trim();
/** Unified build: both caller and receiver flows; role chosen in-app. */
const appKind = '';

function normalizeOrigin(url) {
  if (!url) return url;
  let u = url.replace(/\/+$/, '');
  if (u.endsWith('/auth')) u = u.slice(0, -5).replace(/\/+$/, '');
  return u;
}

const apiBaseUrl =
  normalizeOrigin(fromEnv) ||
  normalizeOrigin(fromAppJson) ||
  PROD_API;
const cloudinaryCloudName = cloudNameFromEnv || cloudNameFromAppJson || '';
const cloudinaryUploadPreset = uploadPresetFromEnv || uploadPresetFromAppJson || '';
const referralLandingBaseUrl =
  process.env.EXPO_PUBLIC_REFERRAL_LANDING_BASE_URL?.trim() ||
  referralLandingConfig.referralLandingBaseUrl?.trim() ||
  appJson.expo?.extra?.appShare?.referralLandingBaseUrl?.trim() ||
  '';
const nameSuffix = appKind ? `-${appKind}` : '';
const baseName = appJson.expo?.name || 'frontend';
const baseSlug = appJson.expo?.slug || 'frontend';
const baseAndroidPackage = appJson.expo?.android?.package || 'com.kaushikvishwas.frontend';

module.exports = {
  expo: {
    ...appJson.expo,
    name: `${baseName}${nameSuffix}`,
    slug: `${baseSlug}${nameSuffix}`,
    android: {
      ...(appJson.expo.android || {}),
      intentFilters: appJson.expo.android?.intentFilters ?? [
        {
          action: 'VIEW',
          data: [{ scheme: 'nestham' }],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
      package: appKind ? `${baseAndroidPackage}.${appKind}` : baseAndroidPackage,
      permissions: [
        'android.permission.RECORD_AUDIO',
        'android.permission.CAMERA',
        'android.permission.INTERNET',
        'android.permission.ACCESS_NETWORK_STATE',
        'android.permission.POST_NOTIFICATIONS',
        'android.permission.VIBRATE',
        'android.permission.READ_PHONE_STATE',
      ],
      usesCleartextTraffic: true,
    },
    plugins: [
      ...(appJson.expo.plugins || []),
      [
        'expo-build-properties',
        {
          android: {
            minSdkVersion: 24,
            // Real devices only (e.g. Samsung M31). Skips x86 emulator ABIs — faster builds, ~90MB APK.
            buildArchs: ['arm64-v8a'],
          },
        },
      ],
      '@react-native-community/datetimepicker',
      '@stream-io/video-react-native-sdk',
      [
        'expo-notifications',
        {
          icon: './assets/SelectoLogo.png',
          color: '#7c3aed',
        },
      ],
    ],
    extra: {
      ...(appJson.expo.extra || {}),
      eas: {
        ...((appJson.expo.extra && appJson.expo.extra.eas) || {}),
        projectId: '50a75fe3-fe9e-42c4-83f9-8f4efb188a31',
      },
      apiBaseUrl,
      disablePackagerHost,
      callScreenCaptureProtection,
      cloudinaryCloudName,
      cloudinaryUploadPreset,
      appKind: appKind || undefined,
      appShare: {
        ...(appJson.expo.extra?.appShare || {}),
        ...(referralLandingBaseUrl ? { referralLandingBaseUrl } : {}),
      },
    },
  },
};
