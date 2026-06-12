const fs = require('fs');
const path = require('path');

const source = path.join(__dirname, '..', '..', 'config', 'referralLanding.json');
const targetDir = path.join(__dirname, '..', 'dist', 'config');
const target = path.join(targetDir, 'referralLanding.json');

if (!fs.existsSync(source)) {
  console.warn('[copyReferralLandingConfig] Missing source:', source);
  process.exit(0);
}

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, target);
console.log('[copyReferralLandingConfig] Copied to', target);
