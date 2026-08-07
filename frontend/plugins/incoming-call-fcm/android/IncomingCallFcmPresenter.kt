package com.selecto.app.fcm

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import com.google.firebase.messaging.RemoteMessage
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/**
 * Presents an incoming-call notification immediately from FCM (app killed / OEM-frozen JS).
 *
 * Unlike Expo's NotificationsService.present, this posts a real CALL-category notification with
 * full-screen intent on the first present — required for reliable wake on aggressive OEMs.
 */
object IncomingCallFcmPresenter {
  private const val TAG = "IncomingCallFcm"
  private const val TYPE_INCOMING = "call_incoming"
  private const val ID_PREFIX = "incoming-"
  private const val DEEP_LINK_PREFIX = "nestham://incoming-call/"
  private const val WAKE_MS = 15_000L

  fun presentIfIncomingCall(context: Context, remoteMessage: RemoteMessage): Boolean {
    val data = remoteMessage.data
    if (data.isNullOrEmpty()) return false

    val type = data["type"]?.trim().orEmpty()
    if (type != TYPE_INCOMING) return false

    val callId = data["callId"]?.trim().orEmpty()
    if (callId.isEmpty()) return false

    val fromId = data["fromId"]?.trim().orEmpty()
    val fromType = data["fromType"]?.trim()?.ifEmpty { "u" } ?: "u"
    val peerName =
      data["peerName"]?.trim()?.takeIf { it.isNotEmpty() }
        ?: data["fromName"]?.trim()?.takeIf { it.isNotEmpty() }
        ?: "Caller"
    val peerImage = data["peerImage"]?.trim() ?: data["fromImage"]?.trim() ?: ""
    val url =
      data["url"]?.trim()?.takeIf { it.isNotEmpty() }
        ?: buildDeepLink(callId, fromId, fromType, peerName, peerImage)

    val appContext = context.applicationContext
    IncomingCallNotificationChannels.ensureIncomingCallChannel(appContext)
    acquireBriefWakeLock(appContext)

    val identifier = ID_PREFIX + callId
    val notificationId = (identifier.hashCode() and 0x7fffffff)

    val openIntent =
      Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
        setPackage(appContext.packageName)
        flags =
          Intent.FLAG_ACTIVITY_NEW_TASK or
            Intent.FLAG_ACTIVITY_CLEAR_TOP or
            Intent.FLAG_ACTIVITY_SINGLE_TOP or
            Intent.FLAG_INCLUDE_STOPPED_PACKAGES
        putExtra("type", TYPE_INCOMING)
        putExtra("callId", callId)
        putExtra("fromId", fromId)
        putExtra("fromType", fromType)
        putExtra("peerName", peerName)
        putExtra("peerImage", peerImage)
        putExtra("url", url)
      }

    val piFlags =
      PendingIntent.FLAG_UPDATE_CURRENT or
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0

    val contentPending =
      PendingIntent.getActivity(
        appContext,
        notificationId,
        openIntent,
        piFlags
      )

    val fullScreenPending =
      PendingIntent.getActivity(
        appContext,
        notificationId + 17,
        openIntent,
        piFlags
      )

    val title = "Incoming call"
    val body = "$peerName is calling you"
    val ringUri = IncomingCallNotificationChannels.resolveRingtoneUri(appContext)

    val builder =
      NotificationCompat.Builder(appContext, IncomingCallNotificationChannels.CHANNEL_ID)
        .setSmallIcon(resolveSmallIcon(appContext))
        .setContentTitle(title)
        .setContentText(body)
        .setStyle(NotificationCompat.BigTextStyle().bigText(body))
        .setContentIntent(contentPending)
        .setFullScreenIntent(fullScreenPending, true)
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

    if (ringUri != null) {
      builder.setSound(ringUri)
    } else {
      builder.setDefaults(
        NotificationCompat.DEFAULT_SOUND or
          NotificationCompat.DEFAULT_LIGHTS or
          NotificationCompat.DEFAULT_VIBRATE
      )
    }

    // Android 12+ CallStyle improves heads-up / OEM call treatment when permitted.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      try {
        val caller = Person.Builder().setName(peerName).setImportant(true).build()
        val declineIntent =
          Intent(appContext, IncomingCallDeclineReceiver::class.java).apply {
            action = IncomingCallDeclineReceiver.ACTION_DECLINE
            putExtra(IncomingCallDeclineReceiver.EXTRA_TAG, identifier)
            putExtra(IncomingCallDeclineReceiver.EXTRA_ID, notificationId)
            putExtra("callId", callId)
          }
        val declinePending =
          PendingIntent.getBroadcast(
            appContext,
            notificationId + 31,
            declineIntent,
            piFlags
          )
        builder.setStyle(
          NotificationCompat.CallStyle.forIncomingCall(caller, declinePending, contentPending)
        )
      } catch (e: Exception) {
        Log.w(TAG, "CallStyle unavailable, using CATEGORY_CALL only", e)
      }
    }

    // Extras help JS / deep-link parsers if the activity inspects the Intent.
    builder.extras.putString("type", TYPE_INCOMING)
    builder.extras.putString("callId", callId)
    builder.extras.putString("fromId", fromId)
    builder.extras.putString("fromType", fromType)
    builder.extras.putString("peerName", peerName)
    builder.extras.putString("peerImage", peerImage)
    builder.extras.putString("url", url)

    try {
      if (Build.VERSION.SDK_INT >= 33) {
        val nm = appContext.getSystemService(NotificationManager::class.java)
        // Still attempt present; POST_NOTIFICATIONS may already be granted from app use.
        if (nm != null && !nm.areNotificationsEnabled()) {
          Log.w(TAG, "Notifications disabled — cannot present incoming call")
        }
      }
      NotificationManagerCompat.from(appContext).notify(identifier, notificationId, builder.build())
      Log.i(TAG, "Presented incoming call notification tag=$identifier")
      return true
    } catch (e: SecurityException) {
      Log.e(TAG, "Failed to present incoming call notification", e)
      return false
    } catch (e: Exception) {
      Log.e(TAG, "Unexpected present failure", e)
      return false
    }
  }

  private fun acquireBriefWakeLock(context: Context) {
    try {
      val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      val wakeLock =
        pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "selecto:incoming_call")
      wakeLock.setReferenceCounted(false)
      wakeLock.acquire(WAKE_MS)
    } catch (e: Exception) {
      Log.w(TAG, "WakeLock acquire failed", e)
    }
  }

  private fun resolveSmallIcon(context: Context): Int {
    val res = context.resources
    val pkg = context.packageName
    val candidates = listOf("notification_icon", "ic_notification", "ic_launcher")
    for (name in candidates) {
      val id = res.getIdentifier(name, "drawable", pkg)
      if (id != 0) return id
      val mip = res.getIdentifier(name, "mipmap", pkg)
      if (mip != 0) return mip
    }
    return android.R.drawable.sym_call_incoming
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
    return if (peerImage.isEmpty()) {
      base
    } else {
      base + "&peerImage=" + URLEncoder.encode(peerImage, enc)
    }
  }
}
