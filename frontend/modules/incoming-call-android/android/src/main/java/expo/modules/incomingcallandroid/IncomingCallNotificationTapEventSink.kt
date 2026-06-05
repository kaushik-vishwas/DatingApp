package expo.modules.incomingcallandroid

object IncomingCallNotificationTapEventSink {
  var emit: (Map<String, Any?>) -> Unit = {}

  fun emit(payload: Map<String, Any?>) {
    try {
      emit.invoke(payload)
    } catch (_: Exception) {
      // ignore
    }
  }
}
