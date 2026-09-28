package expo.modules.incomingcallandroid

import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Stores secrets in SharedPreferences encrypted with an AES-256-GCM key held in the
 * Android Keystore (the key never leaves the Keystore; prefs only hold IV + ciphertext).
 */
object SecureTokenStore {
  private const val KEYSTORE = "AndroidKeyStore"
  private const val KEY_ALIAS = "selecto_keepalive_token_key"
  private const val TRANSFORMATION = "AES/GCM/NoPadding"
  private const val IV_BYTES = 12
  private const val TAG_BITS = 128

  @Synchronized
  private fun getOrCreateKey(): SecretKey {
    val ks = KeyStore.getInstance(KEYSTORE).apply { load(null) }
    (ks.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
    generator.init(
      KeyGenParameterSpec.Builder(
        KEY_ALIAS,
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
      )
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build()
    )
    return generator.generateKey()
  }

  private fun encrypt(plain: String): String {
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
    val iv = cipher.iv
    val sealed = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
    return Base64.encodeToString(iv + sealed, Base64.NO_WRAP)
  }

  private fun decrypt(encoded: String): String {
    val bytes = Base64.decode(encoded, Base64.NO_WRAP)
    require(bytes.size > IV_BYTES) { "ciphertext too short" }
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(
      Cipher.DECRYPT_MODE,
      getOrCreateKey(),
      GCMParameterSpec(TAG_BITS, bytes, 0, IV_BYTES)
    )
    return String(cipher.doFinal(bytes, IV_BYTES, bytes.size - IV_BYTES), Charsets.UTF_8)
  }

  /** Encrypts and stores [value]. Never falls back to plaintext; returns false on failure. */
  fun put(prefs: SharedPreferences, encKey: String, value: String): Boolean {
    return try {
      prefs.edit().putString(encKey, encrypt(value)).apply()
      true
    } catch (_: Exception) {
      prefs.edit().remove(encKey).apply()
      false
    }
  }

  /**
   * Reads the encrypted value. If only a legacy plaintext value exists under [legacyKey],
   * it is encrypted into [encKey] and the plaintext copy is removed (one-time migration).
   */
  fun get(prefs: SharedPreferences, encKey: String, legacyKey: String): String {
    val legacy = prefs.getString(legacyKey, null)?.trim().orEmpty()
    if (legacy.isNotEmpty()) {
      put(prefs, encKey, legacy)
      prefs.edit().remove(legacyKey).apply()
      return legacy
    }
    val encoded = prefs.getString(encKey, null)?.trim().orEmpty()
    if (encoded.isEmpty()) return ""
    return try {
      decrypt(encoded).trim()
    } catch (_: Exception) {
      // Key lost (e.g. prefs restored from backup onto another device) — drop unreadable blob.
      prefs.edit().remove(encKey).apply()
      ""
    }
  }
}
