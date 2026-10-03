/**
 * Native ringtones play from android/app/src/main/res/raw, which is only
 * refreshed on prebuild. Copy the current asset files before an APK build.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const destDir = path.join(root, 'android', 'app', 'src', 'main', 'res', 'raw');
fs.mkdirSync(destDir, { recursive: true });

for (const name of ['receiver_ringtone.mp3', 'caller_ringtone.mp3']) {
  const from = path.join(root, 'assets', 'sounds', name);
  if (!fs.existsSync(from)) continue;
  fs.copyFileSync(from, path.join(destDir, name));
}
