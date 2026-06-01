import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { ValidationError } from '../../../../utils/errors/index.js';
import { getActingUsername } from '../../../../utils/userContext.js';
import {
  createCandidateViaPackage,
  packageStatusIsSuccess,
  updateCandidateViaPackage
} from '../model/recCandidatesModel.js';
import {
  buildCandidateBodyFromRequest,
  maybeMulterCandidate
} from '../utils/recCandidateMultipart.js';
import {
  parseCandidateGuidParam,
  validateCandidateBody
} from '../utils/recCandidateValidators.js';

const router = express.Router();

function firstValidationMessage(err) {
  const details = Array.isArray(err?.errors) ? err.errors.filter(Boolean) : [];
  return details[0] || err?.message || 'Validation failed';
}

function resolveAuditActor(req, body, field) {
  const fromBody = body?.[field];
  if (fromBody != null && String(fromBody).trim() !== '') return String(fromBody).trim();
  return getActingUsername(req) ?? 'SYSTEM';
}

function sendPackageResponse(res, httpStatus, payload) {
  return res.status(httpStatus).json(payload);
}

function sendValidationError(res, err) {
  return sendPackageResponse(res, 400, {
    success: false,
    status: 'ERROR',
    message: firstValidationMessage(err)
  });
}

function sendCreateCandidateResponse(res, pkg) {
  const success = packageStatusIsSuccess(pkg.status);
  const status = pkg.status ?? (success ? 'SUCCESS' : 'ERROR');
  const message = pkg.message ?? '';
  const httpStatus = success ? 200 : 400;

  return sendPackageResponse(res, httpStatus, {
    success,
    candidate_id: pkg.candidate_id ?? null,
    candidate_guid: pkg.candidate_guid ?? null,
    status,
    message
  });
}

function sendUpdateCandidateResponse(res, pkg) {
  const success = packageStatusIsSuccess(pkg.status);
  const status = pkg.status ?? (success ? 'SUCCESS' : 'ERROR');
  const message = pkg.message ?? '';
  const httpStatus = success ? 200 : 400;

  return sendPackageResponse(res, httpStatus, {
    success,
    status,
    message
  });
}

/**
 * POST /api/rec/candidates
 * Body: application/json or multipart/form-data.
 * Resume optional: field "resume", "file", "attachment", or "document"; or file_content (base64).
 * education_json / experience_json: JSON arrays (or JSON strings in multipart).
 */
router.post(
  '/',
  maybeMulterCandidate,
  asyncHandler(async (req, res) => {
    try {
      const body = buildCandidateBodyFromRequest(req);
      body.created_by = resolveAuditActor(req, body, 'created_by');
      validateCandidateBody(body, { isUpdate: false });

      const pkg = await createCandidateViaPackage(body);
      return sendCreateCandidateResponse(res, pkg);
    } catch (err) {
      if (err instanceof ValidationError) {
        return sendValidationError(res, err);
      }
      return sendPackageResponse(res, 500, {
        success: false,
        status: 'ERROR',
        message: 'Unable to process candidate. Please try again.'
      });
    }
  })
);

/**
 * PUT /api/rec/candidates/:candidate_guid
 * Body: application/json or multipart/form-data.
 * Resume optional: field "resume", "file", "attachment", or "document"; or file_content (base64).
 */
router.put(
  '/:candidate_guid',
  maybeMulterCandidate,
  asyncHandler(async (req, res) => {
    try {
      const candidate_guid = parseCandidateGuidParam(req.params.candidate_guid);
      const body = buildCandidateBodyFromRequest(req, { candidate_guid });
      body.updated_by = resolveAuditActor(req, body, 'updated_by');
      validateCandidateBody(body, { isUpdate: true, candidateGuid: candidate_guid });

      const pkg = await updateCandidateViaPackage(body);
      return sendUpdateCandidateResponse(res, pkg);
    } catch (err) {
      if (err instanceof ValidationError) {
        return sendValidationError(res, err);
      }
      return sendPackageResponse(res, 500, {
        success: false,
        status: 'ERROR',
        message: 'Unable to process candidate. Please try again.'
      });
    }
  })
);

export default router;
