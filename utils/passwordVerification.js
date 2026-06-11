import argon2 from 'argon2';
import bcrypt from 'bcrypt';

const HASH_PREFIX_ARGON2 = '$argon2';
const HASH_PREFIX_BCRYPT = '$2';

function toHashString(val) {
  if (val == null) return '';
  if (Buffer.isBuffer(val)) return val.toString('utf8').trim();
  if (val instanceof Uint8Array) return Buffer.from(val).toString('utf8').trim();
  return String(val).trim();
}

/**
 * Verify a plain password against a stored Argon2id or bcrypt hash.
 * Hashing on create/update stays in Node; verification stays in Node because
 * Oracle PL/SQL does not natively verify Argon2.
 *
 * @param {string} plainPassword
 * @param {unknown} passwordHash
 * @returns {Promise<boolean>}
 */
export async function verifyUserPassword(plainPassword, passwordHash) {
  if (!plainPassword || !passwordHash) return false;
  const hash = toHashString(passwordHash);
  const plain = String(plainPassword);
  if (!hash) return false;

  if (hash.startsWith(HASH_PREFIX_ARGON2) || hash.includes('argon2')) {
    return argon2.verify(hash, plain);
  }
  if (hash.startsWith(HASH_PREFIX_BCRYPT)) {
    return bcrypt.compare(plain, hash);
  }

  return false;
}
