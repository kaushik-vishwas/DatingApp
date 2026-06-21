/** Edit these before deploying. Keep in sync with frontend/app.json → extra.appShare */
window.INVITE_CONFIG = {
  appName: 'Selecto',
  apiBaseUrl: 'https://backend.nesthamapp.com',
  /** Play internal testing link, APK page, etc. Leave empty until you have one. */
  androidInstallUrl: '',
  /** Used after public Play Store release */
  androidStoreUrl:
    'https://play.google.com/store/apps/details?id=com.kaushikvishwas.frontend',
  distribution: 'testing', // 'testing' | 'store'
  deepLinkScheme: 'nestham',
};
