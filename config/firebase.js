import fs from 'fs';
import {
  cert,
  getApps,
  initializeApp
} from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

let messagingInstance = null;

function resolveProjectId(serviceAccount) {
  const fromEnv = process.env.FIREBASE_PROJECT_ID;
  if (fromEnv && String(fromEnv).trim()) {
    return String(fromEnv).trim();
  }

  const fromFile = serviceAccount?.project_id;
  if (fromFile && String(fromFile).trim()) {
    return String(fromFile).trim();
  }

  throw new Error(
    'FIREBASE_PROJECT_ID environment variable is required (or project_id in the service account JSON)'
  );
}

function loadServiceAccount() {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath || !String(credentialsPath).trim()) {
    throw new Error(
      'GOOGLE_APPLICATION_CREDENTIALS environment variable is required'
    );
  }

  const resolvedPath = String(credentialsPath).trim();
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `Firebase credentials file not found at GOOGLE_APPLICATION_CREDENTIALS=${resolvedPath}`
    );
  }

  try {
    const raw = fs.readFileSync(resolvedPath, 'utf8');
    const serviceAccount = JSON.parse(raw);

    if (!serviceAccount?.client_email || !serviceAccount?.private_key) {
      throw new Error('Service account JSON is missing client_email or private_key');
    }

    return serviceAccount;
  } catch (err) {
    if (err?.code === 'INVALID_SERVICE_ACCOUNT') {
      throw err;
    }
    throw new Error(
      `Unable to read Firebase service account JSON at GOOGLE_APPLICATION_CREDENTIALS=${resolvedPath}: ${err?.message || err}`
    );
  }
}

/**
 * Initialize Firebase Admin SDK once at application startup.
 * Loads the service account JSON from GOOGLE_APPLICATION_CREDENTIALS
 * and initializes with admin.credential.cert(serviceAccount).
 */
export function initializeFirebase() {
  const serviceAccount = loadServiceAccount();
  const projectId = resolveProjectId(serviceAccount);

  if (getApps().length === 0) {
    try {
      initializeApp({
        credential: cert(serviceAccount),
        projectId
      });
    } catch (err) {
      throw new Error(
        `Firebase Admin initialization failed: ${err?.message || err}. ` +
          'Verify GOOGLE_APPLICATION_CREDENTIALS points to a valid service account JSON file.'
      );
    }
  }

  if (!messagingInstance) {
    messagingInstance = getMessaging();
  }

  console.info('Firebase Admin initialized successfully');
  console.info(`Firebase project: ${projectId}`);

  return messagingInstance;
}

/**
 * Returns the shared Firebase Messaging instance.
 * Must be called after initializeFirebase().
 */
export function getFirebaseMessaging() {
  if (!messagingInstance) {
    if (getApps().length === 0) {
      throw new Error(
        'Firebase Admin is not initialized. Call initializeFirebase() at startup.'
      );
    }
    messagingInstance = getMessaging();
  }
  return messagingInstance;
}
