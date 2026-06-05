package expo.modules.incomingcallandroid

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Re-posts incoming-call tray notifications so the title/body region and expanded
 * panel share the same tap [PendingIntent] as the Open action (Samsung M31 fix).
 *
 * Also exposes cellular call detection for in-app "On hold" while on a carrier call.
 */
class IncomingCallAndroidModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("IncomingCallAndroid")

    Events("onCellularCallStateChanged")

    AsyncFunction("applyFullScreenIntentAsync") { identifier: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      IncomingCallNotificationTapEnhancer.enhancePostedNotification(
        context,
        identifier.trim()
      )
    }

    Function("startCellularCallHoldWatch") {
      val context = appContext.reactContext ?: return@Function false
      CellularCallHoldWatcher.start(context) { active ->
        sendEvent(
          "onCellularCallStateChanged",
          mapOf("active" to active)
        )
      }
      true
    }

    Function("stopCellularCallHoldWatch") {
      CellularCallHoldWatcher.stop()
    }
  }
}
