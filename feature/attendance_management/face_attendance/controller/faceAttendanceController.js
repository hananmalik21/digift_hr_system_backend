import express from 'express';
import multer from 'multer';
import moment from 'moment-timezone';
import FaceAttendanceRepository from '../repository/faceAttendanceRepository.js';
import canvas from 'canvas';
import { getFaceDescriptor } from '../../../../utils/faceProcess.js';
import { sendCreated, sendSuccess } from '../../../../utils/response.js';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  ValidationError,
  ForbiddenError
} from '../../../../utils/errors/index.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      cb(new ValidationError(`${file.fieldname} must be an image upload`));
      return;
    }
    cb(null, true);
  }
});

const router = express.Router();

function parseLocation(currentLocation) {
  if (!currentLocation) {
    return { lat: null, lng: null };
  }

  let parsed;
  try {
    parsed = typeof currentLocation === 'string'
      ? JSON.parse(currentLocation)
      : currentLocation;
  } catch (_) {
    throw new ValidationError('currentLocation must be valid JSON string');
  }

  const lat = parsed?.lat ?? null;
  const lng = parsed?.lng ?? null;

  if (lat != null && !Number.isFinite(Number(lat))) {
    throw new ValidationError('currentLocation.lat must be numeric');
  }
  if (lng != null && !Number.isFinite(Number(lng))) {
    throw new ValidationError('currentLocation.lng must be numeric');
  }

  return {
    lat: lat == null ? null : Number(lat),
    lng: lng == null ? null : Number(lng)
  };
}

function resolveTimezone(userTimezone) {
  if (userTimezone && moment.tz.zone(userTimezone)) {
    return userTimezone;
  }
  return 'Asia/Kuwait';
}

function toBase64(buf) {
  if (!buf) return null;
  return Buffer.from(buf).toString('base64');
}

async function optimizeImageForDb(buffer) {
  if (!buffer) return null;
  try {
    const img = await canvas.loadImage(buffer);
    const maxEdge = 224;
    const largestEdge = Math.max(img.width, img.height);
    const scale = largestEdge > maxEdge ? (maxEdge / largestEdge) : 1;
    const targetWidth = Math.max(1, Math.round(img.width * scale));
    const targetHeight = Math.max(1, Math.round(img.height * scale));
    const cnv = canvas.createCanvas(targetWidth, targetHeight);
    const ctx = cnv.getContext('2d');
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
    return cnv.toBuffer('image/jpeg', { quality: 0.45 });
  } catch (_) {
    return buffer;
  }
}

const registerUploadFields = upload.fields([
  { name: 'profileImage', maxCount: 1 },
  { name: 'faceImage', maxCount: 1 },
  // Accept common typo variants from API clients (lowercase L instead of uppercase I).
  { name: 'profilelmage', maxCount: 1 },
  { name: 'facelmage', maxCount: 1 }
]);

const registerUserHandler = asyncHandler(async (req, res) => {
  const tenantId = req.body?.tenantId == null || req.body.tenantId === '' ? null : Number(req.body.tenantId);
  const userGuid = req.body?.userGuid ? String(req.body.userGuid).trim() : null;
  const profileImageFile = req.files?.profileImage?.[0] || req.files?.profilelmage?.[0];
  const faceImageFile = req.files?.faceImage?.[0] || req.files?.facelmage?.[0];

  if (!profileImageFile || !faceImageFile) {
    throw new ValidationError('profileImage and faceImage are required');
  }
  if (tenantId != null && !Number.isFinite(tenantId)) {
    throw new ValidationError('tenantId must be numeric when provided');
  }
  if (!tenantId) {
    throw new ValidationError('tenantId is required');
  }
  if (!userGuid) {
    throw new ValidationError('userGuid is required');
  }

  const descriptorPromise = getFaceDescriptor(faceImageFile.buffer);
  const optimizedImagesPromise = Promise.all([
    optimizeImageForDb(profileImageFile.buffer),
    optimizeImageForDb(faceImageFile.buffer)
  ]);
  const [descriptor, [profileBuf, faceBuf]] = await Promise.all([descriptorPromise, optimizedImagesPromise]);
  const faceArrayJson = JSON.stringify(descriptor);
  const profileImageData = toBase64(profileBuf);
  const capturedImageData = toBase64(faceBuf);

  const registered = await FaceAttendanceRepository.registerUserFaceViaPackage({
    tenantId,
    userGuid,
    profileImageData,
    capturedImageData,
    faceArrayJson
  });

  sendCreated(res, {
    message: 'Face profile registered successfully',
    data: {
      userId: registered.USER_ID,
      tenantId: registered.TENANT_ID ?? tenantId,
      userGuid: registered.USER_GUID || userGuid || null,
      email: registered.EMAIL_ADDRESS,
      username: registered.USERNAME,
      profileImageStoredInDb: Boolean(profileImageData),
      capturedImageStoredInDb: Boolean(capturedImageData)
    }
  });
});

router.post(
  '/',
  registerUploadFields,
  registerUserHandler
);

router.post(
  '/markAttendance',
  upload.fields([
    { name: 'faceImage', maxCount: 1 },
    // Accept common typo variant.
    { name: 'facelmage', maxCount: 1 }
  ]),
  asyncHandler(async (req, res) => {
    const email = String(req.body?.email || '').trim();
    const tenantId = req.body?.tenantId == null || req.body.tenantId === '' ? null : Number(req.body.tenantId);
    const status = String(req.body?.status || '').trim();
    const userGuid = req.body?.userGuid ? String(req.body.userGuid).trim() : null;
    const faceImageFile = req.files?.faceImage?.[0] || req.files?.facelmage?.[0];
    const threshold = Number.isFinite(Number(process.env.FACE_MATCH_THRESHOLD))
      ? Number(process.env.FACE_MATCH_THRESHOLD)
      : 0.5;

    if (!email) {
      throw new ValidationError('email is required');
    }
    if (!faceImageFile) {
      throw new ValidationError('faceImage is required');
    }
    if (!['checkIn', 'checkOut'].includes(status)) {
      throw new ValidationError('status must be checkIn or checkOut');
    }
    if (tenantId != null && !Number.isFinite(tenantId)) {
      throw new ValidationError('tenantId must be numeric when provided');
    }

    const { lat, lng } = parseLocation(req.body?.currentLocation);
    const geoRadius = req.body?.geoRadius == null || req.body.geoRadius === ''
      ? null
      : Number(req.body.geoRadius);
    if (geoRadius != null && !Number.isFinite(geoRadius)) {
      throw new ValidationError('geoRadius must be numeric when provided');
    }

    const liveDescriptor = await getFaceDescriptor(faceImageFile.buffer);
    const attendanceResult = await FaceAttendanceRepository.markFaceAttendanceViaPackage({
      email,
      tenantId,
      userGuid,
      liveFaceArrayJson: JSON.stringify(liveDescriptor),
      threshold,
      status,
      locationLat: lat,
      locationLng: lng,
      geoRadius
    });

    if (!attendanceResult.MATCHED) {
      throw new ForbiddenError('Face mismatch. Attendance not allowed');
    }

    const timezone = resolveTimezone(attendanceResult.TIMEZONE_CODE);

    sendSuccess(res, {
      message: 'Attendance marked successfully',
      data: {
        user: {
          userId: attendanceResult.USER_ID,
          tenantId: attendanceResult.TENANT_ID ?? tenantId,
          userGuid: attendanceResult.USER_GUID || userGuid || null,
          username: attendanceResult.USERNAME,
          email: attendanceResult.EMAIL_ADDRESS,
          timezone
        }
      }
    });
  })
);

export default router;
