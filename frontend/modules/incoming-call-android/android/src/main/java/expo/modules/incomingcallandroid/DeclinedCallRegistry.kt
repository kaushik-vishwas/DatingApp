package expo.modules.incomingcallandroid

import android.content.Context

/**
 * Calls the receiver declined from the notification / Telecom on this phone. The FCM presenter
 * and the Go Online pending-invite poll check it so a declined call never rings again (e.g. the
 * poll still sees the invite before the server processed the decline).
 */
object DeclinedCallRegistry {
  private const val PREFS = "selecto_declined_calls"
  /** Longer than any server ring window (45s native ring / 60s Telecom safety net). */
  private const val TTL_MS = 2 * 60_000L
  private const val MAX_ENTRIES = 20

  @Synchronized
  fun markDeclined(context: Context, callId: String) {
    val id = callId.trim()
    if (id.isEmpty()) return
    val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val now = System.currentTimeMillis()
    val editor = prefs.edit()
    val live =
      prefs.all.entries
        .mapNotNull { (k, v) -> (v as? Long)?.let { k to it } }
        .filter { (k, at) ->
          val keep = now - at < TTL_MS
          if (!keep) editor.remove(k)
          keep
        }
        .sortedBy { it.second }
    // Drop oldest so the store stays tiny.
    live.dropLast(MAX_ENTRIES - 1).forEach { (k, _) -> editor.remove(k) }
    editor.putLong(id, now).apply()
  }

  @Synchronized
  fun isDeclined(context: Context, callId: String): Boolean {
    val id = callId.trim()
    if (id.isEmpty()) return false
    val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val at = prefs.getLong(id, 0L)
    return at > 0L && System.currentTimeMillis() - at < TTL_MS
  }
}
