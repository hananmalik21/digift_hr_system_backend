import { AppError, DatabaseError, ValidationError } from '../../../../utils/errors/index.js';
import { formatGuidWithHyphens } from '../../../../utils/guidUtils.js';
import {
  handleMutationError,
  sendPackageResponse
} from '../../shared/recControllerHelpers.js';
import { packageStatusIsSuccess } from '../../shared/oraclePackageUtils.js';
import { mapRecommendationToResultStatus } from './recCandidateInterviewConstants.js';
import {
  findCandidateEnterpriseIdByGuid,
  getCandidateByGuidFromView
} from '../model/recCandidateViewModel.js';

/**
 * @param {string|undefined|null} message
 */
function mapPackageErrorCode(message) {
  const msg = String(message ?? '');
  if (/candidate not found/i.test(msg)) {
    return { httpStatus: 404, code: 'CANDIDATE_NOT_FOUND' };
  }
  if (/interview not found/i.test(msg)) {
    return { httpStatus: 404, code: 'INTERVIEW_NOT_FOUND' };
  }
  if (/already exists|conflict|duplicate/i.test(msg)) {
    return { httpStatus: 409, code: 'CONFLICT' };
  }
  return { httpStatus: 400, code: 'VALIDATION_ERROR' };
}

/**
 * @param {string} candidateGuid
 * @param {number} enterpriseId
 */
export async function assertScheduleCandidateAccessible(candidateGuid, enterpriseId) {
  const candidate = await getCandidateByGuidFromView(candidateGuid, enterpriseId);
  if (candidate) return;

  const ownerEnterpriseId = await findCandidateEnterpriseIdByGuid(candidateGuid);
  if (ownerEnterpriseId != null && ownerEnterpriseId !== Number(enterpriseId)) {
    throw new AppError(
      `Candidate belongs to enterprise ${ownerEnterpriseId}, but your session is scoped to enterprise ${enterpriseId}. Use a candidate from your enterprise or log in with the matching tenant.`,
      404,
      'CANDIDATE_ENTERPRISE_MISMATCH'
    );
  }

  throw new AppError('Candidate not found.', 404, 'CANDIDATE_NOT_FOUND');
}

/**
 * @param {import('express').Response} res
 * @param {ValidationError} err
 */
export function sendInterviewValidationError(res, err) {
  const details = Array.isArray(err?.errors) ? err.errors.filter(Boolean) : [];
  const message = details[0] || err?.message || 'Validation failed';
  return sendPackageResponse(res, 400, {
    success: false,
    code: err?.code ?? 'VALIDATION_ERROR',
    message,
    ...(details.length ? { error_details: { errors: details } } : {})
  });
}

/** @param {import('express').Response} res */
export function sendInterviewNotFoundResponse(res) {
  return sendPackageResponse(res, 404, {
    success: false,
    code: 'INTERVIEW_NOT_FOUND',
    message: 'Interview not found.'
  });
}

/**
 * @param {string|null|undefined} guidHex
 */
function formatInterviewGuid(guidHex) {
  if (guidHex == null || guidHex === '') return null;
  try {
    return formatGuidWithHyphens(guidHex);
  } catch {
    return String(guidHex);
  }
}

/**
 * @param {import('express').Response} res
 * @param {{ status?: string, message?: string, interview_id?: number|null, interview_guid?: string|null }} pkg
 * @param {{ action?: string, interview_guid?: string, recommendation?: string, meeting?: Record<string, unknown>|null }} [options]
 */
export function sendInterviewActionResponse(res, pkg, options = {}) {
  const success = packageStatusIsSuccess(pkg.status);
  const message = pkg.message ?? '';
  const { httpStatus, code } = success
    ? { httpStatus: 200, code: undefined }
    : mapPackageErrorCode(message);

  if (!success) {
    return sendPackageResponse(res, httpStatus, {
      success: false,
      code,
      message: message || 'Request failed.'
    });
  }

  const action = options.action ?? 'action';
  const guidHex = pkg.interview_guid ?? options.interview_guid ?? null;
  const guid = formatInterviewGuid(guidHex);

  /** @type {Record<string, unknown>} */
  let data = {};

  switch (action) {
    case 'schedule':
      data = {
        interview_id: pkg.interview_id ?? null,
        interview_guid: guid,
        status: 'SCHEDULED'
      };
      if (options.meeting) {
        data.meeting = options.meeting;
      }
      break;
    case 'update':
      data = { interview_guid: guid };
      break;
    case 'feedback':
      data = {
        interview_guid: guid,
        status: 'COMPLETED',
        result_status: mapRecommendationToResultStatus(options.recommendation)
      };
      break;
    case 'delete':
      data = {
        interview_guid: guid,
        status: 'CANCELLED'
      };
      break;
    default:
      if (guid) data.interview_guid = guid;
      break;
  }

  return sendPackageResponse(res, 200, {
    success: true,
    code: action === 'schedule' ? 'INTERVIEW_CREATED' : undefined,
    message: message || 'Operation completed successfully.',
    data
  });
}

/**
 * @param {import('express').Response} res
 * @param {() => Promise<unknown>} run
 * @param {string} fallbackMessage
 */
export async function handleInterviewMutation(res, run, fallbackMessage) {
  try {
    return await run();
  } catch (err) {
    if (err instanceof ValidationError) {
      return sendInterviewValidationError(res, err);
    }
    if (err instanceof AppError) {
      return sendPackageResponse(res, err.statusCode ?? 500, {
        success: false,
        code: err.code ?? 'ERROR',
        message: err.message,
        ...(err.technicalMessage && err.technicalMessage !== err.message
          ? { error_details: { detail: err.technicalMessage } }
          : {})
      });
    }
    if (err instanceof DatabaseError) {
      return sendPackageResponse(res, 500, {
        success: false,
        code: 'DATABASE_ERROR',
        message: err.userMessage || fallbackMessage
      });
    }
    return handleMutationError(res, err, fallbackMessage);
  }
}
