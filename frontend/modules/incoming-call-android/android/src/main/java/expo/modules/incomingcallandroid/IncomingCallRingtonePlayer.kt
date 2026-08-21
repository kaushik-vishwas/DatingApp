package expo.modules.incomingcallandroid

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.util.Log

/**
 * Loops the bundled Selecto receiver ringtone via [MediaPlayer].
 * Prefers the app FCM package singleton when present so killed-app FCM rings and
 * JS start/stop share one player instance.
 */
object IncomingCallRingtonePlayer {
  private const val TAG = "IncomingCallRingtone"
  private const val MAX_RING_MS = 55_000L
  private const val FCM_PLAYER = "com.selecto.app.fcm.IncomingCallRingtonePlayer"

  private var player: MediaPlayer? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private val mainHandler = Handler(Looper.getMainLooper())
  private val stopRunnable = Runnable { stopLocal() }

  @JvmStatic
  @Synchronized
  fun start(context: Context): Boolean {
    val delegated = invokeFcm("start", context)
    if (delegated is Boolean) return delegated

    val appContext = context.applicationContext
    stopLocal()

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
      Log.i(TAG, "Native incoming ringtone started (module)")
      true
    } catch (e: Exception) {
      Log.e(TAG, "Failed to start native incoming ringtone", e)
      stopLocal()
      false
    }
  }

  @JvmStatic
  @Synchronized
  fun stop(context: Context?) {
    invokeFcm("stop", context)
    stopLocal()
  }

  @JvmStatic
  @Synchronized
  fun isPlaying(): Boolean {
    val delegated = invokeFcm("isPlaying", null)
    if (delegated is Boolean) return delegated
    return try {
      player?.isPlaying == true
    } catch (_: Exception) {
      false
    }
  }

  private fun invokeFcm(method: String, context: Context?): Any? {
    return try {
      val clazz = Class.forName(FCM_PLAYER)
      when (method) {
        "start" -> {
          if (context == null) return null
          clazz.getMethod("start", Context::class.java).invoke(null, context)
        }
        "stop" -> {
          clazz.getMethod("stop", Context::class.java).invoke(null, context)
          true
        }
        "isPlaying" -> clazz.getMethod("isPlaying").invoke(null)
        else -> null
      }
    } catch (_: Exception) {
      null
    }
  }

  private fun stopLocal() {
    mainHandler.removeCallbacks(stopRunnable)
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
    releaseWakeLock()
  }

  private fun acquireWakeLock(context: Context) {
    releaseWakeLock()
    try {
      val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      val lock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "selecto:incoming_ringtone")
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
