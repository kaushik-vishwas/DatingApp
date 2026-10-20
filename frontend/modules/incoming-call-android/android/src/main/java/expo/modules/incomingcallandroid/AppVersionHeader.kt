package expo.modules.incomingcallandroid

import android.content.Context
import android.os.Build
import java.net.HttpURLConnection

/** Mirrors the JS X-App-Version / X-Device headers so native requests carry the same client info. */
object AppVersionHeader {
  private const val NAME = "X-App-Version"
  private const val DEVICE_NAME = "X-Device"
  private const val DEVICE_MAX_LENGTH = 120

  @Volatile private var cached: String? = null

  private val device: String by lazy {
    fun clean(value: String?): String =
      value.orEmpty().replace(Regex("[^\\x20-\\x7E]"), "").replace(";", " ").replace("=", " ").trim()
    "mfr=${clean(Build.MANUFACTURER)}; model=${clean(Build.MODEL)}; os=${clean(Build.VERSION.RELEASE)}; sdk=${Build.VERSION.SDK_INT}"
      .take(DEVICE_MAX_LENGTH)
  }

  private fun versionCode(context: Context): String? {
    cached?.let { return it }
    return try {
      val info = context.packageManager.getPackageInfo(context.packageName, 0)
      val code =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode
        else @Suppress("DEPRECATION") info.versionCode.toLong()
      code.toString().also { cached = it }
    } catch (_: Exception) {
      null
    }
  }

  fun apply(conn: HttpURLConnection, context: Context) {
    versionCode(context)?.let { conn.setRequestProperty(NAME, it) }
    conn.setRequestProperty(DEVICE_NAME, device)
  }
}
