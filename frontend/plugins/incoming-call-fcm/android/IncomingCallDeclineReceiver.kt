package com.selecto.app.fcm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telecom.DisconnectCause
import androidx.core.app.NotificationManagerCompat
import expo.modules.incomingcallandroid.DeclinedCallRegistry
import expo.modules.incomingcallandroid.IncomingCallRingtonePlayer
import expo.modules.incomingcallandroid.NativeCallApi
import expo.modules.incomingcallandroid.SelectoTelecom

/**
 * Handles Decline on the CallStyle incoming-call notification: silences the ring, clears the
 * tray and rejects the invite on the server (REST, works while the app / JS is not running) so
 * the caller stops ringing immediately.
 */
class IncomingCallDeclineReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val action = intent?.action ?: return
    IncomingCallRingtonePlayer.stop(context)
    if (action != ACTION_DECLINE) return
    val callId = intent.getStringExtra("callId")?.trim().orEmpty()
    if (callId.isNotEmpty()) {
      // Before anything else: the Go Online poll / a late FCM must not re-ring this call.
      DeclinedCallRegistry.markDeclined(context, callId)
      SelectoTelecom.endCall(callId, DisconnectCause.REJECTED)
    }
    val tag = intent.getStringExtra(EXTRA_TAG)?.trim().orEmpty()
    val id = intent.getIntExtra(EXTRA_ID, -1)
    if (tag.isNotEmpty() && id >= 0) {
      try {
        NotificationManagerCompat.from(context.applicationContext).cancel(tag, id)
      } catch (_: Exception) {
        // ignore
      }
    }
    if (callId.isEmpty()) return
    // Keep the receiver alive until the reject request finishes (bounded by its 8s timeouts).
    val pending = goAsync()
    NativeCallApi.declineIncomingCall(context, callId) { pending.finish() }
  }

  companion object {
    const val ACTION_DECLINE = "com.selecto.app.fcm.ACTION_DECLINE_INCOMING_CALL"
    const val ACTION_STOP_RING = "com.selecto.app.fcm.ACTION_STOP_INCOMING_RING"
    const val EXTRA_TAG = "notificationTag"
    const val EXTRA_ID = "notificationId"
  }
}
