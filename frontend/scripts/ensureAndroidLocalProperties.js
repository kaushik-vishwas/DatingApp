/**
 * expo prebuild --clean deletes android/ including local.properties.
 * Gradle needs sdk.dir — recreate from ANDROID_HOME or default Windows SDK path.
 */
const fs = require('fs');
const path = require('path');

const androidDir = path.join(__dirname, '..', 'android');
const propsPath = path.join(androidDir, 'local.properties');

const candidates = [
  process.env.ANDROID_HOME,
  process.env.ANDROID_SDK_ROOT,
  process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk')
    : null,
].filter(Boolean);

const sdkDir = candidates.find((dir) => fs.existsSync(dir));

if (!sdkDir) {
  console.error(
    '[ensureAndroidLocalProperties] Android SDK not found. Set ANDROID_HOME or install Android SDK.'
  );
  process.exit(1);
}

if (!fs.existsSync(androidDir)) {
  console.error(
    '[ensureAndroidLocalProperties] android/ folder missing — run expo prebuild first.'
  );
  process.exit(1);
}

const escaped = sdkDir.replace(/\\/g, '\\\\');
fs.writeFileSync(propsPath, `sdk.dir=${escaped}\n`);
console.log(`[ensureAndroidLocalProperties] Wrote ${propsPath}`);
