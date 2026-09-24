package expo.modules.incomingcallandroid

import android.app.Activity
import android.media.AudioManager
import android.util.Log

/**
 * Routes hardware volume keys to [AudioManager.STREAM_RING] while native in-app ringtones play.
 * Without this, Android often keeps [Activity.volumeControlStream] on media/voice and
 * ringtone playback (USAGE_NOTIFICATION_RINGTONE) ignores the buttons.
 *
 * Each player binds under its own owner key, so stopping one ringtone never releases another's
 * binding, and the original stream is restored exactly once when the last owner releases.
 */
object CallRingtoneVolumeControl {
  const val OWNER_INCOMING = "incoming"
  const val OWNER_OUTBOUND = "outbound"

  private const val TAG = "CallRingtoneVolume"
  private var boundActivity: Activity? = null
  private var savedVolumeControlStream: Int? = null
  private val owners = mutableSetOf<String>()

  @Synchronized
  fun bind(owner: String, activity: Activity?) {
    if (activity == null) return
    if (boundActivity != null && boundActivity !== activity) {
      restore()
      owners.clear()
    }
    if (boundActivity == null) {
      try {
        savedVolumeControlStream = activity.volumeControlStream
        activity.volumeControlStream = AudioManager.STREAM_RING
        boundActivity = activity
        Log.d(TAG, "Bound volume keys to STREAM_RING")
      } catch (e: Exception) {
        Log.w(TAG, "Failed to bind volume keys", e)
        return
      }
    }
    owners.add(owner)
  }

  @Synchronized
  fun release(owner: String) {
    if (!owners.remove(owner)) return
    if (owners.isNotEmpty()) return
    restore()
  }

  private fun restore() {
    val activity = boundActivity
    val saved = savedVolumeControlStream
    boundActivity = null
    savedVolumeControlStream = null
    if (activity != null && saved != null) {
      try {
        activity.volumeControlStream = saved
        Log.d(TAG, "Restored volume control stream")
      } catch (e: Exception) {
        Log.w(TAG, "Failed to restore volume control stream", e)
      }
    }
  }
}
