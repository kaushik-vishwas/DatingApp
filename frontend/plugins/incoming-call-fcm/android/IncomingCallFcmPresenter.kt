package com.kaushikvishwas.frontend.fcm

import android.content.Context
import android.graphics.Color
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.notifications.enums.NotificationPriority
import expo.modules.notifications.notifications.model.Notification
import expo.modules.notifications.notifications.model.NotificationContent
import expo.modules.notifications.notifications.model.NotificationRequest
import expo.modules.notifications.service.NotificationsService
import org.json.JSONObject
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.Date

/**
 * Presents a local incoming-call notification with identifier `incoming-{callId}` so taps
 * carry the same extras as JS-scheduled notifications (NotificationForwarderActivity).
 */
object IncomingCallFcmPresenter {
  private const val TYPE_INCOMING = "call_incoming"
  private const val ID_PREFIX = "incoming-"
  private const val DEEP_LINK_PREFIX = "nestham://incoming-call/"

  fun presentIfIncomingCall(context: Context, remoteMessage: RemoteMessage): Boolean {
    val data = remoteMessage.data
    if (data.isNullOrEmpty()) return false

    val type = data["type"]?.trim().orEmpty()
    if (type != TYPE_INCOMING) return false

    val callId = data["callId"]?.trim().orEmpty()
    if (callId.isEmpty()) return false

    val fromId = data["fromId"]?.trim().orEmpty()
    val fromType = data["fromType"]?.trim()?.ifEmpty { "u" } ?: "u"
    val peerName =
      data["peerName"]?.trim()?.takeIf { it.isNotEmpty() }
        ?: data["fromName"]?.trim()?.takeIf { it.isNotEmpty() }
        ?: "Caller"
    val peerImage = data["peerImage"]?.trim() ?: data["fromImage"]?.trim() ?: ""
    val url = data["url"]?.trim()?.takeIf { it.isNotEmpty() }
      ?: buildDeepLink(callId, fromId, fromType, peerName, peerImage)

    val body = JSONObject()
    for ((key, value) in data) {
      body.put(key, value)
    }
    body.put("type", TYPE_INCOMING)
    body.put("callId", callId)
    body.put("fromId", fromId)
    body.put("fromType", fromType)
    body.put("peerName", peerName)
    body.put("peerImage", peerImage)
    body.put("url", url)
    body.put(
      "payload",
      JSONObject()
        .put("type", TYPE_INCOMING)
        .put("callId", callId)
        .put("fromId", fromId)
        .put("fromType", fromType)
        .put("peerName", peerName)
        .put("peerImage", if (peerImage.isEmpty()) JSONObject.NULL else peerImage)
        .put("url", url)
        .toString()
    )

    val content =
      NotificationContent.Builder()
        .setTitle("Incoming call")
        .setText("$peerName is calling you")
        .setBody(body)
        .setPriority(NotificationPriority.MAX)
        .useDefaultSound()
        .setColor(Color.parseColor("#7c3aed"))
        .setAutoDismiss(true)
        .build()

    val identifier = ID_PREFIX + callId
    val request = NotificationRequest(identifier, content, null)
    val notification = Notification(request, Date())

    NotificationsService.present(context.applicationContext, notification)
    return true
  }

  private fun buildDeepLink(
    callId: String,
    fromId: String,
    fromType: String,
    peerName: String,
    peerImage: String
  ): String {
    val enc = StandardCharsets.UTF_8.name()
    val base =
      DEEP_LINK_PREFIX +
        URLEncoder.encode(callId, enc) +
        "?fromId=" +
        URLEncoder.encode(fromId, enc) +
        "&fromType=" +
        URLEncoder.encode(fromType, enc) +
        "&peerName=" +
        URLEncoder.encode(peerName, enc)
    return if (peerImage.isEmpty()) {
      base
    } else {
      base + "&peerImage=" + URLEncoder.encode(peerImage, enc)
    }
  }
}
