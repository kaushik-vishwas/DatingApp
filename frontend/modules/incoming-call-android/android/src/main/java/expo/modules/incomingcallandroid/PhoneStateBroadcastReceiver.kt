package expo.modules.incomingcallandroid

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.telephony.TelephonyManager
import androidx.core.content.ContextCompat

/**
 * PHONE_STATE broadcast — works on more OEMs than TelephonyCallback alone (OPPO, Xiaomi, etc.).
 */
internal class PhoneStateBroadcastReceiver(
  private val onState: (Int) -> Unit
) : BroadcastReceiver() {
  private var registered = false

  override fun onReceive(context: Context?, intent: Intent?) {
    if (intent?.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) return
    val extraState = intent.getStringExtra(TelephonyManager.EXTRA_STATE) ?: return
    val state =
      when (extraState) {
        TelephonyManager.EXTRA_STATE_RINGING -> TelephonyManager.CALL_STATE_RINGING
        TelephonyManager.EXTRA_STATE_OFFHOOK -> TelephonyManager.CALL_STATE_OFFHOOK
        TelephonyManager.EXTRA_STATE_IDLE -> TelephonyManager.CALL_STATE_IDLE
        else -> return
      }
    onState(state)
  }

  fun register(context: Context) {
    if (registered) return
    val filter = IntentFilter(TelephonyManager.ACTION_PHONE_STATE_CHANGED)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(this, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("DEPRECATION")
      ContextCompat.registerReceiver(
        context,
        this,
        filter,
        ContextCompat.RECEIVER_NOT_EXPORTED
      )
    }
    registered = true
  }

  fun unregister(context: Context) {
    if (!registered) return
    try {
      context.unregisterReceiver(this)
    } catch (_: Exception) {
      // ignore
    }
    registered = false
  }
}
