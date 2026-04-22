/* eslint-env node */
/**
 * Loads `frontend/.env` at config time so `EXPO_PUBLIC_API_BASE_URL` is available
 * via Constants.expoConfig.extra.apiBaseUrl in the app (fixes Metro not inlining env).
 */
const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'app.json'), 'utf8'));

const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
const fromAppJson = appJson.expo?.extra?.apiBaseUrl?.trim();

function normalizeOrigin(url) {
  if (!url) return url;
  let u = url.replace(/\/+$/, '');
  if (u.endsWith('/auth')) u = u.slice(0, -5).replace(/\/+$/, '');
  return u;
}

const apiBaseUrl =
  normalizeOrigin(fromEnv) ||
  normalizeOrigin(fromAppJson) ||
  'http://localhost:5000';

module.exports = {
  expo: {
    ...appJson.expo,
    plugins: [
      ...(appJson.expo.plugins || []),
      '@react-native-community/datetimepicker',
      '@stream-io/video-react-native-sdk',
    ],
    extra: {
      ...(appJson.expo.extra || {}),
      eas: {
        ...((appJson.expo.extra && appJson.expo.extra.eas) || {}),
        projectId: '0ca964b8-cc50-4b02-b4f1-63e66b6b10c0',
      },
      apiBaseUrl,
    },
  },
};
