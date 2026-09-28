package expo.modules.incomingcallandroid

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.view.WindowManager
import java.lang.ref.WeakReference

/**
 * Shows the app over the keyguard (and turns the screen on) only while a receiver call is
 * ringing / live. Applied natively when an incoming-call intent opens the activity, so a locked
 * phone shows the call without unlocking first; JS clears it once no call screen is shown so
 * the rest of the app never stays reachable from the lock screen.
 */
object CallLockScreen {
  private const val INCOMING_CALL_URL_PREFIX = "nestham://incoming-call/"
  private var activityRef: WeakReference<Activity>? = null

  fun isIncomingCallIntent(intent: Intent?): Boolean {
    if (intent == null) return false
    if (intent.getStringExtra("type") == "call_incoming") return true
    return intent.dataString?.startsWith(INCOMING_CALL_URL_PREFIX) == true
  }

  /** Call id from an incoming-call intent (native extras first, then the deep link path). */
  fun incomingCallId(intent: Intent?): String {
    if (intent == null) return ""
    intent.getStringExtra("callId")?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }
    val data = intent.dataString ?: return ""
    if (!data.startsWith(INCOMING_CALL_URL_PREFIX)) return ""
    val raw = data.removePrefix(INCOMING_CALL_URL_PREFIX).substringBefore('?').substringBefore('/')
    return try {
      Uri.decode(raw).trim()
    } catch (_: Exception) {
      ""
    }
  }

  fun bind(activity: Activity) {
    activityRef = WeakReference(activity)
  }

  fun currentActivity(): Activity? = activityRef?.get()

  fun setEnabled(activity: Activity?, enabled: Boolean) {
    val target = activity ?: activityRef?.get() ?: return
    target.runOnUiThread {
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
          target.setShowWhenLocked(enabled)
          target.setTurnScreenOn(enabled)
        } else {
          @Suppress("DEPRECATION")
          val flags =
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
              WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
          if (enabled) target.window.addFlags(flags) else target.window.clearFlags(flags)
        }
      } catch (_: Exception) {
        // Activity finishing — nothing to do.
      }
    }
  }
}
