import type { Request, Response } from 'express';

/**
 * GET /app/update-policy — public; used by the mobile app on launch.
 * Controlled via env so you can raise min/latest without an app rebuild.
 */
export const getAppUpdatePolicy = async (_req: Request, res: Response): Promise<void> => {
  try {
    const enabled = process.env.APP_UPDATE_ENABLED?.trim().toLowerCase() === 'true';
    const minAndroidVersionCode = Math.max(
      0,
      Number(process.env.APP_UPDATE_MIN_ANDROID_VERSION_CODE ?? 0) || 0
    );
    const latestAndroidVersionCode = Math.max(
      minAndroidVersionCode,
      Number(process.env.APP_UPDATE_LATEST_ANDROID_VERSION_CODE ?? minAndroidVersionCode) ||
        minAndroidVersionCode
    );
    const force =
      process.env.APP_UPDATE_FORCE?.trim().toLowerCase() !== 'false' && minAndroidVersionCode > 0;
    const message =
      process.env.APP_UPDATE_MESSAGE?.trim() ||
      'A new version of Selecto is available on the Play Store. Please update.';
    const playStoreUrl =
      process.env.APP_UPDATE_PLAY_STORE_URL?.trim() ||
      'https://play.google.com/store/apps/details?id=com.selecto.app';
    const title = process.env.APP_UPDATE_TITLE?.trim() || 'Update Selecto';

    res.json({
      enabled,
      force,
      minAndroidVersionCode,
      latestAndroidVersionCode,
      title,
      message,
      playStoreUrl,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('getAppUpdatePolicy error:', msg);
    res.status(500).json({ message: msg || 'Server error' });
  }
};
