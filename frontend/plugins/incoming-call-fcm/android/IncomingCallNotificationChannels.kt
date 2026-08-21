package com.selecto.app.fcm

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.ContentResolver
import android.content.Context
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build

/**
 * Incoming-call channels:
 * - [CHANNEL_ID]: fallback with bundled Selecto ringtone (when MediaPlayer cannot start)
 * - [VISUAL_CHANNEL_ID]: heads-up / full-screen tray with NO sound — full ring is MediaPlayer
 */
object IncomingCallNotificationChannels {
  const val CHANNEL_ID = "incoming_calls_ring_v2"
  /** Silent MAX channel so tray does not play a short system notification ding. */
  const val VISUAL_CHANNEL_ID = "incoming_calls_heads_up_v1"
  private const val SOUND_RAW_BASENAME = "receiver_ringtone"

  fun ensureIncomingCallChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

    val appContext = context.applicationContext
    val nm = appContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val soundUri = resolveRingtoneUri(appContext)

    for (legacyId in listOf("incoming_calls", "incoming_calls_visual")) {
      try {
        nm.deleteNotificationChannel(legacyId)
      } catch (_: Exception) {
        // ignore
      }
    }

    ensureRingingChannel(nm, soundUri)
    ensureVisualChannel(nm)
  }

  fun presentChannelId(nativeRingPlaying: Boolean): String {
    return if (nativeRingPlaying) VISUAL_CHANNEL_ID else CHANNEL_ID
  }

  private fun ensureRingingChannel(nm: NotificationManager, soundUri: Uri?) {
    val existing = nm.getNotificationChannel(CHANNEL_ID)
    if (
      existing != null &&
        existing.importance >= NotificationManager.IMPORTANCE_HIGH &&
        (soundUri == null || existing.sound == soundUri)
    ) {
      return
    }
    if (existing != null) {
      nm.deleteNotificationChannel(CHANNEL_ID)
    }
    val channel =
      NotificationChannel(CHANNEL_ID, "Incoming calls", NotificationManager.IMPORTANCE_MAX).apply {
        description = "Incoming voice call alerts (fallback ringtone)"
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 280, 200, 280, 200, 280)
        enableLights(true)
        lightColor = android.graphics.Color.parseColor("#7c3aed")
        setBypassDnd(true)
        lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        setShowBadge(true)
        if (soundUri != null) {
          val attrs =
            AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
              .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
              .setFlags(AudioAttributes.FLAG_AUDIBILITY_ENFORCED)
              .build()
          setSound(soundUri, attrs)
        }
      }
    nm.createNotificationChannel(channel)
  }

  private fun ensureVisualChannel(nm: NotificationManager) {
    val existing = nm.getNotificationChannel(VISUAL_CHANNEL_ID)
    if (existing != null && existing.importance >= NotificationManager.IMPORTANCE_HIGH && existing.sound == null) {
      return
    }
    if (existing != null) {
      nm.deleteNotificationChannel(VISUAL_CHANNEL_ID)
    }
    val channel =
      NotificationChannel(
          VISUAL_CHANNEL_ID,
          "Incoming call screen",
          NotificationManager.IMPORTANCE_MAX
        )
        .apply {
          description = "Incoming call heads-up (ringtone plays separately)"
          enableVibration(true)
          vibrationPattern = longArrayOf(0, 280, 200, 280, 200, 280)
          enableLights(true)
          lightColor = android.graphics.Color.parseColor("#7c3aed")
          setBypassDnd(true)
          lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
          setShowBadge(true)
          setSound(null, null)
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
        "assets_sounds_receiver_ringtone",
        "assets_sounds_receiver_ringtone_mp3",
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
