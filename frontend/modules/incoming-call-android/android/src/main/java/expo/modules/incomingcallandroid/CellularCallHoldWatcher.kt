package expo.modules.incomingcallandroid

import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import androidx.core.content.ContextCompat

/**
 * Detects cellular call interruption via [AudioManager] mode, telephony off-hook
 * (when READ_PHONE_STATE is granted), system mic mute during VoIP, and (API 31+)
 * mode-change callbacks.
 *
 * VoIP uses MODE_IN_COMMUNICATION; an answered carrier call uses MODE_IN_CALL or
 * keeps IN_COMMUNICATION while telephony goes OFFHOOK on some OEMs.
 */
object CellularCallHoldWatcher {
  private const val POLL_MS_DEFAULT = 50L
  private const val POLL_MS_SAMSUNG = 40L

  private val mainHandler = Handler(Looper.getMainLooper())
  private var appContext: Context? = null
  private var audioManager: AudioManager? = null
  private var telephonyManager: TelephonyManager? = null
  private var onChange: ((Boolean, Int, String) -> Unit)? = null
  private var lastEmitted = false
  private var polling = false
  private var gsmPreemptive = false
  private var telephonyOffhook = false
  private var lastMode = AudioManager.MODE_INVALID

  private var modeChangedListener: AudioManager.OnModeChangedListener? = null
  private var telephonyCallback31: TelephonyCallback? = null
  private var phoneStateListenerLegacy: PhoneStateListener? = null
  private var phoneStateReceiver: PhoneStateBroadcastReceiver? = null
  private var audioFocusHeld = false

