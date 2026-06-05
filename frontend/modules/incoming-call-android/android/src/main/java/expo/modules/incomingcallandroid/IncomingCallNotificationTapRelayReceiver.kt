package expo.modules.incomingcallandroid

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Logs which notification region was tapped, then forwards the original Expo/Open intent.
 */
class IncomingCallNotificationTapRelayReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent == null) return
    if (intent.action != ACTION_RELAY) return

    val tapSource = intent.getStringExtra(EXTRA_TAP_SOURCE) ?: "unknown"
    val notificationTag = intent.getStringExtra(EXTRA_NOTIFICATION_TAG) ?: ""
    val debugEnabled = intent.getBooleanExtra(EXTRA_DEBUG_ENABLED, false)
    val relayToken = intent.getStringExtra(EXTRA_RELAY_TOKEN)

    var forwarded = false
    var forwardError: String? = null

    val relay = relayToken?.let { IncomingCallNotificationTapRelayRegistry.take(it) }
    if (relay != null) {
      try {
        relay.send(context, 0, null)
        forwarded = true
      } catch (e: Exception) {
        forwardError = e.message ?: e.javaClass.simpleName
        Log.w(TAG, "relay send failed: $forwardError")
      }
    } else {
      forwardError = "relay_token_missing_or_expired"
    }

    IncomingCallNotificationTapLogger.log(
      context.applicationContext,
      "native.tap_relayed",
      mapOf(
        "tapSource" to tapSource,
        "notificationTag" to notificationTag,
        "forwarded" to forwarded,
        "forwardError" to forwardError
      ),
      debugEnabled
    )

    IncomingCallNotificationTapEventSink.emit(
      mapOf(
        "tapSource" to tapSource,
        "notificationTag" to notificationTag,
        "forwarded" to forwarded,
        "forwardError" to forwardError
      )
    )
  }

  companion object {
    private const val TAG = "IncomingCallTapRelay"
    const val ACTION_RELAY = "expo.modules.incomingcallandroid.NOTIFICATION_TAP_RELAY"
    const val EXTRA_TAP_SOURCE = "tap_source"
    const val EXTRA_NOTIFICATION_TAG = "notification_tag"
    const val EXTRA_RELAY_TOKEN = "relay_token"
    const val EXTRA_DEBUG_ENABLED = "debug_enabled"
  }
}
