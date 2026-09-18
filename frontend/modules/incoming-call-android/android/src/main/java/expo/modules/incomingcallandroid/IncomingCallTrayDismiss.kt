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
}
