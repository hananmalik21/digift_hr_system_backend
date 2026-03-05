import crypto from 'crypto';
import bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 12;
const PASSWORD_LENGTH = 16;
const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*';

/**
 * Generates a cryptographically secure random password.
 * @returns {string} Plain password (e.g. for one-time display to user).
 */
export function generateRandomPassword() {
  const bytes = crypto.randomBytes(PASSWORD_LENGTH);
  let password = '';
  for (let i = 0; i < PASSWORD_LENGTH; i++) {
    password += PASSWORD_CHARS[bytes[i] % PASSWORD_CHARS.length];
  }
  return password;
}

/**
 * Generates a random password and returns both the plain value and bcrypt hash.
 * Use the hash for storage; return the plain password only once (e.g. in API response).
 * @returns {Promise<{ plainPassword: string, passwordHash: string }>}
 */
export async function generatePasswordWithHash() {
  const plainPassword = generateRandomPassword();
  const passwordHash = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
  return { plainPassword, passwordHash };
}

/**
 * Verifies a plain password against a bcrypt hash.
 * @param {string} plainPassword - Plain text password from user input
 * @param {string} passwordHash - Stored bcrypt hash (e.g. from EMPLOYEE_CREDENTIALS.PASSWORD_HASH)
 * @returns {Promise<boolean>} True if password matches
 */
export async function verifyPassword(plainPassword, passwordHash) {
  if (!plainPassword || !passwordHash) return false;
  return bcrypt.compare(plainPassword, passwordHash);
}
