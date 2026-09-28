package expo.modules.incomingcallandroid

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.telecom.Connection
import android.telecom.ConnectionRequest
import android.telecom.ConnectionService
import android.telecom.DisconnectCause
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import android.util.Log
import androidx.annotation.RequiresApi

/** Self-managed ConnectionService — see [SelectoTelecom] for the ringing-only scope. */
@RequiresApi(Build.VERSION_CODES.O)
class SelectoConnectionService : ConnectionService() {
  override fun onCreateIncomingConnection(
    connectionManagerPhoneAccount: PhoneAccountHandle?,
    request: ConnectionRequest?
  ): Connection {
    val extras = request?.extras
    val callId = extras?.getString(SelectoTelecom.EXTRA_CALL_ID)?.trim().orEmpty()
    if (callId.isEmpty() || SelectoTelecom.consumeEndedBeforeCreate(callId)) {
      return Connection.createFailedConnection(DisconnectCause(DisconnectCause.MISSED))
    }
    val connection =
      SelectoConnection(
        applicationContext,
        callId,
        extras?.getString(SelectoTelecom.EXTRA_OPEN_URL).orEmpty()
      ).apply {
        connectionProperties = Connection.PROPERTY_SELF_MANAGED
        audioModeIsVoip = true
        setAddress(request?.address, TelecomManager.PRESENTATION_ALLOWED)
        setCallerDisplayName(
          extras?.getString(SelectoTelecom.EXTRA_PEER_NAME) ?: "Caller",
          TelecomManager.PRESENTATION_ALLOWED
        )
        setRinging()
      }
    SelectoTelecom.register(callId, connection)
    return connection
  }

  override fun onCreateIncomingConnectionFailed(
    connectionManagerPhoneAccount: PhoneAccountHandle?,
    request: ConnectionRequest?
  ) {
    val callId = request?.extras?.getString(SelectoTelecom.EXTRA_CALL_ID)?.trim().orEmpty()
    Log.w("SelectoTelecom", "Telecom refused incoming connection callId=$callId")
    if (callId.isNotEmpty()) SelectoTelecom.forget(callId)
  }
}

@RequiresApi(Build.VERSION_CODES.O)
class SelectoConnection(
  private val context: Context,
  private val callId: String,
  private val openUrl: String
) : Connection() {
  private var finished = false

  /** Tray notification + ringtone are already posted by the FCM / keep-alive presenter. */
  override fun onShowIncomingCallUi() = Unit

  /** Answer from headset / watch / car: open the app's incoming-call screen (user confirms there). */
  override fun onAnswer() {
    openApp()
    finish(DisconnectCause.LOCAL)
  }

  override fun onAnswer(videoState: Int) = onAnswer()

  /** System reject (headset / watch / car): same as the tray Decline, including the server reject. */
  override fun onReject() {
    DeclinedCallRegistry.markDeclined(context, callId)
    IncomingCallRingtonePlayer.stop(context)
    IncomingCallTrayDismiss.dismissByCallId(context, callId)
    finish(DisconnectCause.REJECTED)
    NativeCallApi.declineIncomingCall(context, callId)
  }

  override fun onSilence() {
    IncomingCallRingtonePlayer.stop(context)
  }

  override fun onDisconnect() = finish(DisconnectCause.LOCAL)

  override fun onAbort() = finish(DisconnectCause.CANCELED)

  fun finish(cause: Int) {
    if (finished) return
    finished = true
    SelectoTelecom.forget(callId)
    try {
      setDisconnected(DisconnectCause(cause))
      destroy()
    } catch (_: Exception) {
      // Telecom already dropped it.
    }
  }

  private fun openApp() {
    if (openUrl.isEmpty()) return
    try {
      val intent =
        Intent(Intent.ACTION_VIEW, Uri.parse(openUrl)).apply {
          setPackage(context.packageName)
          addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK or
              Intent.FLAG_ACTIVITY_CLEAR_TOP or
              Intent.FLAG_ACTIVITY_SINGLE_TOP
          )
        }
      context.startActivity(intent)
    } catch (e: Exception) {
      // Background-start blocked: the tray notification is still there to tap.
      Log.w("SelectoTelecom", "Could not open app on Telecom answer", e)
    }
  }
}
