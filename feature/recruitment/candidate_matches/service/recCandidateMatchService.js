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
  ADD_AS_APPLICANT_PACKAGE_ERROR_KINDS
} from '../utils/recCandidateMatchConstants.js';
import { mapRequisitionHeader } from '../utils/recCandidateMatchMappers.js';
import {
  getRequisitionHeaderFromView,
  listCandidateMatchesFromView
} from '../model/recCandidateMatchViewModel.js';

/**
 * Map Oracle ADD_AS_APPLICANT p_message to HTTP domain errors.
 * Known package messages are returned unchanged. Unknown text → generic 500
 * (never expose raw Oracle / SQL detail).
 *
 * Business rules live only in the package — Node does not look up postings
 * or re-validate requisition state.
 *
 * @param {string|null|undefined} message
 */
export function throwAddAsApplicantPackageError(message) {
  const m = String(message ?? '').trim();
  const kind = ADD_AS_APPLICANT_PACKAGE_ERROR_KINDS[m];
  if (kind === 'conflict') throw new ConflictError(m);
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
 * Does not look up posting_guid — the package finds the active posting.
 * source_code is always HR_SYSTEM (package-side); created_by must be the authenticated user.
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
    throwAddAsApplicantPackageError(pkg.message);
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
