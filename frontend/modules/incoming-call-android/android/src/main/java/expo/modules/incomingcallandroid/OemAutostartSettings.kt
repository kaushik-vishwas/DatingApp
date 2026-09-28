package expo.modules.incomingcallandroid

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.util.Log

/**
 * Deep links into OEM "Autostart / background start" managers (Xiaomi, OPPO/Realme/OnePlus,
 * Vivo/iQOO). Component names differ across OS versions, so each candidate is resolved and
 * tried in order; callers fall back to text hints when none opens.
 */
object OemAutostartSettings {
  private const val TAG = "OemAutostart"

  private val CANDIDATES =
    listOf(
      // Xiaomi / Redmi / POCO (MIUI, HyperOS)
      "com.miui.securitycenter" to "com.miui.permcenter.autostart.AutoStartManagementActivity",
      // OPPO / Realme / OnePlus (ColorOS)
      "com.coloros.safecenter" to "com.coloros.safecenter.startupapp.StartupAppControlActivity",
      "com.coloros.safecenter" to "com.coloros.safecenter.permission.startup.StartupAppListActivity",
      "com.coloros.safecenter" to "com.coloros.safecenter.startupapp.StartupAppListActivity",
      "com.oppo.safe" to "com.oppo.safe.permission.startup.StartupAppListActivity",
      "com.oneplus.security" to "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity",
      // Vivo / iQOO (Funtouch, OriginOS)
      "com.vivo.permissionmanager" to "com.vivo.permissionmanager.activity.BgStartUpManagerActivity",
      "com.iqoo.secure" to "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager",
      "com.iqoo.secure" to "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity"
    )

  private fun intentFor(pkg: String, cls: String): Intent =
    Intent().apply {
      component = ComponentName(pkg, cls)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }

  private fun isLaunchable(pm: PackageManager, intent: Intent): Boolean {
    val info = pm.resolveActivity(intent, 0)?.activityInfo ?: return false
    return info.exported
  }

  /** True when this device exposes a known, launchable autostart screen. */
  fun isAvailable(context: Context): Boolean {
    val pm = context.packageManager
    return CANDIDATES.any { (pkg, cls) -> isLaunchable(pm, intentFor(pkg, cls)) }
  }

  /** Opens the first working autostart screen; returns its component or null if none opened. */
  fun open(context: Context): String? {
    val pm = context.packageManager
    for ((pkg, cls) in CANDIDATES) {
      val intent = intentFor(pkg, cls)
      if (!isLaunchable(pm, intent)) continue
      try {
        context.startActivity(intent)
        return "$pkg/$cls"
      } catch (e: Exception) {
        Log.w(TAG, "Autostart screen failed $pkg/$cls", e)
      }
    }
    return null
  }
}
