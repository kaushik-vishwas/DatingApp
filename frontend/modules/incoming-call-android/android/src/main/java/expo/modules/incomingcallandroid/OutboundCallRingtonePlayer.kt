package expo.modules.incomingcallandroid

import android.app.Activity
import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.util.Log

/** Loops caller outbound ringtone on STREAM_RING so hardware volume keys work. */
object OutboundCallRingtonePlayer {
  private const val TAG = "OutboundCallRingtone"

  private var player: MediaPlayer? = null

  @JvmStatic
  @Synchronized
  fun start(context: Context, activity: Activity?): Boolean {
    stop(context, activity)

    val appContext = context.applicationContext
    val uri = resolveCallerRingtoneUri(appContext)
    if (uri == null) {
      Log.w(TAG, "No caller_ringtone raw resource — cannot start native outbound ring")
      return false
    }

    return try {
      val mp =
        MediaPlayer().apply {
          setAudioAttributes(
            AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
              .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
              .build()
          )
          setDataSource(appContext, uri)
          isLooping = true
          setVolume(1f, 1f)
          prepare()
          start()
        }
      player = mp
      CallRingtoneVolumeControl.bind(CallRingtoneVolumeControl.OWNER_OUTBOUND, activity)
      Log.i(TAG, "Native outbound ringtone started")
      true
    } catch (e: Exception) {
      Log.e(TAG, "Failed to start native outbound ringtone", e)
      stop(context, activity)
      false
    }
  }

  @JvmStatic
  @Synchronized
  fun stop(context: Context?, activity: Activity?) {
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
    CallRingtoneVolumeControl.release(CallRingtoneVolumeControl.OWNER_OUTBOUND)
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

  private fun resolveCallerRingtoneUri(context: Context): android.net.Uri? {
    val pkg = context.packageName
    val res = context.resources
    val candidates =
      listOf(
        "caller_ringtone",
        "caller_ringtone_mp3",
        "assets_sounds_caller_ringtone",
        "assets_sounds_caller_ringtone_mp3",
      )
    for (name in candidates) {
      val id = res.getIdentifier(name, "raw", pkg)
      if (id != 0) {
        return android.net.Uri.parse("${android.content.ContentResolver.SCHEME_ANDROID_RESOURCE}://$pkg/$id")
      }
    }
    return null
  }
}
