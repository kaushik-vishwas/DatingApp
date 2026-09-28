package expo.modules.incomingcallandroid

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * After reboot or an app update the Go Online keep-alive is dead. If the receiver had Go Online
 * on (credentials still saved — they are cleared when Go Online is turned off / sign-out), restart
 * it so presence heartbeats and the pending-call fallback resume without opening the app.
 * Otherwise do nothing: the server's short presence lease expires and she shows offline.
 */
class OnlinePresenceBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val action = intent?.action ?: return
    if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) return
    val app = context.applicationContext
    val receiverUiEnabled =
      app.getSharedPreferences("selecto_app_prefs", Context.MODE_PRIVATE)
        .getBoolean("receiver_incoming_call_ui_enabled", false)
    val resume = receiverUiEnabled && OnlinePresenceForegroundService.hasSavedCreds(app)
    PresenceNativeWakeLog.append(app, "native_boot_resume", mapOf("action" to action, "resume" to resume))
    if (!resume) return
    try {
      OnlinePresenceForegroundService.start(app)
    } catch (e: Exception) {
      PresenceNativeWakeLog.append(
        app,
        "native_boot_resume_failed",
        mapOf("action" to action, "error" to (e.message ?: e.javaClass.simpleName))
      )
    }
  }
}
