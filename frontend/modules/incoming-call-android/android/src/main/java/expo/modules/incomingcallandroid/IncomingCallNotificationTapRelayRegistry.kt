package expo.modules.incomingcallandroid

import android.app.PendingIntent
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/** Short-lived store so relay [BroadcastReceiver] can forward the original [PendingIntent]. */
object IncomingCallNotificationTapRelayRegistry {
  private const val MAX_ENTRIES = 64
  private val relays = ConcurrentHashMap<String, PendingIntent>()

  fun store(pendingIntent: PendingIntent): String {
    if (relays.size >= MAX_ENTRIES) {
      relays.keys.take(16).forEach { relays.remove(it) }
    }
    val token = UUID.randomUUID().toString()
    relays[token] = pendingIntent
    return token
  }

  fun take(token: String): PendingIntent? = relays.remove(token)
}
