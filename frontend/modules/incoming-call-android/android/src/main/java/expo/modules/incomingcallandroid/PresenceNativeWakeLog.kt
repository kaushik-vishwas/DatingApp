package expo.modules.incomingcallandroid

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * JSONL breadcrumbs written from native (FCM present / keep-alive) so a killed JS
 * runtime still leaves evidence for the Home presence-log export.
 */
object PresenceNativeWakeLog {
  const val FILE_NAME = "presence_native_wake.jsonl"
  private const val MAX_LINES = 80

  fun file(context: Context): File =
    File(context.applicationContext.filesDir, FILE_NAME)

  @Synchronized
  fun append(context: Context, event: String, extras: Map<String, Any?> = emptyMap()) {
    try {
      val obj = JSONObject()
      val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
      sdf.timeZone = TimeZone.getTimeZone("UTC")
      obj.put("at", sdf.format(Date()))
      obj.put("atMs", System.currentTimeMillis())
      obj.put("event", event)
      obj.put("source", "native")
      for ((key, value) in extras) {
        when (value) {
          null -> obj.put(key, JSONObject.NULL)
          is Boolean, is Number, is String -> obj.put(key, value)
          else -> obj.put(key, value.toString())
        }
      }
      val f = file(context)
      f.appendText(obj.toString() + "\n")
      trimIfNeeded(f)
    } catch (_: Exception) {
      // best-effort
    }
  }

  @Synchronized
  fun readAll(context: Context): String {
    return try {
      val f = file(context)
      if (!f.exists()) "" else f.readText()
    } catch (_: Exception) {
      ""
    }
  }

  @Synchronized
  fun clear(context: Context) {
    try {
      val f = file(context)
      if (f.exists()) f.delete()
    } catch (_: Exception) {
      // ignore
    }
  }

  private fun trimIfNeeded(file: File) {
    val lines = file.readLines()
    if (lines.size <= MAX_LINES) return
    file.writeText(lines.takeLast(MAX_LINES).joinToString("\n", postfix = "\n"))
  }
}
