import { ensureModelsLoaded, shouldPrewarmFaceModels } from './faceProcess.js';

export async function prewarmFaceModels() {
  if (!shouldPrewarmFaceModels()) {
    return;
  }

  try {
    await ensureModelsLoaded();
  } catch (error) {
    // Do not block server boot if model files are not present yet.
    // Face endpoints will still fail fast until models are added.
    console.warn('[face-prewarm] Skipped model prewarm:', error.message);
  }
}
