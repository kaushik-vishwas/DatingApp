package expo.modules.incomingcallandroid

import android.app.NotificationManager
import android.content.Context
import androidx.core.app.NotificationManagerCompat

/** Clears native + Expo incoming-call tray rows for one invite (`incoming-{callId}` tag). */
object IncomingCallTrayDismiss {
  private const val TAG_PREFIX = "incoming-"

  fun dismissByCallId(context: Context, callId: String): Boolean {
    val trimmed = callId.trim()
    if (trimmed.isEmpty()) return false
    val tag = TAG_PREFIX + trimmed
    val appContext = context.applicationContext
    val nm = appContext.getSystemService(NotificationManager::class.java)
    var cancelled = false
    nm?.activeNotifications?.forEach { status ->
      if (status.tag == tag) {
        NotificationManagerCompat.from(appContext).cancel(tag, status.id)
        cancelled = true
      }
    }
    if (!cancelled) {
      val fallbackId = tag.hashCode() and 0x7fffffff
      NotificationManagerCompat.from(appContext).cancel(tag, fallbackId)
    }
    return true
  }

  /**
   * True when the native FCM / keep-alive call notification is posted for this invite.
   * Native rows use id = hash(tag); Expo local rows share the tag but use a different id.
   */
  fun isNativeShowing(context: Context, callId: String): Boolean {
    val trimmed = callId.trim()
    if (trimmed.isEmpty()) return false
    val tag = TAG_PREFIX + trimmed
    val nativeId = tag.hashCode() and 0x7fffffff
    val nm = context.applicationContext.getSystemService(NotificationManager::class.java)
    return try {
      nm?.activeNotifications?.any { it.tag == tag && it.id == nativeId } == true
    } catch (_: Exception) {
      false
    }
  }
}
