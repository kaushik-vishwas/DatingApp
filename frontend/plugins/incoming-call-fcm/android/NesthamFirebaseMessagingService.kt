package com.kaushikvishwas.frontend.fcm

import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.notifications.RemoteMessageSerializer
import expo.modules.notifications.service.ExpoFirebaseMessagingService
import expo.modules.notifications.service.delegates.FirebaseMessagingDelegate

/**
 * Handles data-only incoming-call FCM before the default Expo delegate can surface
 * a system tray row (killed app / Samsung). Still runs expo-task-manager for JS fallback.
 */
class NesthamFirebaseMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    if (IncomingCallFcmPresenter.presentIfIncomingCall(applicationContext, remoteMessage)) {
      FirebaseMessagingDelegate.runTaskManagerTasks(
        applicationContext,
        RemoteMessageSerializer.toBundle(remoteMessage)
      )
      return
    }
    super.onMessageReceived(remoteMessage)
  }
}
