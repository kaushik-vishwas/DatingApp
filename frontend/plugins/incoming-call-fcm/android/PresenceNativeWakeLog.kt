package com.selecto.app.fcm

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** Same file as expo.modules.incomingcallandroid.PresenceNativeWakeLog. */
object PresenceNativeWakeLog {
  private const val FILE_NAME = "presence_native_wake.jsonl"
  private const val MAX_LINES = 80

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
      val f = File(context.applicationContext.filesDir, FILE_NAME)
      f.appendText(obj.toString() + "\n")
      val lines = f.readLines()
      if (lines.size > MAX_LINES) {
        f.writeText(lines.takeLast(MAX_LINES).joinToString("\n", postfix = "\n"))
      }
    } catch (_: Exception) {
      // best-effort
    }
  }
}
