package expo.modules.incomingcallandroid

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.util.Log

object VoiceCallAudioRoute {
  private const val TAG = "VoiceCallAudioRoute"

  fun isBluetoothAvailable(context: Context): Boolean {
    val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      val devices = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
      for (device in devices) {
        when (device.type) {
          AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
          AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> return true
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
          device.type == AudioDeviceInfo.TYPE_BLE_HEADSET
        ) {
          return true
        }
      }
      return false
    }
    @Suppress("DEPRECATION")
    return am.isBluetoothA2dpOn
  }

  fun setRoute(context: Context, route: String): Map<String, Any?> {
    val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    // Never steal audio mode from an active cellular/ringtone call — that crashes many OEMs.
    if (
      CellularCallHoldWatcher.cellularHoldActive ||
      am.mode == AudioManager.MODE_IN_CALL ||
      am.mode == AudioManager.MODE_RINGTONE
    ) {
      Log.w(TAG, "setRoute skipped during cellular/ringtone mode=${am.mode} route=$route")
      return mapOf("applied" to false, "route" to route, "reason" to "cellular_active")
    }
    am.mode = AudioManager.MODE_IN_COMMUNICATION
    return when (route) {
      "bluetooth" -> {
        @Suppress("DEPRECATION")
        am.isSpeakerphoneOn = false
        @Suppress("DEPRECATION")
        am.startBluetoothSco()
        @Suppress("DEPRECATION")
        am.isBluetoothScoOn = true
        mapOf("applied" to true, "route" to "bluetooth")
      }
      "speaker" -> {
        @Suppress("DEPRECATION")
        am.isBluetoothScoOn = false
        @Suppress("DEPRECATION")
        am.stopBluetoothSco()
        @Suppress("DEPRECATION")
        am.isSpeakerphoneOn = true
        mapOf("applied" to true, "route" to "speaker")
      }
      else -> {
        @Suppress("DEPRECATION")
        am.isBluetoothScoOn = false
        @Suppress("DEPRECATION")
        am.stopBluetoothSco()
        @Suppress("DEPRECATION")
        am.isSpeakerphoneOn = false
        mapOf("applied" to true, "route" to "earpiece")
      }
    }
  }

  fun release(context: Context) {
    val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    try {
      @Suppress("DEPRECATION")
      am.isBluetoothScoOn = false
      @Suppress("DEPRECATION")
      am.stopBluetoothSco()
      @Suppress("DEPRECATION")
      am.isSpeakerphoneOn = false
      // Do not force MODE_NORMAL over an active cellular call.
      if (
        !CellularCallHoldWatcher.cellularHoldActive &&
        am.mode != AudioManager.MODE_IN_CALL &&
        am.mode != AudioManager.MODE_RINGTONE
      ) {
        am.mode = AudioManager.MODE_NORMAL
      }
    } catch (e: Exception) {
      Log.w(TAG, "release failed", e)
    }
  }
}
