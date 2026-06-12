package com.kaushikvishwas.frontend.fcm

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.ContentResolver
import android.content.Context
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build

/**
 * High-priority incoming-call channel with bundled [receiver_ringtone] raw asset.
 */
object IncomingCallNotificationChannels {
  const val CHANNEL_ID = "incoming_calls"
  private const val SOUND_RAW_BASENAME = "receiver_ringtone"

  fun ensureIncomingCallChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

    val appContext = context.applicationContext
    val nm = appContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val soundUri = resolveRingtoneUri(appContext) ?: return

    val existing = nm.getNotificationChannel(CHANNEL_ID)
    if (existing != null && existing.sound == soundUri) return

    if (existing != null) {
      nm.deleteNotificationChannel(CHANNEL_ID)
    }

    val channel =
      NotificationChannel(CHANNEL_ID, "Incoming calls", NotificationManager.IMPORTANCE_MAX).apply {
        description = "Incoming voice call alerts"
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 280, 200, 280)
        enableLights(true)
        lightColor = android.graphics.Color.parseColor("#7c3aed")
        setBypassDnd(true)
        lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        val attrs =
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .setFlags(AudioAttributes.FLAG_AUDIBILITY_ENFORCED)
            .build()
        setSound(soundUri, attrs)
      }
    nm.createNotificationChannel(channel)
  }

  fun resolveRingtoneUri(context: Context): Uri? {
    val pkg = context.packageName
    val res = context.resources
    val candidates =
      listOf(
        SOUND_RAW_BASENAME,
        "${SOUND_RAW_BASENAME}_mp3",
        "receiver_ringtone.mp3",
      )
    for (name in candidates) {
      val id = res.getIdentifier(name, "raw", pkg)
      if (id != 0) {
        return Uri.parse("${ContentResolver.SCHEME_ANDROID_RESOURCE}://$pkg/$id")
      }
    }
    return null
  }
}
