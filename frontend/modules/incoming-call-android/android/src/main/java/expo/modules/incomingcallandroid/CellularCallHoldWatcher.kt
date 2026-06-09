package expo.modules.incomingcallandroid

import android.content.Context
import android.media.AudioManager
import android.os.Handler
import android.os.Looper

/**
 * Detects cellular call interruption via [AudioManager] mode only — no phone permission.
 * VoIP uses MODE_IN_COMMUNICATION; an answered carrier call uses MODE_IN_CALL.
 */
object CellularCallHoldWatcher {
  private const val POLL_MS = 100L

  private val mainHandler = Handler(Looper.getMainLooper())
  private var audioManager: AudioManager? = null
  private var onChange: ((Boolean, Int) -> Unit)? = null
  private var lastEmitted = false
  private var polling = false

  private val pollRunnable =
    object : Runnable {
      override fun run() {
        if (!polling) return
        evaluateAndEmit()
        mainHandler.postDelayed(this, POLL_MS)
      }
    }

  fun start(context: Context, onActiveChanged: (Boolean, Int) -> Unit) {
    stop()
    onChange = onActiveChanged
    audioManager = context.applicationContext.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
    polling = true
    mainHandler.post(pollRunnable)
    evaluateAndEmit()
  }

  fun stop() {
    polling = false
    mainHandler.removeCallbacks(pollRunnable)
    audioManager = null
    onChange = null
    lastEmitted = false
  }

  private fun audioModeSuggestsCellularCall(): Boolean {
    val am = audioManager ?: return false
    return when (am.mode) {
      AudioManager.MODE_IN_CALL,
      AudioManager.MODE_CALL_SCREENING -> true
      else -> false
    }
  }

  private fun evaluateAndEmit() {
    val am = audioManager
    val mode = am?.mode ?: AudioManager.MODE_INVALID
    val active = audioModeSuggestsCellularCall()
    if (active == lastEmitted) return
    lastEmitted = active
    mainHandler.post { onChange?.invoke(active, mode) }
  }
}
