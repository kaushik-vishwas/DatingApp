package expo.modules.incomingcallandroid

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.Person

/**
 * Decline / Answer on the native incoming-call notification (FCM presenter + Go Online poll).
 *
 * CallStyle is used only where Android accepts it (12+ with a full-screen intent) — a CallStyle
 * without one is rejected at notify() on Android 14+ when full-screen permission is off. Everywhere
 * else the same two buttons are added as plain actions. Answer opens the in-app accept screen,
 * exactly like tapping the notification.
 */
object IncomingCallNotificationActions {
  private const val TAG = "IncomingCallActions"
  /** Lives in the app (plugins/incoming-call-fcm); addressed by name from this module. */
  private const val DECLINE_RECEIVER_CLASS = "com.selecto.app.fcm.IncomingCallDeclineReceiver"
  private const val ACTION_DECLINE = "com.selecto.app.fcm.ACTION_DECLINE_INCOMING_CALL"
  private const val EXTRA_TAG = "notificationTag"
  private const val EXTRA_ID = "notificationId"

  /** Returns true when CallStyle was applied (caller may fall back via [applyPlainActions]). */
  fun apply(
    builder: NotificationCompat.Builder,
    context: Context,
    callId: String,
    notificationTag: String,
    notificationId: Int,
    peerName: String,
    answerPending: PendingIntent,
    canFullScreen: Boolean
  ): Boolean {
    val declinePending = declinePendingIntent(context, callId, notificationTag, notificationId)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && canFullScreen) {
      try {
        val caller = Person.Builder().setName(peerName).setImportant(true).build()
        builder.setStyle(
          NotificationCompat.CallStyle.forIncomingCall(caller, declinePending, answerPending)
        )
        return true
      } catch (e: Exception) {
        Log.w(TAG, "CallStyle unavailable, using plain actions", e)
      }
    }
    addPlainActions(builder, declinePending, answerPending)
    return false
  }

  /** Fallback after a CallStyle notify() was rejected: plain Decline / Answer buttons. */
  fun applyPlainActions(
    builder: NotificationCompat.Builder,
    context: Context,
    callId: String,
    notificationTag: String,
    notificationId: Int,
    body: String,
    answerPending: PendingIntent
  ) {
    builder.setStyle(NotificationCompat.BigTextStyle().bigText(body))
    addPlainActions(
      builder,
      declinePendingIntent(context, callId, notificationTag, notificationId),
      answerPending
    )
  }

  private fun addPlainActions(
    builder: NotificationCompat.Builder,
    declinePending: PendingIntent,
    answerPending: PendingIntent
  ) {
    builder.addAction(
      NotificationCompat.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, "Decline", declinePending).build()
    )
    builder.addAction(
      NotificationCompat.Action.Builder(android.R.drawable.sym_action_call, "Answer", answerPending).build()
    )
  }

  private fun declinePendingIntent(
    context: Context,
    callId: String,
    notificationTag: String,
    notificationId: Int
  ): PendingIntent {
    val appContext = context.applicationContext
    val intent =
      Intent(ACTION_DECLINE).apply {
        setClassName(appContext.packageName, DECLINE_RECEIVER_CLASS)
        putExtra(EXTRA_TAG, notificationTag)
        putExtra(EXTRA_ID, notificationId)
        putExtra("callId", callId)
      }
    val flags =
      PendingIntent.FLAG_UPDATE_CURRENT or
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
    // Same request code the FCM presenter always used for Decline.
    return PendingIntent.getBroadcast(appContext, notificationId + 31, intent, flags)
  }
}
