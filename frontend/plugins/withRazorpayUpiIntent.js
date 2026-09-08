// @ts-check
/**
 * Expo config plugin: declare UPI app visibility (Android 11+) and iOS URL schemes
 * so Razorpay Standard Checkout can list GPay / PhonePe / Paytm / Amazon Pay etc.
 * and open them via UPI Intent on tap.
 */
const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

/** Popular UPI / wallet packages Razorpay intent may open. */
const UPI_PACKAGES = [
  'com.google.android.apps.nbu.paisa.user', // Google Pay
  'com.phonepe.app',
  'net.one97.paytm',
  'in.amazon.mShop.android.shopping',
  'com.amazon.mobile.shopping',
  'in.org.npci.upiapp', // BHIM
  'com.dreamplug.androidapp', // CRED
  'com.mobikwik_new',
  'com.freecharge.android',
  'com.whatsapp',
  'com.csam.icici.bank.imobile',
  'com.axis.mobile',
  'com.sbi.lotusintouch',
  'com.myairtelapp',
  'com.snapwork.hdfc',
];

/**
 * @param {import('@expo/config-plugins').AndroidManifest} androidManifest
 */
function ensureUpiQueries(androidManifest) {
  const manifest = androidManifest.manifest;
  if (!manifest) return androidManifest;

  if (!manifest.queries) {
    manifest.queries = [];
  }

  /** @type {Record<string, unknown>[]} */
  const queries = manifest.queries;

  const hasUpiIntent = queries.some((q) => {
    const intents = q.intent;
    if (!Array.isArray(intents)) return false;
    return intents.some((intent) => {
      const data = intent.data;
      if (!Array.isArray(data)) return false;
      return data.some((d) => d?.$?.['android:scheme'] === 'upi');
    });
  });

  if (!hasUpiIntent) {
    queries.push({
      intent: [
        {
          action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
          data: [{ $: { 'android:scheme': 'upi' } }],
        },
      ],
    });
  }

  for (const pkg of UPI_PACKAGES) {
    const exists = queries.some((q) => {
      const packages = q.package;
      if (!Array.isArray(packages)) return false;
      return packages.some((p) => p?.$?.['android:name'] === pkg);
    });
    if (!exists) {
      queries.push({
        package: [{ $: { 'android:name': pkg } }],
      });
    }
  }

  return androidManifest;
}

/**
 * @param {import('@expo/config-plugins').ExpoConfig} config
 */
function withRazorpayUpiIntent(config) {
  return withAndroidManifest(config, (cfg) => {
    cfg.modResults = ensureUpiQueries(cfg.modResults);
    cfg.modResults = AndroidConfig.Manifest.ensureToolsAvailable(cfg.modResults);
    return cfg;
  });
}

module.exports = withRazorpayUpiIntent;
