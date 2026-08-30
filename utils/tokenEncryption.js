import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function resolveEncryptionKey() {
  const dedicated = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim();
  if (dedicated) {
    return crypto.createHash('sha256').update(dedicated).digest();
  }

  // Temporary fallback for local/dev only. Prefer GOOGLE_TOKEN_ENCRYPTION_KEY.
  const jwtFallback = process.env.JWT_SECRET?.trim();
  if (jwtFallback && process.env.NODE_ENV !== 'production') {
    console.warn(
      '[tokenEncryption] GOOGLE_TOKEN_ENCRYPTION_KEY is unset; using JWT_SECRET fallback (dev only).'
    );
    return crypto.createHash('sha256').update(jwtFallback).digest();
  }

  throw new Error(
    'GOOGLE_TOKEN_ENCRYPTION_KEY is required to store OAuth tokens securely'
  );
}

/**
 * @param {string|null|undefined} plaintext
 * @returns {string|null}
 */
export function encryptSecret(plaintext) {
  if (plaintext == null || plaintext === '') return null;
  const key = resolveEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/**
 * @param {string|null|undefined} ciphertext
 * @returns {string|null}
 */
export function decryptSecret(ciphertext) {
  if (ciphertext == null || ciphertext === '') return null;
  const key = resolveEncryptionKey();
  const buffer = Buffer.from(String(ciphertext), 'base64');
  if (buffer.length < IV_LENGTH + 16) {
    throw new Error('Encrypted token payload is truncated or invalid');
  }
  const iv = buffer.subarray(0, IV_LENGTH);
  const tag = buffer.subarray(IV_LENGTH, IV_LENGTH + 16);
  const encrypted = buffer.subarray(IV_LENGTH + 16);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}
