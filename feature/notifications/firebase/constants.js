export const FIREBASE_TEST_ENDPOINT_ENV = 'ENABLE_FIREBASE_TEST_ENDPOINT';

export function isFirebaseTestEndpointEnabled() {
  return process.env[FIREBASE_TEST_ENDPOINT_ENV] === 'true';
}
