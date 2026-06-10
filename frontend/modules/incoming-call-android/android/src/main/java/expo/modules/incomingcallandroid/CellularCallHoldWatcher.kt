package expo.modules.incomingcallandroid

import android.content.Context
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat

/**
 * Detects cellular call interruption via [AudioManager] mode, audio-focus loss, and (API 31+)
 * mode-change callbacks — no phone permission required.
 *
 * VoIP uses MODE_IN_COMMUNICATION; an answered carrier call uses MODE_IN_CALL.
 * Samsung One UI 6 may delay mode transitions — audio-focus loss is detected earlier.
 */
object CellularCallHoldWatcher {
  private const val POLL_MS_DEFAULT = 100L
  private const val POLL_MS_SAMSUNG = 40L

  private val mainHandler = Handler(Looper.getMainLooper())
  private var appContext: Context? = null
  private var audioManager: AudioManager? = null
  private var onChange: ((Boolean, Int, String) -> Unit)? = null
  private var lastEmitted = false
  private var polling = false
  private var gsmPreemptive = false
  private var lastMode = AudioManager.MODE_INVALID

  private var modeChangedListener: AudioManager.OnModeChangedListener? = null

  private val pollRunnable =
    object : Runnable {
      override fun run() {
        if (!polling) return
        evaluateAndEmit("poll")
        val delay = if (SamsungCallCompat.isSamsungOneUi6OrNewer()) POLL_MS_SAMSUNG else POLL_MS_DEFAULT
        mainHandler.postDelayed(this, delay)
      }
    }

  fun start(context: Context, onActiveChanged: (Boolean, Int, String) -> Unit) {
    stop()
    appContext = context.applicationContext
    onChange = onActiveChanged
    audioManager = appContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
    polling = true
    lastMode = audioManager?.mode ?: AudioManager.MODE_INVALID
    registerModeChangedListener()
    mainHandler.post(pollRunnable)
    evaluateAndEmit("start")
  }

  fun stop() {
    polling = false
    mainHandler.removeCallbacks(pollRunnable)
    unregisterModeChangedListener()
    audioManager = null
    appContext = null
    onChange = null
    lastEmitted = false
    gsmPreemptive = false
    lastMode = AudioManager.MODE_INVALID
  }

  private fun audioModeSuggestsCellularCall(mode: Int): Boolean =
    when (mode) {
      AudioManager.MODE_IN_CALL,
      AudioManager.MODE_CALL_SCREENING -> true
      else -> false
    }

  private fun evaluateAndEmit(source: String) {
    val am = audioManager ?: return
    val mode = am.mode
    val previousMode = lastMode
    lastMode = mode
    val cellularMode = audioModeSuggestsCellularCall(mode)

    if (SamsungCallCompat.isSamsungOneUi6OrNewer()) {
      if (cellularMode) {
        gsmPreemptive = true
      } else if (
        previousMode == AudioManager.MODE_IN_COMMUNICATION &&
        mode == AudioManager.MODE_RINGTONE
      ) {
        // Incoming GSM ring while VoIP is active — hold before MODE_IN_CALL on One UI 6.
        gsmPreemptive = true
      } else if (
        gsmPreemptive &&
        !cellularMode &&
        mode == AudioManager.MODE_IN_COMMUNICATION
      ) {
        gsmPreemptive = false
      }
    }

    TelephonyDiagnosticsWatcher.recordAudioModeFromWatcher(mode, source)

    val active = cellularMode || gsmPreemptive
    val resolvedSource =
      when {
        cellularMode -> "audio_mode"
        gsmPreemptive -> "samsung_preemptive"
        else -> source
      }
    emitIfChanged(active, mode, resolvedSource)
  }

  private fun emitIfChanged(active: Boolean, mode: Int, source: String) {
    if (active == lastEmitted) return
    lastEmitted = active
    if (!active) {
      gsmPreemptive = false
    }
    TelephonyDiagnosticsWatcher.notifyAppGsmActive(active)
    mainHandler.post { onChange?.invoke(active, mode, source) }
  }

  private fun registerModeChangedListener() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
    val am = audioManager ?: return
    val ctx = appContext ?: return
    if (modeChangedListener != null) return

    val listener = AudioManager.OnModeChangedListener { mode ->
      evaluateAndEmit("mode_changed")
    }
    modeChangedListener = listener
    am.addOnModeChangedListener(ContextCompat.getMainExecutor(ctx), listener)
  }

  private fun unregisterModeChangedListener() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
    val am = audioManager
    val listener = modeChangedListener
    if (am != null && listener != null) {
      am.removeOnModeChangedListener(listener)
    }
    modeChangedListener = null
  }
}
