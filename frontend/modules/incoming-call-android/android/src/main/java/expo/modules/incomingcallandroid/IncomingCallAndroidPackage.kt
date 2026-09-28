package expo.modules.incomingcallandroid

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import expo.modules.core.interfaces.Package
import expo.modules.core.interfaces.ReactActivityLifecycleListener

/** Autolinked by Expo: hooks MainActivity before JS loads (incoming call over the lock screen). */
class IncomingCallAndroidPackage : Package {
  override fun createReactActivityLifecycleListeners(
    activityContext: Context?
  ): List<ReactActivityLifecycleListener> = listOf(IncomingCallActivityListener())
}

private class IncomingCallActivityListener : ReactActivityLifecycleListener {
  override fun onCreate(activity: Activity, savedInstanceState: Bundle?) {
    CallLockScreen.bind(activity)
    if (CallLockScreen.isIncomingCallIntent(activity.intent)) {
      CallLockScreen.setEnabled(activity, true)
      // Recreated activity (rotation / process restore) replays an old intent — not a fresh tap.
      if (savedInstanceState == null) markSeen(activity, activity.intent)
    }
  }

  override fun onNewIntent(intent: Intent): Boolean {
    if (CallLockScreen.isIncomingCallIntent(intent)) {
      CallLockScreen.setEnabled(null, true)
      CallLockScreen.currentActivity()?.let { markSeen(it, intent) }
    }
    return false
  }

  /** Tell the server the receiver is opening the call now (JS + socket may take seconds). */
  private fun markSeen(context: Context, intent: Intent?) {
    val callId = CallLockScreen.incomingCallId(intent)
    if (callId.isNotEmpty()) NativeCallApi.markIncomingCallSeen(context, callId)
  }
}
