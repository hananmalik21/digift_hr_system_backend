import path from 'path';
import { fileURLToPath } from 'url';
import * as faceapi from 'face-api.js';
import canvas from 'canvas';

const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_MODELS_PATH = path.resolve(__dirname, '../public/face-models');

let modelsLoaded = false;
let loadingPromise = null;

function getModelsPath() {
  return process.env.FACE_MODELS_PATH || DEFAULT_MODELS_PATH;
}

function getDetectorInputSize() {
  const parsed = Number.parseInt(process.env.FACE_DETECTOR_INPUT_SIZE || '', 10);
  // tinyFaceDetector supports typical sizes: 128, 160, 224, 320, 416, 512, 608
  if ([128, 160, 224, 320, 416, 512, 608].includes(parsed)) {
    return parsed;
  }
  // Faster default for CPU workloads.
  return 224;
}

function getDetectorScoreThreshold() {
  const parsed = Number.parseFloat(process.env.FACE_DETECTOR_SCORE_THRESHOLD || '');
  if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
    return parsed;
  }
  return 0.5;
}

function getMaxImageEdge() {
  const parsed = Number.parseInt(process.env.FACE_IMAGE_MAX_EDGE || '', 10);
  if (Number.isInteger(parsed) && parsed >= 224 && parsed <= 1280) {
    return parsed;
  }
  // Faster default while preserving accuracy reasonably well.
  return 480;
}

export async function ensureModelsLoaded() {
  if (modelsLoaded) {
    return;
  }

  if (!loadingPromise) {
    const modelPath = getModelsPath();
    loadingPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromDisk(modelPath),
      faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath),
      faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath)
    ]).then(() => {
      modelsLoaded = true;
    });
  }

  return loadingPromise;
}

export async function getFaceDescriptor(imageInput) {
  await ensureModelsLoaded();

  const img = await canvas.loadImage(imageInput);
  let inputForDetection = img;

  // Downscale very large images before inference to reduce CPU time.
  const maxEdge = getMaxImageEdge();
  const largestEdge = Math.max(img.width, img.height);
  if (largestEdge > maxEdge) {
    const scale = maxEdge / largestEdge;
    const targetWidth = Math.max(1, Math.round(img.width * scale));
    const targetHeight = Math.max(1, Math.round(img.height * scale));
    const resizedCanvas = canvas.createCanvas(targetWidth, targetHeight);
    const ctx = resizedCanvas.getContext('2d');
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
    inputForDetection = resizedCanvas;
  }

  const detection = await faceapi
    .detectSingleFace(
      inputForDetection,
      new faceapi.TinyFaceDetectorOptions({
        inputSize: getDetectorInputSize(),
        scoreThreshold: getDetectorScoreThreshold()
      })
    )
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) {
    throw new Error('No face detected.');
  }

  return Array.from(detection.descriptor);
}

export function compareFaceDescriptors(descriptor1, descriptor2, threshold = 0.5) {
  if (!Array.isArray(descriptor1) || !Array.isArray(descriptor2)) {
    throw new Error('Face descriptors must be arrays.');
  }

  if (descriptor1.length !== descriptor2.length) {
    throw new Error('Face descriptor lengths do not match.');
  }

  const distance = Math.sqrt(
    descriptor1.reduce((sum, value, index) => {
      const delta = value - descriptor2[index];
      return sum + (delta * delta);
    }, 0)
  );

  return {
    isMatched: distance <= threshold,
    distance
  };
}

export function shouldPrewarmFaceModels() {
  const value = process.env.FACE_MODELS_PREWARM;
  if (value == null) {
    return true;
  }
  const normalized = String(value).trim().toLowerCase();
  return normalized !== 'false' && normalized !== '0';
}
