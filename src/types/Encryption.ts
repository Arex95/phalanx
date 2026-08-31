/**
 * Output of `encryptField` — an envelope-encrypted value, ready to drop
 * straight into a JSON request body. See `crypto/encryptField.ts` for why
 * this is three separate hex fields rather than one blob.
 */
export interface EncryptedField {
  /** The AES session key, RSA-OAEP-encrypted with the configured public key. */
  encryptedKey: string;
  /** The AES-GCM IV used for this value — unique per call, not secret. */
  iv: string;
  /** The actual value, AES-GCM-encrypted with the (now-discarded) session key. */
  ciphertext: string;
}

/**
 * The RSA public key `encryptField` encrypts against — see
 * `config/global/encryptionConfig.ts` for why shipping it in the bundle is
 * safe. Lives in `types/` (not local to that config file, unlike e.g.
 * `TokenPathsConfig`) because `PhalanxOptions` also needs it.
 */
export interface EncryptionConfig {
  publicKeyPem: string;
}
