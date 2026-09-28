import { stopIncomingRingtonePlayback } from './callSounds';
import {
  clearIncomingCallNotificationDedupe,
  dismissAllIncomingCallNotifications,
  setReceiverIncomingCallUiEnabled,
} from './incomingCallNotifications';
import {
  clearPendingIncomingCallTap,
  clearShownIncomingCallNotification,
} from './pendingIncomingCallTapStorage';
import { clearNativeCallCredentials, stopReceiverOnlineKeepAlive } from './receiverOnlineKeepAlive';

/** Clear receiver/caller call session state on logout, account switch, or superseded login. */
export async function teardownCallSession(): Promise<void> {
  setReceiverIncomingCallUiEnabled(false);
  stopReceiverOnlineKeepAlive();
  clearNativeCallCredentials();
  await stopIncomingRingtonePlayback();
  clearIncomingCallNotificationDedupe();
  await dismissAllIncomingCallNotifications();
  await clearPendingIncomingCallTap();
  await clearShownIncomingCallNotification();
}
