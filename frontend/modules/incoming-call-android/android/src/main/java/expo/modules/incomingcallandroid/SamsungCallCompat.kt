package expo.modules.incomingcallandroid

import android.os.Build

/**
 * Samsung One UI 6+ (Android 14 / API 34+) needs aggressive GSM hold handling during VoIP calls.
 */
object SamsungCallCompat {
  private val cachedOneUiVersion: Int by lazy { readOneUiVersion() }

  fun isSamsung(): Boolean =
    Build.MANUFACTURER.equals("samsung", ignoreCase = true)

  fun getOneUiVersion(): Int = cachedOneUiVersion

  /**
   * True on Samsung devices running One UI 6.0+ (typically API 34+) or Android 15+ Samsung builds.
   */
  fun isSamsungOneUi6OrNewer(): Boolean {
    if (!isSamsung()) return false
    if (Build.VERSION.SDK_INT >= 35) return true
    if (Build.VERSION.SDK_INT >= 34 && cachedOneUiVersion >= 60000) return true
    // Fallback: very new Samsung API levels without readable One UI property.
    if (Build.VERSION.SDK_INT >= 36) return true
    return false
  }

  fun deviceProfile(): Map<String, Any?> =
    mapOf(
      "isSamsung" to isSamsung(),
      "oneUiVersion" to cachedOneUiVersion,
      "isSamsungOneUi6OrNewer" to isSamsungOneUi6OrNewer(),
      "sdkInt" to Build.VERSION.SDK_INT,
      "manufacturer" to Build.MANUFACTURER,
      "model" to Build.MODEL
    )

  private fun readOneUiVersion(): Int {
    if (!isSamsung()) return 0
    return try {
      val clazz = Class.forName("android.os.SystemProperties")
      val get = clazz.getMethod("get", String::class.java)
      val raw = get.invoke(null, "ro.build.version.oneui") as? String
      raw?.trim()?.toIntOrNull() ?: 0
    } catch (_: Throwable) {
      0
    }
  }
}
