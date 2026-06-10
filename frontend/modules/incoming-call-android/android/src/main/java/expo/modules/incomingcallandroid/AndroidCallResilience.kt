package expo.modules.incomingcallandroid

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.content.ContextCompat

internal object AndroidCallResilience {
  private const val MIN_FOREGROUND_SERVICE_API = Build.VERSION_CODES.O // API 26
  private const val MIN_BATTERY_OPT_API = Build.VERSION_CODES.M // API 23

  fun startCallWebSocketForegroundService(context: Context, callLabel: String): Boolean {
    if (Build.VERSION.SDK_INT < MIN_FOREGROUND_SERVICE_API) return false
    CallWebSocketForegroundService.start(context, callLabel)
    return true
  }

  fun stopCallWebSocketForegroundService(context: Context) {
    if (Build.VERSION.SDK_INT < MIN_FOREGROUND_SERVICE_API) return
    CallWebSocketForegroundService.stop(context)
  }

  fun requestIgnoreBatteryOptimizations(context: Context): Map<String, Any?> {
    if (Build.VERSION.SDK_INT < MIN_BATTERY_OPT_API) {
      return mapOf("requested" to false, "alreadyIgnored" to false, "unavailable" to true)
    }

    val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
    if (powerManager == null) {
      return mapOf("requested" to false, "alreadyIgnored" to false, "unavailable" to true)
    }

    val packageName = context.packageName
    if (powerManager.isIgnoringBatteryOptimizations(packageName)) {
      return mapOf("requested" to false, "alreadyIgnored" to true)
    }

    return try {
      val intent =
        Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
          data = Uri.parse("package:$packageName")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
      ContextCompat.startActivity(context, intent, null)
      mapOf("requested" to true, "alreadyIgnored" to false)
    } catch (_: Exception) {
      mapOf("requested" to false, "alreadyIgnored" to false, "unavailable" to true)
    }
  }
}
