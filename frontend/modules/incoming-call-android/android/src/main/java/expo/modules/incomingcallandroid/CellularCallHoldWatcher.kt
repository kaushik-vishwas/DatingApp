package expo.modules.incomingcallandroid

import android.content.Context
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager

/**
 * Detects when the device is in a cellular phone call (ringing or off-hook).
 * Used to drive "On hold" for the in-app voice call peer — not app background.
 */
object CellularCallHoldWatcher {
  private const val POLL_MS = 100L

  private val mainHandler = Handler(Looper.getMainLooper())
  private var telephonyManager: TelephonyManager? = null
  private var audioManager: AudioManager? = null
  private var callback31: TelephonyCallback? = null
  private var listenerLegacy: PhoneStateListener? = null
  private var onChange: ((Boolean) -> Unit)? = null
  private var telephonyActive = false
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

  fun start(context: Context, onActiveChanged: (Boolean) -> Unit) {
    stop()
    onChange = onActiveChanged
    val appCtx = context.applicationContext
    telephonyManager =
      appCtx.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
    audioManager = appCtx.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

    registerTelephony(appCtx)
    polling = true
    mainHandler.post(pollRunnable)
    evaluateAndEmit()
  }

  fun stop() {
    polling = false
    mainHandler.removeCallbacks(pollRunnable)
    unregisterTelephony()
    telephonyManager = null
    audioManager = null
    onChange = null
    telephonyActive = false
    lastEmitted = false
  }

  private fun registerTelephony(context: Context) {
    val tm = telephonyManager ?: return
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val cb =
          object : TelephonyCallback(), TelephonyCallback.CallStateListener {
            override fun onCallStateChanged(state: Int) {
              telephonyActive = state != TelephonyManager.CALL_STATE_IDLE
              evaluateAndEmit()
            }
          }
        callback31 = cb
        tm.registerTelephonyCallback(mainHandler::post, cb)
      } else {
        @Suppress("DEPRECATION")
        val listener =
          object : PhoneStateListener() {
            @Deprecated("Deprecated in Java")
            override fun onCallStateChanged(state: Int, phoneNumber: String?) {
              telephonyActive = state != TelephonyManager.CALL_STATE_IDLE
              evaluateAndEmit()
            }
          }
        listenerLegacy = listener
        @Suppress("DEPRECATION")
        tm.listen(listener, PhoneStateListener.LISTEN_CALL_STATE)
      }
      @Suppress("DEPRECATION", "MissingPermission")
      telephonyActive = tm.callState != TelephonyManager.CALL_STATE_IDLE
    } catch (_: SecurityException) {
      telephonyActive = false
    } catch (_: Exception) {
      telephonyActive = false
    }
  }

  private fun unregisterTelephony() {
    val tm = telephonyManager ?: return
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        callback31?.let { tm.unregisterTelephonyCallback(it) }
      } else {
        listenerLegacy?.let {
          @Suppress("DEPRECATION")
          tm.listen(it, PhoneStateListener.LISTEN_NONE)
        }
      }
    } catch (_: Exception) {
      // ignore
    }
    callback31 = null
    listenerLegacy = null
  }

  private fun audioModeSuggestsCellularCall(): Boolean {
    val am = audioManager ?: return false
    return when (am.mode) {
      AudioManager.MODE_IN_CALL, AudioManager.MODE_RINGTONE -> true
      else -> false
    }
  }

  private fun evaluateAndEmit() {
    val active = telephonyActive || audioModeSuggestsCellularCall()
    if (active == lastEmitted) return
    lastEmitted = active
    mainHandler.post { onChange?.invoke(active) }
  }
}
