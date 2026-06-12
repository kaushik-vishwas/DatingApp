package expo.modules.incomingcallandroid

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

    AsyncFunction("applyFullScreenIntentAsync") { identifier: String, debugEnabled: Boolean ->
      val context = appContext.reactContext
        ?: return@AsyncFunction mapOf("applied" to false, "failureReason" to "no_context")
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

    Function("startCallWebSocketForegroundService") { callLabel: String ->
      val context = appContext.reactContext ?: return@Function false
      AndroidCallResilience.startCallWebSocketForegroundService(context, callLabel)
    }

    Function("stopCallWebSocketForegroundService") {
      val context = appContext.reactContext ?: return@Function Unit
      AndroidCallResilience.stopCallWebSocketForegroundService(context)
    }

    AsyncFunction("requestIgnoreBatteryOptimizationsAsync") {
      val context = appContext.reactContext
        ?: return@AsyncFunction mapOf("requested" to false, "alreadyIgnored" to false, "unavailable" to true)
      AndroidCallResilience.requestIgnoreBatteryOptimizations(context)
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
