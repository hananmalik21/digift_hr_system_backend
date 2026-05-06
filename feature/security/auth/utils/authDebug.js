export function authDebugEnabled() {
  const v = process.env.AUTH_DEBUG;
  return v === '1' || v === 'true' || v === 'TRUE';
}

