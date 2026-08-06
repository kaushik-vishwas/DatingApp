/** Edit these before deploying. Keep in sync with frontend/app.json → extra.appShare */
window.INVITE_CONFIG = {
  appName: 'Selecto',
  apiBaseUrl: 'https://backend.nesthamapp.com',
  /** Play internal testing link, APK page, etc. Leave empty until you have one. */
  androidInstallUrl: '',
  /**
   * Base Play Store listing. Invite code is appended at click time as
   * &referrer=… so Play Install Referrer can credit the sharer.
   */
  androidStoreUrl: 'https://play.google.com/store/apps/details?id=com.selecto.app',
  distribution: 'store', // 'testing' | 'store'
  deepLinkScheme: 'nestham',
};
