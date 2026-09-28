package expo.modules.incomingcallandroid

import android.content.ComponentName
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.telecom.DisconnectCause
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import android.util.Log
import androidx.annotation.RequiresApi
import java.util.concurrent.ConcurrentHashMap

/**
 * Self-managed Telecom integration for the RINGING phase of an incoming call.
 *
 * The native tray notification + ringtone stay exactly as before; this additionally tells
 * Android's Telecom stack that a call is ringing (system call state, headset/wear answer and
 * reject, OEM call treatment). The Telecom call is closed as soon as the app takes over
 * (incoming UI opened, accepted, rejected, cancelled) so the active call keeps using the
 * existing in-app audio routing / cellular-hold logic untouched.
 */
object SelectoTelecom {
  private const val TAG = "SelectoTelecom"
  private const val ACCOUNT_ID = "selecto_voice"
  /** Safety net: the tray notification times out at 55s; never leave a ghost Telecom call. */
  private const val MAX_RING_MS = 60_000L

  const val EXTRA_CALL_ID = "selecto_call_id"
  const val EXTRA_PEER_NAME = "selecto_peer_name"
  const val EXTRA_OPEN_URL = "selecto_open_url"

  private val connections = ConcurrentHashMap<String, SelectoConnection>()
  /** Calls reported to Telecom (dedupe FCM + keep-alive) — value = report time. */
  private val reported = ConcurrentHashMap<String, Long>()
  /** Ended before Telecom created the connection — creation must fail instead of ringing. */
  private val endedBeforeCreate = ConcurrentHashMap<String, Long>()
  private val mainHandler = Handler(Looper.getMainLooper())

  private fun handle(context: Context): PhoneAccountHandle =
    PhoneAccountHandle(
      ComponentName(context.applicationContext, SelectoConnectionService::class.java),
      ACCOUNT_ID
    )

  @RequiresApi(Build.VERSION_CODES.O)
  private fun ensurePhoneAccount(context: Context, tm: TelecomManager): PhoneAccountHandle {
    val h = handle(context)
    if (tm.getPhoneAccount(h) == null) {
      val account =
        PhoneAccount.builder(h, "Selecto")
          .setCapabilities(PhoneAccount.CAPABILITY_SELF_MANAGED)
          .addSupportedUriScheme(PhoneAccount.SCHEME_SIP)
          .build()
      tm.registerPhoneAccount(account)
    }
    return h
  }

  /**
   * Reports a ringing call to Telecom. Best-effort: any failure (old Android, OEM Telecom
   * quirks, another call in progress) leaves the existing notification flow unaffected.
   */
  fun reportIncomingCall(context: Context, callId: String, peerName: String, openUrl: String): Boolean {
    val id = callId.trim()
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || id.isEmpty()) return false
    if (reported.putIfAbsent(id, System.currentTimeMillis()) != null) return true
    prune()
    val appContext = context.applicationContext
    return try {
      val tm = appContext.getSystemService(TelecomManager::class.java) ?: return false.also { reported.remove(id) }
      val h = ensurePhoneAccount(appContext, tm)
      if (!tm.isIncomingCallPermitted(h)) {
        Log.i(TAG, "Incoming call not permitted by Telecom (busy) callId=$id")
        reported.remove(id)
        return false
      }
      val extras =
        Bundle().apply {
          putParcelable(
            TelecomManager.EXTRA_INCOMING_CALL_ADDRESS,
            Uri.fromParts(PhoneAccount.SCHEME_SIP, "selecto-$id", null)
          )
          putString(EXTRA_CALL_ID, id)
          putString(EXTRA_PEER_NAME, peerName.ifBlank { "Caller" })
          putString(EXTRA_OPEN_URL, openUrl)
        }
      tm.addNewIncomingCall(h, extras)
      mainHandler.postDelayed({ endCall(id, DisconnectCause.MISSED) }, MAX_RING_MS)
      PresenceNativeWakeLog.append(appContext, "telecom_incoming_reported", mapOf("callId" to id))
      true
    } catch (e: Exception) {
      Log.w(TAG, "addNewIncomingCall failed callId=$id", e)
      reported.remove(id)
      PresenceNativeWakeLog.append(
        appContext,
        "telecom_incoming_failed",
        mapOf("callId" to id, "error" to (e.message ?: e.javaClass.simpleName))
      )
      false
    }
  }

  @RequiresApi(Build.VERSION_CODES.O)
  internal fun register(callId: String, connection: SelectoConnection) {
    connections[callId] = connection
  }

  internal fun consumeEndedBeforeCreate(callId: String): Boolean = endedBeforeCreate.remove(callId) != null

  internal fun forget(callId: String) {
    connections.remove(callId)
  }

  /** Close the Telecom call for [callId] (app took over, accepted/rejected, or server cancelled). */
  fun endCall(callId: String, cause: Int = DisconnectCause.LOCAL) {
    val id = callId.trim()
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || id.isEmpty()) return
    if (!reported.containsKey(id)) return
    mainHandler.post {
      val conn = connections.remove(id)
      if (conn == null) {
        // Telecom has not created it yet — make creation fail instead of ringing.
        if (reported.containsKey(id)) endedBeforeCreate[id] = System.currentTimeMillis()
        return@post
      }
      conn.finish(cause)
    }
  }

  private fun prune() {
    val cutoff = System.currentTimeMillis() - 5 * MAX_RING_MS
    reported.entries.removeIf { it.value < cutoff }
    endedBeforeCreate.entries.removeIf { it.value < cutoff }
  }
}
