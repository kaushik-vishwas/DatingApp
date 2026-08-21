package expo.modules.incomingcallandroid

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/**
 * Full-screen incoming-call tray posted from the Go Online keep-alive service
 * when JS/FCM cannot wake the receiver.
 */
object IncomingCallKeepAlivePresenter {
  private const val TYPE_INCOMING = "call_incoming"
  private const val ID_PREFIX = "incoming-"
  private const val DEEP_LINK_PREFIX = "nestham://incoming-call/"
  private const val WAKE_MS = 15_000L

  fun present(
    context: Context,
    callId: String,
    fromId: String,
    fromType: String,
    peerName: String,
    peerImage: String
  ): Boolean {
    val id = callId.trim()
    if (id.isEmpty()) return false
    val appContext = context.applicationContext
    IncomingCallNotificationChannels.ensureIncomingCallChannel(appContext)
    acquireBriefWakeLock(appContext)

    val name = peerName.trim().ifEmpty { "Caller" }
    val type = fromType.trim().ifEmpty { "u" }
    val url = buildDeepLink(id, fromId, type, name, peerImage)
    val nm = appContext.getSystemService(NotificationManager::class.java)
    val identifier = ID_PREFIX + id
    val notificationId = identifier.hashCode() and 0x7fffffff
    if (Build.VERSION.SDK_INT >= 23) {
      val already =
        nm?.activeNotifications?.any { n -> n.tag == identifier || n.id == notificationId } == true
      if (already) return true
    }
    val canFullScreen =
      if (Build.VERSION.SDK_INT >= 34) nm?.canUseFullScreenIntent() == true else true

    val openIntent =
      Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
        setPackage(appContext.packageName)
        flags =
          Intent.FLAG_ACTIVITY_NEW_TASK or
            Intent.FLAG_ACTIVITY_CLEAR_TOP or
            Intent.FLAG_ACTIVITY_SINGLE_TOP or
            Intent.FLAG_INCLUDE_STOPPED_PACKAGES
        putExtra("type", TYPE_INCOMING)
        putExtra("callId", id)
        putExtra("fromId", fromId)
        putExtra("fromType", type)
        putExtra("peerName", name)
        putExtra("peerImage", peerImage)
        putExtra("url", url)
      }
    val piFlags =
      PendingIntent.FLAG_UPDATE_CURRENT or
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
    val contentPending =
      PendingIntent.getActivity(appContext, notificationId, openIntent, piFlags)
    val fullScreenPending =
      PendingIntent.getActivity(appContext, notificationId + 17, openIntent, piFlags)

    val body = "$name is calling you"
    val nativeRingOk = IncomingCallRingtonePlayer.start(appContext)
    val channelId = IncomingCallNotificationChannels.presentChannelId(nativeRingOk)
    val builder =
      NotificationCompat.Builder(appContext, channelId)
        .setSmallIcon(android.R.drawable.sym_call_incoming)
        .setContentTitle("Incoming call")
        .setContentText(body)
        .setStyle(NotificationCompat.BigTextStyle().bigText(body))
        .setContentIntent(contentPending)
        .setCategory(NotificationCompat.CATEGORY_CALL)
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setAutoCancel(true)
        .setOngoing(true)
        .setOnlyAlertOnce(false)
        .setColor(Color.parseColor("#7c3aed"))
        .setDefaults(NotificationCompat.DEFAULT_LIGHTS or NotificationCompat.DEFAULT_VIBRATE)
        .setVibrate(longArrayOf(0, 280, 200, 280, 200, 280))
        .setTimeoutAfter(55_000L)

    if (canFullScreen) {
      builder.setFullScreenIntent(fullScreenPending, true)
    }
    if (!nativeRingOk) {
      IncomingCallNotificationChannels.resolveRingtoneUri(appContext)?.let { builder.setSound(it) }
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      try {
        val caller = Person.Builder().setName(name).setImportant(true).build()
        builder.setStyle(
          NotificationCompat.CallStyle.forIncomingCall(caller, contentPending, contentPending)
        )
      } catch (_: Exception) {
        // CATEGORY_CALL is enough.
      }
    }

    return try {
      NotificationManagerCompat.from(appContext).notify(identifier, notificationId, builder.build())
      PresenceNativeWakeLog.append(
        appContext,
        "native_keepalive_incoming",
        mapOf("callId" to id, "canFullScreen" to canFullScreen, "nativeRing" to nativeRingOk)
      )
      true
    } catch (e: Exception) {
      PresenceNativeWakeLog.append(
        appContext,
        "native_keepalive_incoming_failed",
        mapOf("callId" to id, "error" to (e.message ?: "present_failed"))
      )
      false
    }
  }

  private fun acquireBriefWakeLock(context: Context) {
    try {
      val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      val wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "selecto:incoming_call_keepalive")
      wakeLock.setReferenceCounted(false)
      wakeLock.acquire(WAKE_MS)
    } catch (_: Exception) {
      // ignore
    }
  }

  private fun buildDeepLink(
    callId: String,
    fromId: String,
    fromType: String,
    peerName: String,
    peerImage: String
  ): String {
    val enc = StandardCharsets.UTF_8.name()
    val base =
      DEEP_LINK_PREFIX +
        URLEncoder.encode(callId, enc) +
        "?fromId=" +
        URLEncoder.encode(fromId, enc) +
        "&fromType=" +
        URLEncoder.encode(fromType, enc) +
        "&peerName=" +
        URLEncoder.encode(peerName, enc)
    return if (peerImage.isEmpty()) base
    else base + "&peerImage=" + URLEncoder.encode(peerImage, enc)
  }
}
