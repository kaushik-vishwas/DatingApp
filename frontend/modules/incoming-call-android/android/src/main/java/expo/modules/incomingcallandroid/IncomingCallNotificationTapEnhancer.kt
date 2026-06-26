package expo.modules.incomingcallandroid

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

data class EnhanceTapResult(
  val applied: Boolean,
  val failureReason: String?,
  val notificationTag: String,
  val notificationId: Int,
  val overlayCollapsedBound: Boolean,
  val overlayExpandedBound: Boolean,
  val titleCollapsedBound: Boolean,
  val bodyCollapsedBound: Boolean,
  val titleExpandedBound: Boolean,
  val bodyExpandedBound: Boolean,
  val rootCollapsedBound: Boolean,
  val rootExpandedBound: Boolean,
  val contentIntentWrapped: Boolean,
  val openButtonPreserved: Boolean,
  val openButtonWrapped: Boolean,
  val usedDecoratedStyle: Boolean
)

/**
 * Samsung (One UI) expanded notifications often ignore title/body taps outside action buttons.
 * Re-posts with full-area invisible overlays wired to the same intent as Open, plus per-region
 * tap logging via [IncomingCallNotificationTapRelayReceiver].
 */
object IncomingCallNotificationTapEnhancer {
  private const val SLOT_OVERLAY_COLLAPSED = 11
  private const val SLOT_TITLE_COLLAPSED = 12
  private const val SLOT_BODY_COLLAPSED = 13
  private const val SLOT_ROOT_COLLAPSED = 14
  private const val SLOT_CONTENT_COLLAPSED = 15
  private const val SLOT_OVERLAY_EXPANDED = 21
  private const val SLOT_TITLE_EXPANDED = 22
  private const val SLOT_BODY_EXPANDED = 23
  private const val SLOT_ROOT_EXPANDED = 24
  private const val SLOT_CONTENT_EXPANDED = 25
  private const val SLOT_CONTENT_INTENT = 31
  private const val SLOT_OPEN_BUTTON = 32

