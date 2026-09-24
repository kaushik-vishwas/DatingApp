package com.selecto.app.fcm

import android.content.Context

/** Mirrors JS `receiverIncomingCallUiEnabled` — callers must never get incoming-call tray UI. */
object IncomingCallUiGate {
  private const val PREFS = "selecto_app_prefs"
  private const val KEY = "receiver_incoming_call_ui_enabled"
  private const val IN_CALL_KEY = "in_app_voice_call_active"
  private const val IN_CALL_PID_KEY = "in_app_voice_call_pid"

  fun setReceiverUiEnabled(context: Context, enabled: Boolean) {
    context.applicationContext
      .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(KEY, enabled)
      .apply()
  }

  fun isReceiverUiEnabled(context: Context): Boolean {
    return context.applicationContext
      .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .getBoolean(KEY, false)
  }

  /** Only trusted when set by this same process — a flag left by a killed app is stale. */
  fun isInAppVoiceCallActive(context: Context): Boolean {
    val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    if (!prefs.getBoolean(IN_CALL_KEY, false)) return false
    return prefs.getInt(IN_CALL_PID_KEY, -1) == android.os.Process.myPid()
  }
}
