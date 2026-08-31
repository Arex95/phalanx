import type { EncryptionConfig } from "@/types";

/**
 * The RSA public key used by `encryptField` — unrelated to auth. This value
 * is *meant* to be embedded in the client bundle: it can only encrypt, not
 * decrypt, so shipping it is safe by design. This is the opposite situation
 * from the old `appKey` (a symmetric key, which had to stay secret and
 * therefore never should have been in the bundle at all).
 *
 * PEM format (SPKI), e.g. the output of:
 *   openssl rsa -pubout -in private.pem -out public.pem
 */
let publicKeyPem: string | null = null;

export function configEncryption(config: EncryptionConfig): void {
  publicKeyPem = config.publicKeyPem;
}

export function getEncryptionPublicKeyPem(): string {
  if (publicKeyPem === null) {
    throw new Error(
      "[phalanx] No encryption public key configured. Call configEncryption({ publicKeyPem }) before using encryptField()."
    );
  }
  return publicKeyPem;
}
