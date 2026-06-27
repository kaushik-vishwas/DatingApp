// @ts-check
const fs = require('fs');
const path = require('path');
const {
  withAndroidManifest,
  withDangerousMod,
  AndroidConfig,
} = require('@expo/config-plugins');

const APP_PACKAGE = 'com.selecto.app';
const FCM_SERVICE = `${APP_PACKAGE}.fcm.NesthamFirebaseMessagingService`;
const EXPO_FCM_SERVICE = 'expo.modules.notifications.service.ExpoFirebaseMessagingService';
const FIREBASE_MESSAGING_DEP = 'implementation("com.google.firebase:firebase-messaging")';
const CLEAN_WORKAROUND_MARKER = '[nestham] RN new-arch clean workaround';

function ensureGradleCleanWorkaround(appBuildGradlePath) {
  if (!fs.existsSync(appBuildGradlePath)) return;
  const gradle = fs.readFileSync(appBuildGradlePath, 'utf8');
  if (gradle.includes(CLEAN_WORKAROUND_MARKER)) return;
  const snippet = `

// ${CLEAN_WORKAROUND_MARKER}
gradle.taskGraph.whenReady { taskGraph ->
    if (taskGraph.allTasks.any { it.name == "clean" }) {
        ["externalNativeBuildCleanDebug", "externalNativeBuildCleanRelease"].each { taskName ->
            def nativeClean = tasks.findByName(taskName)
            if (nativeClean != null) {
                nativeClean.enabled = false
            }
        }
    }
}
tasks.matching { it.name == "clean" }.configureEach {
    doLast {
        delete file("\${projectDir}/.cxx")
    }
}
`;
  fs.appendFileSync(appBuildGradlePath, snippet);
}

function ensureFirebaseMessagingDependency(appBuildGradlePath) {
  if (!fs.existsSync(appBuildGradlePath)) return;
  const gradle = fs.readFileSync(appBuildGradlePath, 'utf8');
  if (gradle.includes('com.google.firebase:firebase-messaging')) return;
  const updated = gradle.replace(
    /dependencies\s*\{\s*\n\s*\/\/ The version of react-native is set by the React Native Gradle Plugin\s*\n\s*implementation\("com\.facebook\.react:react-android"\)/m,
    (match) => `${match}\n    ${FIREBASE_MESSAGING_DEP}`
  );
  fs.writeFileSync(appBuildGradlePath, updated);
}

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
      for (const file of [
        'NesthamFirebaseMessagingService.kt',
        'IncomingCallFcmPresenter.kt',
        'IncomingCallNotificationChannels.kt',
      ]) {
        fs.copyFileSync(path.join(sourceDir, file), path.join(targetDir, file));
      }

      const rawDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res', 'raw');
      fs.mkdirSync(rawDir, { recursive: true });
      const ringSrc = path.join(projectRoot, 'assets', 'sounds', 'receiver_ringtone.mp3');
      if (fs.existsSync(ringSrc)) {
        fs.copyFileSync(ringSrc, path.join(rawDir, 'receiver_ringtone.mp3'));
      }

      const appBuildGradlePath = path.join(projectRoot, 'android', 'app', 'build.gradle');
      ensureFirebaseMessagingDependency(appBuildGradlePath);
      ensureGradleCleanWorkaround(appBuildGradlePath);
      return config;
    },
  ]);

  return config;
}

module.exports = withIncomingCallFcm;
