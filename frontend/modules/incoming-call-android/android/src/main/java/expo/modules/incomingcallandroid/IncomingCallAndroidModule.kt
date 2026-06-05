package expo.modules.incomingcallandroid

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Samsung incoming-call notification tap fix + cellular hold detection.
 */
class IncomingCallAndroidModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("IncomingCallAndroid")

    Events("onCellularCallStateChanged", "onNotificationTapRelayed")

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