  fun enhancePostedNotification(
    context: Context,
    tag: String,
    debugEnabled: Boolean
  ): EnhanceTapResult {
    if (tag.isEmpty()) {
      return failure(tag, -1, "empty_tag", debugEnabled, context)
    }

    val notificationManager =
      context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val status =
      notificationManager.activeNotifications?.firstOrNull { it.tag == tag }
        ?: return failure(tag, -1, "notification_not_active", debugEnabled, context)

    val existing = status.notification
    val tapIntent = resolveTapPendingIntent(existing)
    if (tapIntent == null) {
      return failure(tag, status.id, "no_tap_intent", debugEnabled, context)
    }

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
    val expanded = RemoteViews(pkg, R.layout.incoming_call_notification_expanded)

    collapsed.setTextViewText(R.id.incoming_call_notification_title, title)
    collapsed.setTextViewText(R.id.incoming_call_notification_body, text)
    expanded.setTextViewText(R.id.incoming_call_notification_title, title)
    expanded.setTextViewText(R.id.incoming_call_notification_body, text)

    val overlayCollapsedBound =
      bindTapTarget(
        context,
        collapsed,
        R.id.incoming_call_notification_tap_overlay,
        tapIntent,
        tag,
        "overlay_collapsed",
        SLOT_OVERLAY_COLLAPSED,
        debugEnabled
      )
    val titleCollapsedBound =
      bindTapTarget(
        context,
        collapsed,
        R.id.incoming_call_notification_title,
        tapIntent,
        tag,
        "title_collapsed",
        SLOT_TITLE_COLLAPSED,
        debugEnabled
      )
    val bodyCollapsedBound =
      bindTapTarget(
        context,
        collapsed,
        R.id.incoming_call_notification_body,
        tapIntent,
        tag,
        "body_collapsed",
        SLOT_BODY_COLLAPSED,
        debugEnabled
      )
    val rootCollapsedBound =
      bindTapTarget(
        context,
        collapsed,
        R.id.incoming_call_notification_root,
        tapIntent,
        tag,
        "root_collapsed",
        SLOT_ROOT_COLLAPSED,
        debugEnabled
      )

    val overlayExpandedBound =
      bindTapTarget(
        context,
        expanded,
        R.id.incoming_call_notification_tap_overlay,
        tapIntent,
        tag,
        "overlay_expanded",
        SLOT_OVERLAY_EXPANDED,
        debugEnabled
      )
    val titleExpandedBound =
      bindTapTarget(
        context,
        expanded,
        R.id.incoming_call_notification_title,
        tapIntent,
        tag,
        "title_expanded",
        SLOT_TITLE_EXPANDED,
        debugEnabled
      )
    val bodyExpandedBound =
      bindTapTarget(
        context,
        expanded,
        R.id.incoming_call_notification_body,
        tapIntent,
        tag,
        "body_expanded",
        SLOT_BODY_EXPANDED,
        debugEnabled
      )
    val rootExpandedBound =
      bindTapTarget(
        context,
        expanded,
        R.id.incoming_call_notification_root,
        tapIntent,
        tag,
        "root_expanded",
        SLOT_ROOT_EXPANDED,
        debugEnabled
      )

    val contentCollapsedBound =
      bindTapTarget(
        context,
        collapsed,
        R.id.incoming_call_notification_content,
        tapIntent,
        tag,
        "content_collapsed",
        SLOT_CONTENT_COLLAPSED,
        debugEnabled
      )
    val contentExpandedBound =
      bindTapTarget(
        context,
        expanded,
        R.id.incoming_call_notification_content,
        tapIntent,
        tag,
        "content_expanded",
        SLOT_CONTENT_EXPANDED,
        debugEnabled
      )

    val contentIntent =
      if (debugEnabled) {
        wrapRelayIntent(
          context,
          tapIntent,
          tag,
          "content_intent",
          SLOT_CONTENT_INTENT,
          debugEnabled
        )
      } else {
        tapIntent
      }

    val builder = NotificationCompat.Builder(context, channelId)
    applySmallIcon(builder, existing)
    applyIncomingCallAlert(builder, existing, context)
    builder
      .setContentTitle(title)
      .setContentText(text)
      .setContentIntent(contentIntent)
      .setCustomContentView(collapsed)
      .setCustomBigContentView(expanded)
      .setCustomHeadsUpContentView(collapsed)
      .setAutoCancel(NotificationCompat.getAutoCancel(existing))
      .setOngoing(NotificationCompat.getOngoing(existing))
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOnlyAlertOnce(false)
      .setFullScreenIntent(contentIntent, true)

    val actionCopy = copyActions(builder, existing, context, tag, debugEnabled)

    copyExtras(builder, existing)

    NotificationManagerCompat.from(context).notify(tag, status.id, builder.build())

    val result =
      EnhanceTapResult(
        applied = true,
        failureReason = null,
        notificationTag = tag,
        notificationId = status.id,
        overlayCollapsedBound = overlayCollapsedBound,
        overlayExpandedBound = overlayExpandedBound,
        titleCollapsedBound = titleCollapsedBound,
        bodyCollapsedBound = bodyCollapsedBound,
        titleExpandedBound = titleExpandedBound,
        bodyExpandedBound = bodyExpandedBound,
        rootCollapsedBound = rootCollapsedBound,
        rootExpandedBound = rootExpandedBound,
        contentIntentWrapped = contentIntent != null,
        openButtonPreserved = actionCopy.preserved,
        openButtonWrapped = actionCopy.wrapped,
        usedDecoratedStyle = false
      )

    IncomingCallNotificationTapLogger.log(
      context,
      "native.tap_enhance_applied",
      result.toLogMap(),
      debugEnabled
    )

    return result
  }

  private fun failure(
    tag: String,
    id: Int,
    reason: String,
    debugEnabled: Boolean,
    context: Context
  ): EnhanceTapResult {
    val result =
      EnhanceTapResult(
        applied = false,
        failureReason = reason,
        notificationTag = tag,
        notificationId = id,
        overlayCollapsedBound = false,
        overlayExpandedBound = false,
        titleCollapsedBound = false,
        bodyCollapsedBound = false,
        titleExpandedBound = false,
        bodyExpandedBound = false,
        rootCollapsedBound = false,
        rootExpandedBound = false,
        contentIntentWrapped = false,
        openButtonPreserved = false,
        openButtonWrapped = false,
        usedDecoratedStyle = false
      )
    IncomingCallNotificationTapLogger.log(
      context,
      "native.tap_enhance_failed",
      result.toLogMap(),
      debugEnabled
    )
    return result
  }

  private fun bindTapTarget(
    context: Context,
    remoteViews: RemoteViews,
    viewId: Int,
    original: PendingIntent,
    tag: String,
    tapSource: String,
    slot: Int,
    debugEnabled: Boolean
  ): Boolean {
    val target =
      if (debugEnabled) {
        wrapRelayIntent(context, original, tag, tapSource, slot, debugEnabled)
      } else {
        original
      } ?: return false
    return try {
      remoteViews.setOnClickPendingIntent(viewId, target)
      true
    } catch (_: Exception) {
      false
    }
  }

