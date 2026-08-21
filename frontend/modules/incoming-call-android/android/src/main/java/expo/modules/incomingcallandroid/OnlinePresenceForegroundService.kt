package expo.modules.incomingcallandroid

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/**
 * Low-importance ongoing notification while Go Online is on so OEM doze is less likely
 * to freeze the process and delay incoming-call FCM.
 */
class OnlinePresenceForegroundService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopPendingInvitePoll()
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      return START_NOT_STICKY
    }
    ensureChannel()
    val extraBase = intent?.getStringExtra(EXTRA_API_BASE)?.trim().orEmpty()
    val extraAuth = intent?.getStringExtra(EXTRA_AUTH)?.trim().orEmpty()
    if (extraBase.isNotEmpty()) apiBase = extraBase.trimEnd('/')
    if (extraAuth.isNotEmpty()) authToken = extraAuth
    restoreCreds(this)
    persistCreds(this)
    startPendingInvitePoll()
    val notification = buildNotification()
    try {
      if (Build.VERSION.SDK_INT >= 34) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
      PresenceNativeWakeLog.append(
        this,
        "native_keep_alive_started",
        mapOf("sdkInt" to Build.VERSION.SDK_INT)
      )
    } catch (e: Exception) {
      try {
        startForeground(NOTIFICATION_ID, notification)
        PresenceNativeWakeLog.append(
          this,
          "native_keep_alive_started_fallback",
          mapOf("error" to (e.message ?: "startForeground"))
        )
      } catch (e2: Exception) {
        PresenceNativeWakeLog.append(
          this,
          "native_keep_alive_start_failed",
          mapOf("error" to (e2.message ?: "startForeground"))
        )
      }
    }
    return START_STICKY
  }

  override fun onDestroy() {
    stopPendingInvitePoll()
    PresenceNativeWakeLog.append(
      this,
      "native_keep_alive_destroyed",
      mapOf(
        "sdkInt" to Build.VERSION.SDK_INT,
        "intentional" to stoppingIntentionally
      )
    )
    super.onDestroy()
    running = false
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = getSystemService(NotificationManager::class.java) ?: return
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return
    val channel =
      NotificationChannel(CHANNEL_ID, "Online for calls", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Shows that you are available to receive Selecto calls"
        setShowBadge(false)
        enableVibration(false)
        setSound(null, null)
      }
    nm.createNotificationChannel(channel)
  }

  private fun buildNotification(): Notification {
    val launch =
      packageManager.getLaunchIntentForPackage(packageName)?.apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
      }
    val contentIntent =
      if (launch != null) {
        val flags =
          PendingIntent.FLAG_UPDATE_CURRENT or
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
        PendingIntent.getActivity(this, 0, launch, flags)
      } else {
        null
      }
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.presence_online)
      .setContentTitle("You are online for calls")
      .setContentText("Keep this on so callers can reach you when Selecto is in the background.")
      .setOngoing(true)
      .setSilent(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setContentIntent(contentIntent)
      .build()
  }

  private fun startPendingInvitePoll() {
    if (pollFuture != null && pollFuture?.isCancelled != true) return
    pollFuture =
      pollExecutor.scheduleWithFixedDelay(
        { pollPendingInviteOnce() },
        400L,
        POLL_MS,
        TimeUnit.MILLISECONDS
      )
  }

  private fun stopPendingInvitePoll() {
    pollFuture?.cancel(false)
    pollFuture = null
  }

  private fun pollPendingInviteOnce() {
    val base = apiBase
    val token = authToken
    if (base.isEmpty() || token.isEmpty()) return
    try {
      val url = URL("$base/calls/incoming-pending")
      val conn = (url.openConnection() as HttpURLConnection).apply {
        requestMethod = "GET"
        connectTimeout = 8_000
        readTimeout = 8_000
        setRequestProperty("Authorization", "Bearer $token")
        setRequestProperty("Accept", "application/json")
      }
      val code = conn.responseCode
      val body =
        (if (code in 200..299) conn.inputStream else conn.errorStream)
          ?.bufferedReader()
          ?.use { it.readText() }
          .orEmpty()
      conn.disconnect()
      if (code !in 200..299) return
      val incoming = JSONObject(body).optJSONObject("incoming") ?: return
      val callId = incoming.optString("callId").trim()
      if (callId.isEmpty() || callId == lastPresentedCallId) return
      val fromId = incoming.optString("fromId").trim()
      val fromType = incoming.optString("fromType", "u").trim().ifEmpty { "u" }
      val peerName = incoming.optString("fromName", "Caller").trim().ifEmpty { "Caller" }
      val peerImage = incoming.optString("fromImage", "")
      val presented =
        IncomingCallKeepAlivePresenter.present(
          applicationContext,
          callId,
          fromId,
          fromType,
          peerName,
          peerImage
        )
      if (presented) lastPresentedCallId = callId
    } catch (_: Exception) {
      // Keep the service alive even if one poll fails.
    }
  }

  companion object {
    const val CHANNEL_ID = "online_for_calls"
    const val NOTIFICATION_ID = 71021
    const val ACTION_STOP = "expo.modules.incomingcallandroid.STOP_ONLINE_PRESENCE"
    const val EXTRA_API_BASE = "apiBase"
    const val EXTRA_AUTH = "authToken"
    private const val PREFS = "selecto_online_keepalive"
    private const val PREF_API = "api_base"
    private const val PREF_AUTH = "auth_token"
    private const val POLL_MS = 4_000L
    @Volatile
    var running: Boolean = false
      private set
    @Volatile
    var stoppingIntentionally: Boolean = false
    @Volatile
    private var apiBase: String = ""
    @Volatile
    private var authToken: String = ""
    @Volatile
    private var lastPresentedCallId: String = ""
    private val pollExecutor = Executors.newSingleThreadScheduledExecutor()
    private var pollFuture: ScheduledFuture<*>? = null

    private fun persistCreds(context: Context) {
      if (apiBase.isEmpty() && authToken.isEmpty()) return
      context.applicationContext
        .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .putString(PREF_API, apiBase)
        .putString(PREF_AUTH, authToken)
        .apply()
    }

    private fun restoreCreds(context: Context) {
      val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      if (apiBase.isEmpty()) apiBase = prefs.getString(PREF_API, "")?.trim().orEmpty()
      if (authToken.isEmpty()) authToken = prefs.getString(PREF_AUTH, "")?.trim().orEmpty()
    }

    private fun clearCreds(context: Context) {
      context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
      apiBase = ""
      authToken = ""
      lastPresentedCallId = ""
    }

    fun start(context: Context, apiBaseUrl: String = "", jwt: String = "") {
      val app = context.applicationContext
      if (apiBaseUrl.isNotBlank()) apiBase = apiBaseUrl.trim().trimEnd('/')
      if (jwt.isNotBlank()) authToken = jwt.trim()
      persistCreds(app)
      val intent = Intent(app, OnlinePresenceForegroundService::class.java).apply {
        putExtra(EXTRA_API_BASE, apiBase)
        putExtra(EXTRA_AUTH, authToken)
      }
      stoppingIntentionally = false
      running = true
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        app.startForegroundService(intent)
      } else {
        app.startService(intent)
      }
    }

    fun stop(context: Context) {
      val app = context.applicationContext
      clearCreds(app)
      stoppingIntentionally = true
      val intent =
        Intent(app, OnlinePresenceForegroundService::class.java).apply { action = ACTION_STOP }
      try {
        app.startService(intent)
      } catch (_: Exception) {
        // ignore
      }
      app.stopService(Intent(app, OnlinePresenceForegroundService::class.java))
      running = false
    }
  }
}
