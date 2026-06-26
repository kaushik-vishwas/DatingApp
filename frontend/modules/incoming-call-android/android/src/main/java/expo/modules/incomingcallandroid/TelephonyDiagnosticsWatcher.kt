package expo.modules.incomingcallandroid

import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import androidx.core.content.ContextCompat

/**
 * High-resolution telephony + audio-mode diagnostics for GSM disconnect forensics.
 * Telephony call-state requires READ_PHONE_STATE when available; audio mode always works.
 */
object TelephonyDiagnosticsWatcher {
  private val mainHandler = Handler(Looper.getMainLooper())
  private var appContext: Context? = null
  private var audioManager: AudioManager? = null
  private var telephonyManager: TelephonyManager? = null
  private var emit: ((Map<String, Any?>) -> Unit)? = null
  private var watching = false
  private var lastAudioMode = AudioManager.MODE_INVALID
  private var lastCallState: Int? = null
  private var appThinksGsmActive = false

  private var telephonyCallback31: TelephonyCallback? = null
  private var phoneStateListenerLegacy: PhoneStateListener? = null
  private var phoneStateReceiver: PhoneStateBroadcastReceiver? = null

  fun start(context: Context, onEvent: (Map<String, Any?>) -> Unit) {
    stop()
    appContext = context.applicationContext
    emit = onEvent
    watching = true
    audioManager = appContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
    telephonyManager = appContext?.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
    lastAudioMode = audioManager?.mode ?: AudioManager.MODE_INVALID
    lastCallState = readCallStateSafe()
    registerTelephonyCallback()
    registerPhoneStateBroadcastReceiver()
    emitDiagnostic("watch_started", "start", lastAudioMode, lastCallState, null)
  }

  fun stop() {
    watching = false
    unregisterTelephonyCallback()
    unregisterPhoneStateBroadcastReceiver()
    audioManager = null
    telephonyManager = null
    appContext = null
    emit = null
    lastAudioMode = AudioManager.MODE_INVALID
    lastCallState = null
    appThinksGsmActive = false
  }

  fun notifyAppGsmActive(active: Boolean) {
    appThinksGsmActive = active
    val am = audioManager
    emitDiagnostic(
      if (active) "app_gsm_active" else "app_gsm_inactive",
      "app_bridge",
      am?.mode ?: AudioManager.MODE_INVALID,
      lastCallState,
      null
    )
  }

  fun recordAudioModeFromWatcher(mode: Int, source: String) {
    if (!watching) return
    val previous = lastAudioMode
    lastAudioMode = mode
    if (previous != mode) {
      emitDiagnostic("audio_mode_change", source, mode, lastCallState, previous)
    }
  }

  private fun readCallStateSafe(): Int? {
    val ctx = appContext ?: return null
    if (
      ContextCompat.checkSelfPermission(ctx, android.Manifest.permission.READ_PHONE_STATE) !=
      PackageManager.PERMISSION_GRANTED
    ) {
      return null
    }
    return try {
      telephonyManager?.callState
    } catch (_: Exception) {
      null
    }
  }

  private fun registerTelephonyCallback() {
    if (!hasReadPhoneStatePermission()) return
    val tm = telephonyManager ?: return
    val ctx = appContext ?: return

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      if (telephonyCallback31 != null) return
      val callback =
        object : TelephonyCallback(), TelephonyCallback.CallStateListener {
          override fun onCallStateChanged(state: Int) {
            val detectedAt = SystemClock.elapsedRealtime()
            mainHandler.post {
              val callbackAt = SystemClock.elapsedRealtime()
              val delayMs = callbackAt - detectedAt
              onCallStateChanged(state, "telephony_callback", delayMs)
            }
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
          onCallStateChanged(state, "telephony_legacy", null)
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

  private fun hasReadPhoneStatePermission(): Boolean {
    val ctx = appContext ?: return false
    return (
      ContextCompat.checkSelfPermission(ctx, android.Manifest.permission.READ_PHONE_STATE) ==
        PackageManager.PERMISSION_GRANTED
    )
  }

  private fun onCallStateChanged(state: Int, source: String, callbackDelayMs: Long?) {
    val previous = lastCallState
    lastCallState = state
    val kind =
      when (state) {
        TelephonyManager.CALL_STATE_RINGING -> "call_state_ringing"
        TelephonyManager.CALL_STATE_OFFHOOK -> "call_state_offhook"
        TelephonyManager.CALL_STATE_IDLE -> "call_state_idle"
        else -> "call_state_unknown"
      }
    emitDiagnostic(kind, source, lastAudioMode, state, previous, callbackDelayMs)
  }

  private fun registerPhoneStateBroadcastReceiver() {
    if (!hasReadPhoneStatePermission()) return
    val ctx = appContext ?: return
    if (phoneStateReceiver != null) return
    val receiver =
      PhoneStateBroadcastReceiver { state ->
        mainHandler.post { onCallStateChanged(state, "phone_state_broadcast", null) }
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

  private fun unregisterTelephonyCallback() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val tm = telephonyManager ?: return
      val callback = telephonyCallback31 ?: return
      try {
        tm.unregisterTelephonyCallback(callback)
      } catch (_: Exception) {
        // ignore
      }
      telephonyCallback31 = null
      return
    }

    val tm = telephonyManager
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
  }

  private fun audioModeLabel(mode: Int): String =
    when (mode) {
      AudioManager.MODE_IN_CALL -> "MODE_IN_CALL"
      AudioManager.MODE_IN_COMMUNICATION -> "MODE_IN_COMMUNICATION"
      AudioManager.MODE_RINGTONE -> "MODE_RINGTONE"
      AudioManager.MODE_NORMAL -> "MODE_NORMAL"
      else -> "mode_$mode"
    }

  private fun callStateLabel(state: Int?): String? =
    when (state) {
      TelephonyManager.CALL_STATE_IDLE -> "CALL_STATE_IDLE"
      TelephonyManager.CALL_STATE_RINGING -> "CALL_STATE_RINGING"
      TelephonyManager.CALL_STATE_OFFHOOK -> "CALL_STATE_OFFHOOK"
      null -> null
      else -> "CALL_STATE_$state"
    }

  private fun emitDiagnostic(
    kind: String,
    source: String,
    audioMode: Int,
    callState: Int?,
    previousAudioMode: Int?,
    callbackDelayMs: Long? = null
  ) {
    if (!watching) return
    val eventAtMs = System.currentTimeMillis()
    emit?.invoke(
      mapOf(
        "kind" to kind,
        "eventAtMs" to eventAtMs,
        "audioMode" to audioMode,
        "audioModeLabel" to audioModeLabel(audioMode),
        "previousAudioMode" to previousAudioMode,
        "previousAudioModeLabel" to previousAudioMode?.let { audioModeLabel(it) },
        "callState" to callState,
        "callStateLabel" to callStateLabel(callState),
        "appThinksGsmActive" to appThinksGsmActive,
        "source" to source,
        "callbackDelayMs" to callbackDelayMs
      )
    )
  }
}
