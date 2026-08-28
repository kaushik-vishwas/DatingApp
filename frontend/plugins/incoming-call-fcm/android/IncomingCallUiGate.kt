package com.selecto.app.fcm

import android.content.Context

/** Mirrors JS `receiverIncomingCallUiEnabled` — callers must never get incoming-call tray UI. */
object IncomingCallUiGate {
  private const val PREFS = "selecto_app_prefs"
  private const val KEY = "receiver_incoming_call_ui_enabled"

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
}
