import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError
} from '../../../../utils/errors/index.js';
import { packageStatusIsSuccess } from '../../shared/oraclePackageUtils.js';
import { addAsApplicantViaPackage } from '../model/recAddAsApplicantModel.js';
import {
  ADD_AS_APPLICANT_SOURCE_CODE,
  ADD_AS_APPLICANT_STAGE_CODE,
  ADD_AS_APPLICANT_STATUS_CODE,
  ADD_AS_APPLICANT_ERROR_MESSAGE,
  ADD_AS_APPLICANT_PACKAGE_ERROR_KINDS,
  ALREADY_APPLIED_CONFLICT_MESSAGE
} from '../utils/recCandidateMatchConstants.js';
import { mapRequisitionHeader } from '../utils/recCandidateMatchMappers.js';
import {
  getRequisitionHeaderFromView,
  listCandidateMatchesFromView
} from '../model/recCandidateMatchViewModel.js';

function isDuplicateApplicantMessage(message) {
  const m = String(message ?? '').trim().toLowerCase();
  if (!m) return false;
  return (
    ADD_AS_APPLICANT_PACKAGE_ERROR_KINDS[String(message ?? '').trim()] === 'conflict' ||
    m.includes('already an applicant') ||
    m.includes('already applied')
  );
}

/**
 * Map Oracle ADD_AS_APPLICANT p_message to HTTP domain errors.
 * Duplicate conflicts always re-check via the package (never trust a prior GET).
 *
 * @param {string|null|undefined} message
 * @param {{ candidate_guid?: string|null, application_guid?: string|null }} [ctx]
 */
export function throwAddAsApplicantPackageError(message, ctx = {}) {
  const m = String(message ?? '').trim();
  if (isDuplicateApplicantMessage(m)) {
    throw new ConflictError(ALREADY_APPLIED_CONFLICT_MESSAGE, null, null, m, {
      candidate_guid: ctx.candidate_guid ?? null,
      application_guid: ctx.application_guid ?? null
    });
  }
  const kind = ADD_AS_APPLICANT_PACKAGE_ERROR_KINDS[m];
  if (kind === 'not_found') throw new NotFoundError(m);
  if (kind === 'validation') throw new ValidationError('Validation failed', [m]);
  throw new AppError(ADD_AS_APPLICANT_ERROR_MESSAGE, 500, 'ADD_AS_APPLICANT_FAILED');
}

/**
 * @param {string} requisitionGuidHex
 * @param {number} enterpriseId
 * @param {Record<string, unknown>|undefined} query
 */
export async function listFindCandidates(requisitionGuidHex, enterpriseId, query) {
  const requisition = await getRequisitionHeaderFromView(requisitionGuidHex, enterpriseId);
  if (!requisition) return { notFound: 'requisition' };

  const { rows, total, page, limit } = await listCandidateMatchesFromView(
    requisitionGuidHex,
    enterpriseId,
    query
  );

  return {
    rows,
    total,
    page,
    limit,
    requisition: mapRequisitionHeader(requisition, requisitionGuidHex),
    summary: { total_matches: total }
  };
}

/**
 * Find Candidates → Add as Applicant via REC.ADD_AS_APPLICANT_PKG.ADD_AS_APPLICANT.
 * Package enforces CAN_ADD_AS_APPLICANT / duplicate rules at write time.
 *
 * @param {string} requisitionGuidHex
 * @param {string} candidateGuidHex
 * @param {number} enterpriseId
 * @param {string} createdBy
 */
export async function addCandidateAsApplicant(
  requisitionGuidHex,
  candidateGuidHex,
  enterpriseId,
  createdBy
) {
  const pkg = await addAsApplicantViaPackage({
    enterprise_id: enterpriseId,
    requisition_guid: requisitionGuidHex,
    candidate_guid: candidateGuidHex,
    created_by: createdBy
  });

  if (!packageStatusIsSuccess(pkg.status)) {
    throwAddAsApplicantPackageError(pkg.message, {
      candidate_guid: candidateGuidHex,
      application_guid: pkg.application_guid
    });
  }

  return {
    application_id: pkg.application_id,
    application_guid: pkg.application_guid,
    application_number: pkg.application_number,
    requisition_guid: requisitionGuidHex,
    candidate_guid: candidateGuidHex,
    source_code: ADD_AS_APPLICANT_SOURCE_CODE,
    current_stage_code: ADD_AS_APPLICANT_STAGE_CODE,
    status_code: ADD_AS_APPLICANT_STATUS_CODE
  };
}
