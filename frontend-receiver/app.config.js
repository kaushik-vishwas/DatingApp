/* eslint-env node */
/**
 * Loads `frontend/.env` at config time so `EXPO_PUBLIC_API_BASE_URL` is available
 * via Constants.expoConfig.extra.apiBaseUrl in the app (fixes Metro not inlining env).
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
const appKind = 'receiver';

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
    owner: "kaushik-vishwas1",
    name: `${baseName}${nameSuffix}`,
    slug: `${baseSlug}${nameSuffix}`,
    android: {
      ...(appJson.expo.android || {}),
      package: appKind ? `${baseAndroidPackage}.${appKind}` : baseAndroidPackage,
    },
    plugins: [
      ...(appJson.expo.plugins || []),
      '@react-native-community/datetimepicker',
      '@stream-io/video-react-native-sdk',
    ],
    extra: {
      ...(appJson.expo.extra || {}),
      eas: {
        projectId: "139155c1-c334-4610-9b95-b3fb93e4e860",
      },
      apiBaseUrl,
      cloudinaryCloudName,
      cloudinaryUploadPreset,
      appKind: appKind || undefined,
    },
  },
};
