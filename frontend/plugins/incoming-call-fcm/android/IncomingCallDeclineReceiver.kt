package com.selecto.app.fcm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationManagerCompat

/**
 * Dismisses the incoming-call tray when the user taps Decline on CallStyle UI.
 * Does not reject the call server-side by itself (app may still be killed).
 */
class IncomingCallDeclineReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val action = intent?.action ?: return
    IncomingCallRingtonePlayer.stop(context)
    if (action != ACTION_DECLINE) return
    val tag = intent.getStringExtra(EXTRA_TAG)?.trim().orEmpty()
    val id = intent.getIntExtra(EXTRA_ID, -1)
    if (tag.isEmpty() || id < 0) return
    try {
      NotificationManagerCompat.from(context.applicationContext).cancel(tag, id)
    } catch (_: Exception) {
      // ignore
    }
  }

  companion object {
    const val ACTION_DECLINE = "com.selecto.app.fcm.ACTION_DECLINE_INCOMING_CALL"
    const val ACTION_STOP_RING = "com.selecto.app.fcm.ACTION_STOP_INCOMING_RING"
    const val EXTRA_TAG = "notificationTag"
    const val EXTRA_ID = "notificationId"
  }
}
