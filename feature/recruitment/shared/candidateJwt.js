import jwt from 'jsonwebtoken';

export function resolveCandidateJwtSecret() {
  const secret = process.env.CANDIDATE_JWT_SECRET;
  if (!secret || String(secret).trim().length < 16) return null;
  return String(secret);
}

export function candidateJwtExpiresIn() {
  return process.env.CANDIDATE_JWT_EXPIRES_IN || '7d';
}

/**
 * @param {Record<string, unknown>} payload
 * @returns {string}
 */
export function signCandidateAccessToken(payload) {
  const secret = resolveCandidateJwtSecret();
  if (!secret) {
    throw new Error('CANDIDATE_JWT_SECRET is missing or too short');
  }
  return jwt.sign(
    {
      token_type: 'candidate',
      ...payload
    },
    secret,
    { expiresIn: candidateJwtExpiresIn() }
  );
}
