// @ts-check
const fs = require('fs');
const path = require('path');
const {
  withAndroidManifest,
  withDangerousMod,
  AndroidConfig,
} = require('@expo/config-plugins');

const APP_PACKAGE = 'com.kaushikvishwas.frontend';
const FCM_SERVICE = `${APP_PACKAGE}.fcm.NesthamFirebaseMessagingService`;
const EXPO_FCM_SERVICE = 'expo.modules.notifications.service.ExpoFirebaseMessagingService';

/**
 * Replaces Expo's FirebaseMessagingService so data-only incoming_call pushes
 * present a local notification before JS loads (killed app).
 */
function withIncomingCallFcm(config) {
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    if (!manifest.manifest.$) {
      manifest.manifest.$ = {};
    }
    manifest.manifest.$['xmlns:tools'] =
      manifest.manifest.$['xmlns:tools'] ?? 'http://schemas.android.com/tools';

    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    if (!app.service) {
      app.service = [];
    }

    app.service = app.service.filter((entry) => {
      const name = entry.$?.['android:name'] ?? '';
      return (
        !name.includes('ExpoFirebaseMessagingService') &&
        !name.includes('NesthamFirebaseMessagingService')
      );
    });

    app.service.push({
      $: {
        'android:name': FCM_SERVICE,
        'android:exported': 'false',
      },
      'intent-filter': [
        {
          action: [
            {
              $: {
                'android:name': 'com.google.firebase.MESSAGING_EVENT',
              },
            },
          ],
        },
      ],
    });

    // Ensure merged library service does not register a second handler.
    app.service.push({
      $: {
        'android:name': EXPO_FCM_SERVICE,
        'tools:node': 'remove',
      },
    });

    return config;
  });

  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const packagePath = FCM_SERVICE.split('.').slice(0, -1);
      const targetDir = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        ...packagePath
      );
      fs.mkdirSync(targetDir, { recursive: true });

      const sourceDir = path.join(projectRoot, 'plugins', 'incoming-call-fcm', 'android');
      for (const file of ['NesthamFirebaseMessagingService.kt', 'IncomingCallFcmPresenter.kt']) {
        fs.copyFileSync(path.join(sourceDir, file), path.join(targetDir, file));
      }
      return config;
    },
  ]);

  return config;
}

module.exports = withIncomingCallFcm;
