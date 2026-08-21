package com.selecto.app.fcm

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.util.Log

/**
 * Loops the bundled Selecto receiver ringtone via [MediaPlayer] when FCM presents
 * an incoming call (app killed / OEM-frozen). Mirrors the expo-module player.
 */
object IncomingCallRingtonePlayer {
  private const val TAG = "IncomingCallRingtone"
  private const val MAX_RING_MS = 55_000L

  private var player: MediaPlayer? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private val mainHandler = Handler(Looper.getMainLooper())
  private val stopRunnable = Runnable { stop(null) }

  @JvmStatic
  @Synchronized
  fun start(context: Context): Boolean {
    val appContext = context.applicationContext
    stopInternal(releaseWake = false)

    val uri = IncomingCallNotificationChannels.resolveRingtoneUri(appContext)
    if (uri == null) {
      Log.w(TAG, "No receiver_ringtone raw resource — cannot start native ring")
      return false
    }

    return try {
      val mp =
        MediaPlayer().apply {
          setAudioAttributes(
            AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
              .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
              .setFlags(AudioAttributes.FLAG_AUDIBILITY_ENFORCED)
              .build()
          )
          setDataSource(appContext, uri)
          isLooping = true
          setVolume(1f, 1f)
          prepare()
          start()
        }
      player = mp
      acquireWakeLock(appContext)
      mainHandler.removeCallbacks(stopRunnable)
      mainHandler.postDelayed(stopRunnable, MAX_RING_MS)
      Log.i(TAG, "Native incoming ringtone started")
      true
    } catch (e: Exception) {
      Log.e(TAG, "Failed to start native incoming ringtone", e)
      stopInternal(releaseWake = true)
      false
    }
  }

  @JvmStatic
  @Synchronized
  fun stop(context: Context?) {
    mainHandler.removeCallbacks(stopRunnable)
    stopInternal(releaseWake = true)
  }

  @JvmStatic
  @Synchronized
  fun isPlaying(): Boolean {
    return try {
      player?.isPlaying == true
    } catch (_: Exception) {
      false
    }
  }

  private fun stopInternal(releaseWake: Boolean) {
    val mp = player
    player = null
    if (mp != null) {
      try {
        if (mp.isPlaying) mp.stop()
      } catch (_: Exception) {
        // ignore
      }
      try {
        mp.release()
      } catch (_: Exception) {
        // ignore
      }
    }
    if (releaseWake) {
      releaseWakeLock()
    }
  }

  private fun acquireWakeLock(context: Context) {
    releaseWakeLock()
    try {
      val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      val lock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "selecto:incoming_ringtone_fcm")
      lock.setReferenceCounted(false)
      lock.acquire(MAX_RING_MS + 2_000L)
      wakeLock = lock
    } catch (e: Exception) {
      Log.w(TAG, "WakeLock acquire failed", e)
    }
  }

  private fun releaseWakeLock() {
    val lock = wakeLock
    wakeLock = null
    if (lock != null) {
      try {
        if (lock.isHeld) lock.release()
      } catch (_: Exception) {
        // ignore
      }
    }
  }
}
