package expo.modules.incomingcallandroid

import android.app.NotificationManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Samsung incoming-call notification tap fix + cellular hold detection.
 */
class IncomingCallAndroidModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("IncomingCallAndroid")

    Events("onCellularCallStateChanged", "onNotificationTapRelayed", "onTelephonyDiagnostic")

    OnCreate {
      IncomingCallNotificationTapEventSink.emit = { payload ->
        sendEvent("onNotificationTapRelayed", payload)
      }
    }

    AsyncFunction("ensureIncomingCallChannelAsync") {
      val context = appContext.reactContext
        ?: return@AsyncFunction mapOf("ensured" to false)
      IncomingCallNotificationChannels.ensureIncomingCallChannel(context)
      mapOf("ensured" to true)
    }

    Function("startIncomingRingtone") {
      val context = appContext.reactContext ?: return@Function false
      IncomingCallNotificationChannels.ensureIncomingCallChannel(context)
      IncomingCallRingtonePlayer.start(context)
    }

    Function("stopIncomingRingtone") {
      val context = appContext.reactContext
      IncomingCallRingtonePlayer.stop(context)
      true
    }

    Function("isIncomingRingtonePlaying") {
      IncomingCallRingtonePlayer.isPlaying()
    }

    /** Prompt once-friendly: open system dialog to ignore battery optimizations. */
    AsyncFunction("requestIgnoreBatteryOptimizationsAsync") {
      val context = appContext.reactContext
        ?: return@AsyncFunction mapOf("ok" to false, "reason" to "no_context")
      val pm = context.getSystemService(PowerManager::class.java)
      val pkg = context.packageName
      if (pm != null && pm.isIgnoringBatteryOptimizations(pkg)) {
        return@AsyncFunction mapOf("ok" to true, "alreadyIgnoring" to true)
      }
      return@AsyncFunction try {
        val intent =
          Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
            data = Uri.parse("package:$pkg")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
        context.startActivity(intent)
        mapOf("ok" to true, "alreadyIgnoring" to false, "sdkInt" to Build.VERSION.SDK_INT)
      } catch (e: Exception) {
        mapOf("ok" to false, "reason" to (e.message ?: "start_failed"))
      }
    }

    Function("isIgnoringBatteryOptimizations") {
      val context = appContext.reactContext ?: return@Function false
      val pm = context.getSystemService(PowerManager::class.java) ?: return@Function false
      pm.isIgnoringBatteryOptimizations(context.packageName)
    }

    Function("canUseFullScreenIntent") {
      val context = appContext.reactContext ?: return@Function true
      if (Build.VERSION.SDK_INT < 34) return@Function true
      val nm = context.getSystemService(android.app.NotificationManager::class.java)
      nm?.canUseFullScreenIntent() ?: true
    }

    AsyncFunction("openFullScreenIntentSettingsAsync") {
      val context = appContext.reactContext
        ?: return@AsyncFunction mapOf("ok" to false, "reason" to "no_context")
      return@AsyncFunction try {
        val intent =
          if (Build.VERSION.SDK_INT >= 34) {
            Intent("android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT").apply {
              data = Uri.parse("package:${context.packageName}")
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
          } else {
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
              data = Uri.parse("package:${context.packageName}")
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
          }
        context.startActivity(intent)
        mapOf("ok" to true)
      } catch (e: Exception) {
        mapOf("ok" to false, "reason" to (e.message ?: "start_failed"))
      }
    }

    Function("startOnlinePresenceKeepAlive") { apiBase: String?, authToken: String? ->
      val context = appContext.reactContext ?: return@Function false
      OnlinePresenceForegroundService.start(context, apiBase.orEmpty(), authToken.orEmpty())
      true
    }

    Function("stopOnlinePresenceKeepAlive") {
      val context = appContext.reactContext ?: return@Function false
      OnlinePresenceForegroundService.stop(context)
      true
    }

    Function("isOnlinePresenceKeepAliveRunning") {
      OnlinePresenceForegroundService.running
    }

    Function("readNativePresenceWakeLog") {
      val context = appContext.reactContext ?: return@Function ""
      PresenceNativeWakeLog.readAll(context)
    }

    Function("clearNativePresenceWakeLog") {
      val context = appContext.reactContext ?: return@Function false
      PresenceNativeWakeLog.clear(context)
      true
    }

    Function("getPresenceDebugSnapshot") {
      val context = appContext.reactContext ?: return@Function mapOf("ok" to false, "reason" to "no_context")
      val pm = context.getSystemService(PowerManager::class.java)
      val nm = context.getSystemService(NotificationManager::class.java)
      val canFsi =
        if (Build.VERSION.SDK_INT < 34) true else nm?.canUseFullScreenIntent() == true
      mapOf(
        "ok" to true,
        "sdkInt" to Build.VERSION.SDK_INT,
        "manufacturer" to Build.MANUFACTURER,
        "brand" to Build.BRAND,
        "model" to Build.MODEL,
        "batteryUnrestricted" to (pm?.isIgnoringBatteryOptimizations(context.packageName) == true),
        "canUseFullScreenIntent" to canFsi,
        "notificationsEnabled" to (nm?.areNotificationsEnabled() != false),
        "keepAliveRunning" to OnlinePresenceForegroundService.running,
        "packageName" to context.packageName
      )
    }

    AsyncFunction("applyFullScreenIntentAsync") { identifier: String, debugEnabled: Boolean ->
      val context = appContext.reactContext
        ?: return@AsyncFunction mapOf("applied" to false, "failureReason" to "no_context")
      IncomingCallNotificationChannels.ensureIncomingCallChannel(context)
      val result =
        IncomingCallNotificationTapEnhancer.enhancePostedNotification(
          context,
          identifier.trim(),
          debugEnabled
        )
      result.toLogMap()
    }

    Function("getSamsungCallCompatProfile") {
      SamsungCallCompat.deviceProfile()
    }

    Function("startCellularCallHoldWatch") {
      val context = appContext.reactContext ?: return@Function false
      CellularCallHoldWatcher.start(context) { active, audioMode, source ->
        sendEvent(
          "onCellularCallStateChanged",
          mapOf(
            "active" to active,
            "audioMode" to audioMode,
            "source" to source
          )
        )
      }
      true
    }

    Function("stopCellularCallHoldWatch") {
      CellularCallHoldWatcher.stop()
    }

    Function("refreshCellularCallHoldTelephony") {
      CellularCallHoldWatcher.refreshTelephonyListener()
      true
    }

    Function("startTelephonyDiagnosticsWatch") {
      val context = appContext.reactContext ?: return@Function false
      TelephonyDiagnosticsWatcher.start(context) { payload ->
        sendEvent("onTelephonyDiagnostic", payload)
      }
      true
    }

    Function("stopTelephonyDiagnosticsWatch") {
      TelephonyDiagnosticsWatcher.stop()
    }

    Function("isBluetoothVoiceOutputAvailable") {
      val context = appContext.reactContext ?: return@Function false
      VoiceCallAudioRoute.isBluetoothAvailable(context)
    }

    Function("setVoiceCallAudioRoute") { route: String ->
      val context = appContext.reactContext
        ?: return@Function mapOf("applied" to false, "route" to route)
      VoiceCallAudioRoute.setRoute(context, route.trim().lowercase())
    }

    Function("releaseVoiceCallAudioRoute") {
      val context = appContext.reactContext ?: return@Function Unit
      VoiceCallAudioRoute.release(context)
    }
  }

  private fun EnhanceTapResult.toLogMap(): Map<String, Any?> =
    mapOf(
      "applied" to applied,
      "failureReason" to failureReason,
      "notificationTag" to notificationTag,
      "notificationId" to notificationId,
      "overlayCollapsedBound" to overlayCollapsedBound,
      "overlayExpandedBound" to overlayExpandedBound,
      "titleCollapsedBound" to titleCollapsedBound,
      "bodyCollapsedBound" to bodyCollapsedBound,
      "titleExpandedBound" to titleExpandedBound,
      "bodyExpandedBound" to bodyExpandedBound,
      "rootCollapsedBound" to rootCollapsedBound,
      "rootExpandedBound" to rootExpandedBound,
      "contentIntentWrapped" to contentIntentWrapped,
      "openButtonPreserved" to openButtonPreserved,
      "openButtonWrapped" to openButtonWrapped,
      "usedDecoratedStyle" to usedDecoratedStyle
    )
}
