import { encryptSecret as encryptSecretCommon, decryptSecret as decryptSecretCommon } from '@digifyhr/common';

const GOOGLE_OPTS = {
  envKey: 'GOOGLE_TOKEN_ENCRYPTION_KEY',
  requiredMessage: 'GOOGLE_TOKEN_ENCRYPTION_KEY is required to store OAuth tokens securely'
};

export function encryptSecret(plaintext) {
  return encryptSecretCommon(plaintext, GOOGLE_OPTS);
}

export function decryptSecret(ciphertext) {
  return decryptSecretCommon(ciphertext, GOOGLE_OPTS);
}
