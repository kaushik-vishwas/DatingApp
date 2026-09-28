package expo.modules.incomingcallandroid

import android.content.Context
import android.util.Log
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.concurrent.Executors

/**
 * Tiny authenticated REST client for native-only call actions (app may be killed / JS frozen).
 *
 * Keeps its own copy of the API base + JWT (saved whenever Go Online starts, cleared only on
 * sign-out) so notification Decline still reaches the server after Go Online paused its own
 * credentials (e.g. during / right after a call). Falls back to the Go Online credentials.
 */
object NativeCallApi {
  private const val TAG = "NativeCallApi"
  private const val TIMEOUT_MS = 8_000
  /** Decline gets one retry — keep both attempts well inside the receiver's goAsync() window. */
  private const val DECLINE_CONNECT_TIMEOUT_MS = 5_000
  private const val DECLINE_RETRY_DELAY_MS = 1_500L
  private const val PREFS = "selecto_native_call_creds"
  private const val PREF_API = "api_base"
  private const val PREF_AUTH_ENC = "auth_token_enc"
  /** Never written — only satisfies SecureTokenStore's legacy-migration parameter. */
  private const val PREF_AUTH_LEGACY = "auth_token"
  private val executor = Executors.newSingleThreadExecutor()

  /** Saves credentials for native call actions (called when Go Online starts with a JWT). */
  fun saveCreds(context: Context, apiBase: String, token: String) {
    val base = apiBase.trim().trimEnd('/')
    val jwt = token.trim()
    if (base.isEmpty() || jwt.isEmpty()) return
    val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    prefs.edit().putString(PREF_API, base).apply()
    SecureTokenStore.put(prefs, PREF_AUTH_ENC, jwt)
  }

  /** Sign-out / account switch: forget the native call credentials. */
  fun clearCreds(context: Context) {
    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
  }

  private fun readCreds(context: Context): Pair<String, String>? {
    val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val base = prefs.getString(PREF_API, "")?.trim().orEmpty()
    val token = SecureTokenStore.get(prefs, PREF_AUTH_ENC, PREF_AUTH_LEGACY)
    if (base.isNotEmpty() && token.isNotEmpty()) return base to token
    return OnlinePresenceForegroundService.readCreds(context)
  }

  /** POST /calls/{callId}/decline — Decline tapped on the native notification. */
  fun declineIncomingCall(context: Context, callId: String, onDone: (() -> Unit)? = null) {
    postCallAction(context, callId, "decline", onDone)
  }

  /** POST /calls/{callId}/ringing — native incoming-call notification is showing. */
  fun acknowledgeRinging(context: Context, callId: String) {
    postCallAction(context, callId, "ringing", null)
  }

  /**
   * POST /calls/{callId}/seen — receiver tapped the incoming-call notification. Sent before JS
   * boots so the server holds the invite through a slow cold start + socket connect.
   */
  fun markIncomingCallSeen(context: Context, callId: String) {
    postCallAction(context, callId, "seen", null)
  }

  private fun postCallAction(context: Context, callId: String, action: String, onDone: (() -> Unit)?) {
    val id = callId.trim()
    val appContext = context.applicationContext
    executor.execute {
      try {
        if (id.isEmpty()) return@execute
        val (base, token) =
          readCreds(appContext) ?: run {
            PresenceNativeWakeLog.append(appContext, "native_call_${action}_skipped", mapOf("callId" to id, "reason" to "no_creds"))
            return@execute
          }
        val isDecline = action == "decline"
        val code =
          try {
            post(base, token, id, action, isDecline)
          } catch (e: IOException) {
            // Network blip right after a Doze wake — the caller keeps ringing unless decline lands.
            if (!isDecline) throw e
            Log.w(TAG, "POST decline failed, retrying callId=$id", e)
            Thread.sleep(DECLINE_RETRY_DELAY_MS)
            post(base, token, id, action, true)
          }
        PresenceNativeWakeLog.append(appContext, "native_call_$action", mapOf("callId" to id, "status" to code))
      } catch (e: Exception) {
        Log.w(TAG, "POST $action failed callId=$id", e)
        PresenceNativeWakeLog.append(
          appContext,
          "native_call_${action}_failed",
          mapOf("callId" to id, "error" to (e.message ?: e.javaClass.simpleName))
        )
      } finally {
        onDone?.invoke()
      }
    }
  }

  private fun post(base: String, token: String, callId: String, action: String, shortConnect: Boolean): Int {
    val path = URLEncoder.encode(callId, StandardCharsets.UTF_8.name())
    val conn = (URL("$base/calls/$path/$action").openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      connectTimeout = if (shortConnect) DECLINE_CONNECT_TIMEOUT_MS else TIMEOUT_MS
      readTimeout = TIMEOUT_MS
      doOutput = true
      setRequestProperty("Authorization", "Bearer $token")
      setRequestProperty("Content-Type", "application/json")
      setRequestProperty("Accept", "application/json")
    }
    try {
      conn.outputStream.use { it.write("{}".toByteArray(Charsets.UTF_8)) }
      return conn.responseCode
    } finally {
      conn.disconnect()
    }
  }
}
