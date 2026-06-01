/* eslint-env node */
/**
 * Unified Expo app — no forced appKind; role chosen at login (RoleGate).
 * Loads `frontend/.env` at config time for EXPO_PUBLIC_API_BASE_URL.
 */
const path = require('path');
const fs = require('fs');
const PROD_API = 'https://backend.nesthamapp.com';

require('dotenv').config({ path: path.join(__dirname, '.env') });

const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'app.json'), 'utf8'));

const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
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
      package: appKind ? `${baseAndroidPackage}.${appKind}` : baseAndroidPackage,
      permissions: [
        'android.permission.RECORD_AUDIO',
        'android.permission.CAMERA',
        'android.permission.INTERNET',
        'android.permission.ACCESS_NETWORK_STATE',
        'android.permission.POST_NOTIFICATIONS',
        'android.permission.VIBRATE',
      ],
      usesCleartextTraffic: false,
    },
    plugins: [
      ...(appJson.expo.plugins || []),
      [
        'expo-build-properties',
        {
          android: {
            minSdkVersion: 24,
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
      cloudinaryCloudName,
      cloudinaryUploadPreset,
      appKind: appKind || undefined,
    },
  },
};
