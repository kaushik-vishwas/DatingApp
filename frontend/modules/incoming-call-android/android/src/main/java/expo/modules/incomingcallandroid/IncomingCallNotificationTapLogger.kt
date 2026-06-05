package expo.modules.incomingcallandroid

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Appends JSON lines to the same file used by JS debug builds
 * ([FileSystem.documentDirectory]/incoming-call-notification-debug.log).
 */
object IncomingCallNotificationTapLogger {
  const val LOG_FILE_NAME = "incoming-call-notification-debug.log"

  private val lock = Any()

  fun log(
    context: Context,
    step: String,
    detail: Map<String, Any?>,
    debugEnabled: Boolean
  ) {
    if (!debugEnabled) return
    val payload =
      JSONObject().apply {
        put("ts", isoTimestamp())
        put("step", step)
        put("source", "native")
        for ((key, value) in detail) {
          when (value) {
            null -> put(key, JSONObject.NULL)
            is Boolean, is Int, is Long, is Double -> put(key, value)
            is String -> put(key, value)
            else -> put(key, value.toString())
          }
        }
      }
    synchronized(lock) {
      try {
        File(context.filesDir, LOG_FILE_NAME).appendText(payload.toString() + "\n")
      } catch (_: Exception) {
        // best-effort
      }
    }
  }

  private fun isoTimestamp(): String {
    val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
    fmt.timeZone = TimeZone.getTimeZone("UTC")
    return fmt.format(Date())
  }
}