  @Suppress("DEPRECATION")
  private val audioFocusListener =
    AudioManager.OnAudioFocusChangeListener { focusChange ->
      when (focusChange) {
        AudioManager.AUDIOFOCUS_LOSS,
        AudioManager.AUDIOFOCUS_LOSS_TRANSIENT,
        AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
          gsmPreemptive = true
          mainHandler.post { evaluateAndEmit("audio_focus_loss") }
        }
        AudioManager.AUDIOFOCUS_GAIN -> {
          mainHandler.post { evaluateAndEmit("audio_focus_gain") }
        }
      }
    }

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
    telephonyManager = appContext?.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
    polling = true
    lastMode = audioManager?.mode ?: AudioManager.MODE_INVALID
    registerModeChangedListener()
    registerTelephonyListenerIfPermitted()
    registerPhoneStateBroadcastReceiver()
    acquireVoipAudioFocus(audioManager)
    if (hasReadPhoneStatePermission()) {
      try {
        when (telephonyManager?.callState) {
          TelephonyManager.CALL_STATE_OFFHOOK -> {
            telephonyOffhook = true
            gsmPreemptive = true
          }
          TelephonyManager.CALL_STATE_RINGING -> gsmPreemptive = true
        }
      } catch (_: Exception) {
        // ignore
      }
    }
    mainHandler.post(pollRunnable)
    evaluateAndEmit("start")
  }

  /** Re-register telephony after READ_PHONE_STATE is granted at runtime. */
  fun refreshTelephonyListener() {
    unregisterTelephonyListener()
    unregisterPhoneStateBroadcastReceiver()
    registerTelephonyListenerIfPermitted()
    registerPhoneStateBroadcastReceiver()
    evaluateAndEmit("telephony_refresh")
  }

  fun stop() {
    polling = false
    mainHandler.removeCallbacks(pollRunnable)
    releaseVoipAudioFocus(audioManager)
    unregisterModeChangedListener()
    unregisterTelephonyListener()
    unregisterPhoneStateBroadcastReceiver()
    audioManager = null
    telephonyManager = null
    appContext = null
    onChange = null
    lastEmitted = false
    gsmPreemptive = false
    telephonyOffhook = false
    lastMode = AudioManager.MODE_INVALID
  }

  private fun hasReadPhoneStatePermission(): Boolean {
    val ctx = appContext ?: return false
    return (
      ContextCompat.checkSelfPermission(ctx, android.Manifest.permission.READ_PHONE_STATE) ==
        PackageManager.PERMISSION_GRANTED
    )
  }

  private fun audioModeSuggestsCellularCall(mode: Int): Boolean =
    when (mode) {
      AudioManager.MODE_IN_CALL,
      AudioManager.MODE_CALL_SCREENING -> true
      else -> false
    }

  private fun systemMicMutedDuringVoip(am: AudioManager, mode: Int): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
      mode == AudioManager.MODE_IN_COMMUNICATION &&
      am.isMicrophoneMute

  private fun evaluateAndEmit(source: String) {
    val am = audioManager ?: return
    val mode = am.mode
    val previousMode = lastMode
    lastMode = mode
    val cellularMode = audioModeSuggestsCellularCall(mode)
    val micMutedDuringVoip = systemMicMutedDuringVoip(am, mode)

    if (
      previousMode == AudioManager.MODE_IN_COMMUNICATION &&
      mode == AudioManager.MODE_RINGTONE
    ) {
      gsmPreemptive = true
    } else if (
      previousMode == AudioManager.MODE_IN_COMMUNICATION &&
      mode != AudioManager.MODE_IN_COMMUNICATION &&
      mode != AudioManager.MODE_NORMAL
    ) {
      gsmPreemptive = true
    } else if (cellularMode) {
      gsmPreemptive = true
    } else if (micMutedDuringVoip && polling) {
      gsmPreemptive = true
    } else if (gsmPreemptive && !cellularMode && mode == AudioManager.MODE_IN_COMMUNICATION) {
      if (!telephonyOffhook && !micMutedDuringVoip) {
        gsmPreemptive = false
      }
    }

    TelephonyDiagnosticsWatcher.recordAudioModeFromWatcher(mode, source)

    val active = cellularMode || gsmPreemptive || telephonyOffhook
    val resolvedSource =
      when {
        cellularMode -> "audio_mode"
        telephonyOffhook -> "telephony_offhook"
        micMutedDuringVoip -> "system_mic_mute"
        gsmPreemptive -> "preemptive_ring"
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

  private fun onTelephonyCallStateChanged(state: Int) {
    if (state == TelephonyManager.CALL_STATE_RINGING && polling) {
      gsmPreemptive = true
      evaluateAndEmit("telephony_ringing")
    }
    val offhook = state == TelephonyManager.CALL_STATE_OFFHOOK
    if (offhook) {
      gsmPreemptive = true
    }
    if (telephonyOffhook == offhook) return
    telephonyOffhook = offhook
    evaluateAndEmit("telephony_state")
  }

  @Suppress("DEPRECATION")
  private fun acquireVoipAudioFocus(am: AudioManager?) {
    if (am == null || audioFocusHeld) return
    val result =
      am.requestAudioFocus(
        audioFocusListener,
        AudioManager.STREAM_VOICE_CALL,
        AudioManager.AUDIOFOCUS_GAIN
      )
    audioFocusHeld = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
  }

  @Suppress("DEPRECATION")
  private fun releaseVoipAudioFocus(am: AudioManager?) {
    if (am == null || !audioFocusHeld) return
    am.abandonAudioFocus(audioFocusListener)
    audioFocusHeld = false
  }

  private fun registerPhoneStateBroadcastReceiver() {
    if (!hasReadPhoneStatePermission()) return
    val ctx = appContext ?: return
    if (phoneStateReceiver != null) return
    val receiver =
      PhoneStateBroadcastReceiver { state ->
        mainHandler.post { onTelephonyCallStateChanged(state) }
      }
    phoneStateReceiver = receiver
    receiver.register(ctx)
  }

  private fun unregisterPhoneStateBroadcastReceiver() {
    val ctx = appContext
    val receiver = phoneStateReceiver
    if (ctx != null && receiver != null) {
      receiver.unregister(ctx)
    }
    phoneStateReceiver = null
  }

  private fun registerTelephonyListenerIfPermitted() {
    if (!hasReadPhoneStatePermission()) return
    val tm = telephonyManager ?: return

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      if (telephonyCallback31 != null) return
      val callback =
        object : TelephonyCallback(), TelephonyCallback.CallStateListener {
          override fun onCallStateChanged(state: Int) {
            mainHandler.post { onTelephonyCallStateChanged(state) }
          }
        }
      telephonyCallback31 = callback
      try {
        tm.registerTelephonyCallback(mainHandler::post, callback)
      } catch (_: Exception) {
        telephonyCallback31 = null
      }
      return
    }

    if (phoneStateListenerLegacy != null) return
    @Suppress("DEPRECATION")
    val listener =
      object : PhoneStateListener() {
        @Deprecated("Deprecated in Java")
        override fun onCallStateChanged(state: Int, phoneNumber: String?) {
          onTelephonyCallStateChanged(state)
        }
      }
    phoneStateListenerLegacy = listener
    try {
      @Suppress("DEPRECATION")
      tm.listen(listener, PhoneStateListener.LISTEN_CALL_STATE)
    } catch (_: Exception) {
      phoneStateListenerLegacy = null
    }
  }

  private fun unregisterTelephonyListener() {
    val tm = telephonyManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val callback = telephonyCallback31
      if (tm != null && callback != null) {
        try {
          tm.unregisterTelephonyCallback(callback)
        } catch (_: Exception) {
          // ignore
        }
      }
      telephonyCallback31 = null
      return
    }

    val listener = phoneStateListenerLegacy
    if (tm != null && listener != null) {
      try {
        @Suppress("DEPRECATION")
        tm.listen(listener, PhoneStateListener.LISTEN_NONE)
      } catch (_: Exception) {
        // ignore
      }
    }
    phoneStateListenerLegacy = null
    telephonyOffhook = false
  }

  private fun registerModeChangedListener() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
    val am = audioManager ?: return
    val ctx = appContext ?: return
    if (modeChangedListener != null) return

    val listener = AudioManager.OnModeChangedListener { evaluateAndEmit("mode_changed") }
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
