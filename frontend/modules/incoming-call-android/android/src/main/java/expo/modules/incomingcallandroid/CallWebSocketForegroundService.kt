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
import androidx.core.content.ContextCompat

/**
 * Keeps the process eligible for background network work during in-app voice calls (API 26+).
 * Uses FOREGROUND_SERVICE_TYPE_DATA_SYNC on API 34+ where the type is available.
 */
class CallWebSocketForegroundService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (Build.VERSION.SDK_INT < MIN_FOREGROUND_SERVICE_API) {
      stopSelf()
      return START_NOT_STICKY
    }

    when (intent?.action) {
      ACTION_STOP -> {
        stopForegroundCompat()
        stopSelf()
        return START_NOT_STICKY
      }
      ACTION_START, null -> {
        val label =
          intent?.getStringExtra(EXTRA_CALL_LABEL)?.trim().orEmpty().ifEmpty { "Voice call" }
        ensureChannel()
        val notification = buildNotification(label)
        startForegroundWithType(notification)
        return START_STICKY
      }
      else -> return START_NOT_STICKY
    }
  }

  private fun startForegroundWithType(notification: Notification) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
      )
      return
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun stopForegroundCompat() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java) ?: return
    val channel =
      NotificationChannel(
        CHANNEL_ID,
        "Call connection",
        NotificationManager.IMPORTANCE_LOW
      ).apply {
        description = "Maintains call signaling during voice calls"
        setShowBadge(false)
      }
    manager.createNotificationChannel(channel)
  }

  private fun buildNotification(callLabel: String): Notification {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val pendingIntent =
      PendingIntent.getActivity(
        this,
        0,
        launchIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )

    val builder =
      NotificationCompat.Builder(this, CHANNEL_ID)
        .setContentTitle("Call in progress")
        .setContentText(callLabel)
        .setSmallIcon(android.R.drawable.stat_sys_phone_call)
        .setOngoing(true)
        .setCategory(NotificationCompat.CATEGORY_CALL)
        .setContentIntent(pendingIntent)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      builder.setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
    }

    return builder.build()
  }

  companion object {
    private const val MIN_FOREGROUND_SERVICE_API = Build.VERSION_CODES.O // API 26
    private const val CHANNEL_ID = "call_websocket_sync"
    private const val NOTIFICATION_ID = 712_241_001
    private const val ACTION_START =
      "expo.modules.incomingcallandroid.action.START_CALL_WEBSOCKET_FG"
    private const val ACTION_STOP =
      "expo.modules.incomingcallandroid.action.STOP_CALL_WEBSOCKET_FG"
    private const val EXTRA_CALL_LABEL = "call_label"

    fun start(context: Context, callLabel: String) {
      if (Build.VERSION.SDK_INT < MIN_FOREGROUND_SERVICE_API) return
      val intent =
        Intent(context, CallWebSocketForegroundService::class.java).apply {
          action = ACTION_START
          putExtra(EXTRA_CALL_LABEL, callLabel)
        }
      ContextCompat.startForegroundService(context, intent)
    }

    fun stop(context: Context) {
      if (Build.VERSION.SDK_INT < MIN_FOREGROUND_SERVICE_API) return
      val intent =
        Intent(context, CallWebSocketForegroundService::class.java).apply {
          action = ACTION_STOP
        }
      context.startService(intent)
    }
  }
}
