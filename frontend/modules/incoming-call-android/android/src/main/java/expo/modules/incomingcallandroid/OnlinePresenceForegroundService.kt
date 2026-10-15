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
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/** JS listens for this when the keep-alive gives up and Go Online must be turned off. */
object OnlinePresenceFailureSink {
  @Volatile var emit: ((String) -> Unit)? = null
}

/**
 * Low-importance ongoing notification while Go Online is on so OEM doze is less likely
 * to freeze the process and delay incoming-call FCM.
 * A partial wake lock is held for the whole Go Online session so the 10s heartbeat
 * still runs after the screen turns off.
 */
class OnlinePresenceForegroundService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stoppingIntentionally = true
      stopPendingInvitePoll()
      releasePresenceWakeLock()
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      return START_NOT_STICKY
    }
    ensureChannel()
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
        foregroundStartFailures += 1
        if (foregroundStartFailures >= MAX_FOREGROUND_START_FAILURES) {
          giveUp(GIVE_UP_MESSAGE)
        } else {
          stopSelf()
        }
        return START_NOT_STICKY
      }
    }
    foregroundStartFailures = 0
    refreshPresenceWakeLock()
    val extraBase = intent?.getStringExtra(EXTRA_API_BASE)?.trim().orEmpty()
    val extraAuth = intent?.getStringExtra(EXTRA_AUTH)?.trim().orEmpty()
    if (extraBase.isNotEmpty()) apiBase = extraBase.trimEnd('/')
    if (extraAuth.isNotEmpty()) authToken = extraAuth
    restoreCreds(this)
    persistCreds(this)
    if (lastPollSuccessElapsed == 0L) {
      lastPollSuccessElapsed = SystemClock.elapsedRealtime()
    }
    startPendingInvitePoll()
    return START_STICKY
  }

  override fun onDestroy() {
    val shouldRestart = !stoppingIntentionally && hasSavedCreds(this)
    stopPendingInvitePoll()
    releasePresenceWakeLock()
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
    if (shouldRestart) scheduleRestart(applicationContext)
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

  private enum class PollResult { OK, UNAUTHORIZED, FAILED }

  private fun pollPendingInviteOnce() {
    if (stoppingIntentionally) return
    refreshPresenceWakeLock()
    val first = executePresencePoll()
    if (first == PollResult.OK) {
      notePollSuccess()
      return
    }
    if (stoppingIntentionally) return
    if (first == PollResult.UNAUTHORIZED) {
      giveUp(SESSION_GIVE_UP_MESSAGE)
      return
    }
    try {
      Thread.sleep(1_000)
    } catch (_: InterruptedException) {
      return
    }
    if (stoppingIntentionally) return
    val second = executePresencePoll()
    if (second == PollResult.OK) {
      notePollSuccess()
      return
    }
    if (second == PollResult.UNAUTHORIZED) {
      giveUp(SESSION_GIVE_UP_MESSAGE)
      return
    }
    notePollFailure()
  }

  /** One heartbeat. A 2xx response renews server presence even when no call is waiting. */
  private fun executePresencePoll(): PollResult {
    val base = apiBase
    val token = authToken
    if (base.isEmpty() || token.isEmpty()) return PollResult.FAILED
    var conn: HttpURLConnection? = null
    try {
      conn = (URL("$base/calls/incoming-pending").openConnection() as HttpURLConnection).apply {
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
      if (code == 401) return PollResult.UNAUTHORIZED
      if (code !in 200..299) return PollResult.FAILED
      try {
        val incoming = JSONObject(body).optJSONObject("incoming") ?: return PollResult.OK
        val callId = incoming.optString("callId").trim()
        if (callId.isEmpty() || callId == lastPresentedCallId) return PollResult.OK
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
        // The heartbeat already landed. A bad body must not look like a dead poll.
      }
      return PollResult.OK
    } catch (_: Exception) {
      return PollResult.FAILED
    } finally {
      conn?.disconnect()
    }
  }

  private fun notePollSuccess() {
    lastPollSuccessElapsed = SystemClock.elapsedRealtime()
  }

  private fun notePollFailure() {
    val since = lastPollSuccessElapsed
    if (since == 0L) return
    if (SystemClock.elapsedRealtime() - since >= GIVE_UP_AFTER_MS) {
      giveUp(GIVE_UP_MESSAGE)
    }
  }

  private fun giveUp(message: String) {
    mainHandler.post {
      if (stoppingIntentionally) return@post
      stoppingIntentionally = true
      val base = apiBase
      val token = authToken
      val app = applicationContext
      stopPendingInvitePoll()
      releasePresenceWakeLock()
      clearCreds(app)
      app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(PREF_FAIL_MESSAGE, message).commit()
      PresenceNativeWakeLog.append(app, "native_keep_alive_gave_up", mapOf("message" to message))
      try {
        OnlinePresenceFailureSink.emit?.invoke(message)
      } catch (_: Exception) {
        // JS may be frozen. The saved message is shown the next time the app is open.
      }
      pollExecutor.execute { bestEffortGoOffline(base, token) }
      try {
        stopForeground(STOP_FOREGROUND_REMOVE)
      } catch (_: Exception) {
        // Service may already be leaving the foreground.
      }
      stopSelf()
    }
  }

  private fun bestEffortGoOffline(base: String, token: String) {
    if (base.isEmpty() || token.isEmpty()) return
    var conn: HttpURLConnection? = null
    try {
      conn = (URL("$base/profile/receiver").openConnection() as HttpURLConnection).apply {
        requestMethod = "PATCH"
        connectTimeout = 8_000
        readTimeout = 8_000
        doOutput = true
        setRequestProperty("Authorization", "Bearer $token")
        setRequestProperty("Content-Type", "application/json")
        setRequestProperty("Accept", "application/json")
      }
      conn.outputStream.use { it.write("""{"isAvailable":false}""".toByteArray(Charsets.UTF_8)) }
      conn.responseCode
    } catch (_: Exception) {
      // JS retries the same switch-off when it next runs.
    } finally {
      conn?.disconnect()
    }
  }

  private fun refreshPresenceWakeLock() {
    try {
      val held = wakeLock
      if (held != null && held.isHeld) {
        held.acquire(WAKE_LOCK_MS)
        return
      }
      val pm = getSystemService(PowerManager::class.java) ?: return
      val lock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "selecto:online_presence")
      lock.setReferenceCounted(false)
      lock.acquire(WAKE_LOCK_MS)
      wakeLock = lock
    } catch (e: Exception) {
      PresenceNativeWakeLog.append(
        this,
        "native_keep_alive_wakelock_failed",
        mapOf("error" to (e.message ?: "wakelock"))
      )
    }
  }

  private fun releasePresenceWakeLock() {
    val lock = wakeLock ?: return
    wakeLock = null
    try {
      if (lock.isHeld) lock.release()
    } catch (_: RuntimeException) {
      // Already released.
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
    /** Legacy plaintext key — read once for migration, then removed. */
    private const val PREF_AUTH = "auth_token"
    private const val PREF_AUTH_ENC = "auth_token_enc"
    /**
     * Fallback only (FCM high-priority push is the primary wake). 10s still catches a missed push
     * well inside the server's 30s background ring window, at 40% of the old 4s poll cost.
     */
    private const val POLL_MS = 10_000L
    /** Renewed on every poll. Longer than one doze cycle so the 10s heartbeat still runs screen-off. */
    private const val WAKE_LOCK_MS = 15 * 60 * 1000L
    /** Turn Go Online off before the server's 5 minute lease expires with the switch still on. */
    private const val GIVE_UP_AFTER_MS = 4 * 60 * 1000L
    private const val MAX_FOREGROUND_START_FAILURES = 3
    private const val PREF_FAIL_MESSAGE = "presence_fail_message"
    private const val GIVE_UP_MESSAGE =
      "Selecto could not keep you online in the background, so Go Online was turned off. Turn it on again when you are ready for calls."
    private const val SESSION_GIVE_UP_MESSAGE =
      "Your login expired, so Go Online was turned off. Sign in and turn it on again."
    private val mainHandler = Handler(Looper.getMainLooper())
    @Volatile
    var running: Boolean = false
      private set
    @Volatile
    var stoppingIntentionally: Boolean = false
    @Volatile
    private var wakeLock: PowerManager.WakeLock? = null
    @Volatile
    private var lastPollSuccessElapsed: Long = 0L
    @Volatile
    private var foregroundStartFailures: Int = 0
    @Volatile
    private var restartPosted: Boolean = false
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
      val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      // Drop any legacy plaintext JWT; the token is only stored Keystore-encrypted.
      prefs.edit().putString(PREF_API, apiBase).remove(PREF_AUTH).apply()
      if (authToken.isNotEmpty()) SecureTokenStore.put(prefs, PREF_AUTH_ENC, authToken)
    }

    private fun restoreCreds(context: Context) {
      val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      if (apiBase.isEmpty()) apiBase = prefs.getString(PREF_API, "")?.trim().orEmpty()
      if (authToken.isEmpty()) authToken = SecureTokenStore.get(prefs, PREF_AUTH_ENC, PREF_AUTH)
    }

    /**
     * API base + JWT saved while Go Online is on (JWT decrypted from the Keystore store).
     * Null when Go Online is off / signed out — native callers then skip server calls.
     */
    @Synchronized
    fun readCreds(context: Context): Pair<String, String>? {
      restoreCreds(context)
      val base = apiBase
      val token = authToken
      return if (base.isEmpty() || token.isEmpty()) null else base to token
    }

    /** True when Go Online was on (credentials persisted) — used to resume after reboot/update. */
    fun hasSavedCreds(context: Context): Boolean = readCreds(context) != null

    /** Message saved when heartbeats could not continue. Empty after it is shown once. */
    fun consumeFailureMessage(context: Context): String {
      val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val message = prefs.getString(PREF_FAIL_MESSAGE, "")?.trim().orEmpty()
      if (message.isNotEmpty()) {
        prefs.edit().remove(PREF_FAIL_MESSAGE).apply()
      }
      return message
    }

    private fun scheduleRestart(context: Context) {
      val app = context.applicationContext
      if (restartPosted) return
      restartPosted = true
      mainHandler.postDelayed({
        restartPosted = false
        if (stoppingIntentionally || running) return@postDelayed
        if (!hasSavedCreds(app)) return@postDelayed
        try {
          start(app)
        } catch (e: Exception) {
          PresenceNativeWakeLog.append(
            app,
            "native_keep_alive_restart_failed",
            mapOf("error" to (e.message ?: "restart"))
          )
        }
      }, 3_000L)
    }

    private fun clearCreds(context: Context) {
      val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val failMessage = prefs.getString(PREF_FAIL_MESSAGE, null)
      prefs.edit().clear().apply()
      if (!failMessage.isNullOrBlank()) {
        prefs.edit().putString(PREF_FAIL_MESSAGE, failMessage).apply()
      }
      apiBase = ""
      authToken = ""
      lastPresentedCallId = ""
      lastPollSuccessElapsed = 0L
    }

    fun start(context: Context, apiBaseUrl: String = "", jwt: String = "") {
      val app = context.applicationContext
      val freshStart = apiBaseUrl.isNotBlank() || jwt.isNotBlank()
      if (apiBaseUrl.isNotBlank()) apiBase = apiBaseUrl.trim().trimEnd('/')
      if (jwt.isNotBlank()) authToken = jwt.trim()
      if (freshStart) lastPollSuccessElapsed = 0L
      persistCreds(app)
      // Separate copy for notification Decline — survives stop() while a call is active.
      NativeCallApi.saveCreds(app, apiBase, authToken)
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
