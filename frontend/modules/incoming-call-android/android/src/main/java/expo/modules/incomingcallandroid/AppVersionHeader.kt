package expo.modules.incomingcallandroid

import android.content.Context
import android.os.Build
import java.net.HttpURLConnection

/** Mirrors the JS X-App-Version header so native requests pass the server's version gate. */
object AppVersionHeader {
  private const val NAME = "X-App-Version"

  @Volatile private var cached: String? = null

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
  }
}
