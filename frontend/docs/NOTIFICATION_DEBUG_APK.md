# Incoming call notification debug APK

Use this build when a tester (e.g. on Samsung) can reproduce **compact tap works, expanded shade tap fails**.

## Build (Windows)

```bash
cd frontend
npm run android:apk:notif-debug
```

APK output: `frontend/android/app/build/outputs/apk/release/app-release.apk`

Share that APK with testers. It is the same app with **file logging only** — normal production builds do **not** set `EXPO_PUBLIC_INCOMING_CALL_NOTIF_DEBUG=1`, so logging and the purple **Debug report** button are off.

## Tester steps (non-technical)

1. Install the debug APK (allow “Install unknown apps” if asked).
2. Sign in as a **receiver** and allow notifications.
3. Put the app in the background (Home button).
4. Receive a test incoming call notification.
5. **Test A — compact:** Tap the small popup at the top. Note whether Incoming Call opens.
6. **Test B — expanded:** Open the notification shade, expand the call row, tap the large area. Note if it only opens the home screen.
7. Open the app. Tap the purple **Debug report** button (bottom-right).
8. Tap **Send report** and share the file via WhatsApp, Gmail, or email to support.

## What we log (for engineers)

Each line is JSON with `ts`, `step`, `appState`, `showSessionId`, and details.

| Signal | Meaning |
|--------|--------|
| `response.listener` + `response.raw` | Expo delivered a proper notification tap (common on **compact** tap). |
| `app_state.active` with high `msSinceResponseListener` | App foregrounded **without** a recent response listener (suspect **expanded** tap). |
| `snapshot` → `lastResponse: null` after expanded tap | System opened app but did not pass notification extras. |
| `snapshot.presentedCount` > 1 | Duplicate tray rows (Samsung PendingIntent collision). |
| `linking.initial` / `linking.url` without `call_incoming` data | Launcher-only open, no deep link. |

Device brand, model, and Android version are recorded once at the top of the file.

## Clear log

In the debug overlay, **Clear log** removes the file on device before a new reproduction.
