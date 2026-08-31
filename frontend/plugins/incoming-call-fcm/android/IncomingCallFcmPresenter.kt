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

    val appContext = context.applicationContext
    if (!IncomingCallUiGate.isReceiverUiEnabled(appContext)) {
      IncomingCallRingtonePlayer.stop(appContext)
      Log.i(TAG, "Suppressed incoming call notification (receiver UI disabled)")
      return true
    }

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

    IncomingCallNotificationChannels.ensureIncomingCallChannel(appContext)
    acquireBriefWakeLock(appContext)

    val identifier = ID_PREFIX + callId
    val notificationId = (identifier.hashCode() and 0x7fffffff)

    val nm = appContext.getSystemService(NotificationManager::class.java)
    val canFullScreen =
      if (Build.VERSION.SDK_INT >= 34) {
        nm?.canUseFullScreenIntent() == true
      } else {
        true
      }

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
    val stopRingIntent =
      Intent(appContext, IncomingCallDeclineReceiver::class.java).apply {
        action = IncomingCallDeclineReceiver.ACTION_STOP_RING
      }
    val deletePending =
      PendingIntent.getBroadcast(appContext, notificationId + 23, stopRingIntent, piFlags)

    val title = "Incoming call"
    val body = "$peerName is calling you"
    val ringUri = IncomingCallNotificationChannels.resolveRingtoneUri(appContext)
    val nativeRingOk = IncomingCallRingtonePlayer.start(appContext)
    val channelId = IncomingCallNotificationChannels.presentChannelId(nativeRingOk)

    val builder =
      NotificationCompat.Builder(appContext, channelId)
        .setSmallIcon(resolveSmallIcon(appContext))
        .setContentTitle(title)
        .setContentText(body)
        .setStyle(NotificationCompat.BigTextStyle().bigText(body))
        .setContentIntent(contentPending)
        .setDeleteIntent(deletePending)
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
    } else {
      Log.w(TAG, "Full-screen intent not granted; posting MAX heads-up only")
    }

    // Full Selecto ringtone is MediaPlayer. Only attach channel sound as fallback.
    if (!nativeRingOk) {
      if (ringUri != null) {
        builder.setSound(ringUri)
      } else {
        builder.setDefaults(
          NotificationCompat.DEFAULT_SOUND or
            NotificationCompat.DEFAULT_LIGHTS or
            NotificationCompat.DEFAULT_VIBRATE
        )
      }
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

    val notificationsEnabled = nm?.areNotificationsEnabled() != false

    try {
      if (!notificationsEnabled) {
        Log.w(TAG, "Notifications disabled — cannot present incoming call")
      }
      NotificationManagerCompat.from(appContext).notify(identifier, notificationId, builder.build())
      Log.i(TAG, "Presented incoming call notification tag=$identifier nativeRing=$nativeRingOk")
      PresenceNativeWakeLog.append(
        appContext,
        "native_fcm_incoming",
        mapOf(
          "callId" to callId,
          "presented" to true,
          "canFullScreen" to canFullScreen,
          "notificationsEnabled" to notificationsEnabled,
          "nativeRing" to nativeRingOk,
          "sdkInt" to Build.VERSION.SDK_INT
        )
      )
      return true
    } catch (e: SecurityException) {
      Log.e(TAG, "Failed to present incoming call notification", e)
      PresenceNativeWakeLog.append(
        appContext,
        "native_fcm_present_failed",
        mapOf(
          "callId" to callId,
          "presented" to false,
          "canFullScreen" to canFullScreen,
          "notificationsEnabled" to notificationsEnabled,
          "error" to (e.message ?: "SecurityException")
        )
      )
      return false
    } catch (e: Exception) {
      Log.e(TAG, "Unexpected present failure", e)
      PresenceNativeWakeLog.append(
        appContext,
        "native_fcm_present_failed",
        mapOf(
          "callId" to callId,
          "presented" to false,
          "error" to (e.message ?: "present_failed")
        )
      )
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