  private fun wrapRelayIntent(
    context: Context,
    original: PendingIntent,
    tag: String,
    tapSource: String,
    slot: Int,
    debugEnabled: Boolean
  ): PendingIntent? {
    return try {
      val token = IncomingCallNotificationTapRelayRegistry.store(original)
      val relay =
        Intent(context, IncomingCallNotificationTapRelayReceiver::class.java).apply {
          action = IncomingCallNotificationTapRelayReceiver.ACTION_RELAY
          `package` = context.packageName
          putExtra(IncomingCallNotificationTapRelayReceiver.EXTRA_TAP_SOURCE, tapSource)
          putExtra(IncomingCallNotificationTapRelayReceiver.EXTRA_NOTIFICATION_TAG, tag)
          putExtra(IncomingCallNotificationTapRelayReceiver.EXTRA_RELAY_TOKEN, token)
          putExtra(IncomingCallNotificationTapRelayReceiver.EXTRA_DEBUG_ENABLED, debugEnabled)
        }
      PendingIntent.getBroadcast(
        context,
        requestCode(tag, slot),
        relay,
        pendingFlags()
      )
    } catch (_: Exception) {
      null
    }
  }

  private data class ActionCopyResult(val preserved: Boolean, val wrapped: Boolean)

  private fun copyActions(
    builder: NotificationCompat.Builder,
    existing: Notification,
    context: Context,
    tag: String,
    debugEnabled: Boolean
  ): ActionCopyResult {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.KITKAT) {
      return ActionCopyResult(preserved = false, wrapped = false)
    }
    var preserved = false
    var wrapped = false
    existing.actions?.forEach { action ->
      val actionIntent = action.actionIntent ?: return@forEach
      preserved = true
      val actionTarget =
        if (debugEnabled) {
          wrapRelayIntent(
            context,
            actionIntent,
            tag,
            "open_button",
            SLOT_OPEN_BUTTON,
            debugEnabled
          )
        } else {
          actionIntent
        }
      if (debugEnabled && actionTarget != null && actionTarget !== actionIntent) {
        wrapped = true
      }
      builder.addAction(
        NotificationCompat.Action.Builder(
          action.icon,
          action.title,
          actionTarget ?: actionIntent
        ).build()
      )
    }
    return ActionCopyResult(preserved = preserved, wrapped = wrapped)
  }

  /**
   * Shade compact-row taps use [Notification.contentIntent]; the Open button uses the action
   * [PendingIntent]. Expo wires only the action with notification extras — prefer it so tray
   * taps (without expanding) open the incoming-call flow like Open.
   */
  private fun resolveTapPendingIntent(notification: Notification): PendingIntent? {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
      notification.actions?.firstOrNull { it.actionIntent != null }?.actionIntent?.let {
        return it
      }
    }
    return notification.contentIntent
  }

  private fun applySmallIcon(builder: NotificationCompat.Builder, existing: Notification) {
    builder.setSmallIcon(existing.icon)
  }

  private fun resolveIncomingCallRingtoneUri(context: Context): Uri? {
    val pkg = context.packageName
    val res = context.resources
    val candidates =
      listOf(
        "receiver_ringtone",
        "receiver_ringtone_mp3",
      )
    for (name in candidates) {
      val id = res.getIdentifier(name, "raw", pkg)
      if (id != 0) {
        return Uri.parse("${ContentResolver.SCHEME_ANDROID_RESOURCE}://$pkg/$id")
      }
    }
    return null
  }

  private fun applyIncomingCallAlert(
    builder: NotificationCompat.Builder,
    existing: Notification,
    context: Context
  ) {
    val sound = existing.sound ?: resolveIncomingCallRingtoneUri(context)
    if (sound != null) {
      @Suppress("DEPRECATION")
      builder.setSound(sound, AudioManager.STREAM_RING)
    }
    builder.setVibrate(longArrayOf(0, 280, 200, 280))
    builder.setDefaults(0)
  }

  private fun copyExtras(builder: NotificationCompat.Builder, existing: Notification) {
    val extras = existing.extras ?: return
    builder.setExtras(android.os.Bundle(extras))
  }

  private fun requestCode(tag: String, slot: Int): Int {
    return (tag.hashCode() and 0x7fff) * 37 + slot
  }

  private fun pendingFlags(): Int {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    } else {
      @Suppress("DEPRECATION")
      PendingIntent.FLAG_UPDATE_CURRENT
    }
  }

  private fun EnhanceTapResult.toLogMap(): Map<String, Any?> =
    mapOf(
      "applied" to applied,
      "failureReason" to failureReason,
      "notificationTag" to notificationTag,
      "notificationId" to notificationId,
      "overlayCollapsedBound" to overlayCollapsedBound,
      "overlayExpandedBound" to overlayExpandedBound,
      "titleCollapsedBound" to titleCollapsedBound,
      "bodyCollapsedBound" to bodyCollapsedBound,
      "titleExpandedBound" to titleExpandedBound,
      "bodyExpandedBound" to bodyExpandedBound,
      "rootCollapsedBound" to rootCollapsedBound,
      "rootExpandedBound" to rootExpandedBound,
      "contentIntentWrapped" to contentIntentWrapped,
      "openButtonPreserved" to openButtonPreserved,
      "openButtonWrapped" to openButtonWrapped,
      "usedDecoratedStyle" to usedDecoratedStyle
    )
}
