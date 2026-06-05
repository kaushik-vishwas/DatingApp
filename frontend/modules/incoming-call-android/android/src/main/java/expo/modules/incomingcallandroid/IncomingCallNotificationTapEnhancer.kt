package expo.modules.incomingcallandroid

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * Samsung (and some OEM) expanded notifications treat title/body as non-clickable while
 * action buttons work. Re-posts with [RemoteViews] roots wired to the same [PendingIntent]
 * as [Notification.contentIntent] / the Open action, without removing actions.
 */
object IncomingCallNotificationTapEnhancer {
  fun enhancePostedNotification(context: Context, tag: String): Boolean {
    if (tag.isEmpty()) return false

    val notificationManager =
      context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val status =
      notificationManager.activeNotifications?.firstOrNull { it.tag == tag } ?: return false

    val existing = status.notification
    val tapIntent = resolveTapPendingIntent(existing) ?: return false

    val channelId =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        existing.channelId ?: "incoming_calls"
      } else {
        "incoming_calls"
      }

    val title =
      NotificationCompat.getContentTitle(existing)?.toString() ?: "Incoming call"
    val text = NotificationCompat.getContentText(existing)?.toString() ?: ""
    val pkg = context.packageName

    val collapsed = RemoteViews(pkg, R.layout.incoming_call_notification_content)
    bindClickableContent(collapsed, title, text, tapIntent)

    val expanded = RemoteViews(pkg, R.layout.incoming_call_notification_expanded)
    bindClickableContent(expanded, title, text, tapIntent)

    val builder = NotificationCompat.Builder(context, channelId)
    applySmallIcon(builder, existing)
    builder
      .setContentTitle(title)
      .setContentText(text)
      .setContentIntent(tapIntent)
      .setCustomContentView(collapsed)
      .setCustomBigContentView(expanded)
      .setStyle(NotificationCompat.DecoratedCustomViewStyle())
      .setAutoCancel(NotificationCompat.getAutoCancel(existing))
      .setOngoing(NotificationCompat.getOngoing(existing))
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOnlyAlertOnce(true)
      .setFullScreenIntent(tapIntent, true)

    copyActions(builder, existing)
    copyExtras(builder, existing)

    NotificationManagerCompat.from(context).notify(tag, status.id, builder.build())
    return true
  }

  private fun bindClickableContent(
    remoteViews: RemoteViews,
    title: String,
    text: String,
    tapIntent: PendingIntent
  ) {
    remoteViews.setTextViewText(R.id.incoming_call_notification_title, title)
    remoteViews.setTextViewText(R.id.incoming_call_notification_body, text)
    remoteViews.setOnClickPendingIntent(R.id.incoming_call_notification_root, tapIntent)
  }

  private fun resolveTapPendingIntent(notification: Notification): PendingIntent? {
    notification.contentIntent?.let { return it }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
      notification.actions?.firstOrNull { it.actionIntent != null }?.actionIntent?.let {
        return it
      }
    }
    return null
  }

  private fun applySmallIcon(builder: NotificationCompat.Builder, existing: Notification) {
    builder.setSmallIcon(existing.icon)
  }

  private fun copyActions(builder: NotificationCompat.Builder, existing: Notification) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.KITKAT) return
    existing.actions?.forEach { action ->
      if (action.actionIntent == null) return@forEach
      builder.addAction(
        NotificationCompat.Action.Builder(action.icon, action.title, action.actionIntent).build()
      )
    }
  }

  private fun copyExtras(builder: NotificationCompat.Builder, existing: Notification) {
    val extras = existing.extras ?: return
    val copy = android.os.Bundle(extras)
    builder.setExtras(copy)
  }
}
