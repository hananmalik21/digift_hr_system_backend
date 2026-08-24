import { ConflictError, NotFoundError, ValidationError } from '../../../../utils/errors/index.js';
import { packageStatusIsSuccess } from '../../shared/oraclePackageUtils.js';
import { applyJobViaPackage } from '../../applications/model/recApplicationsModel.js';
import { APPLY_ERROR_DUPLICATE } from '../../applications/utils/recApplicationConstants.js';
import {
  ALREADY_APPLIED_MESSAGE,
  CANDIDATE_NOT_FOUND_MESSAGE,
  DEFAULT_ADD_SOURCE_CODE,
  POSTING_REQUIRED_MESSAGE
} from '../utils/recCandidateMatchConstants.js';
import { mapRequisitionHeader } from '../utils/recCandidateMatchMappers.js';
import {
  candidateExistsInView,
  findExistingApplication,
  findPostingForRequisition,
  getApplicationStageByGuid,
  getRequisitionHeaderFromView,
  listCandidateMatchesFromView
} from '../model/recCandidateMatchViewModel.js';

function isDuplicateApplyMessage(message) {
  const m = String(message ?? '').trim().toLowerCase();
  return (
    m === String(APPLY_ERROR_DUPLICATE).toLowerCase() ||
    m.includes('already applied') ||
    m.includes('duplicate')
  );
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
 * @param {string} requisitionGuidHex
 * @param {string} candidateGuidHex
 * @param {number} enterpriseId
 * @param {string} actor
 * @param {Record<string, unknown>|undefined} body
 */
export async function addCandidateAsApplicant(
  requisitionGuidHex,
  candidateGuidHex,
  enterpriseId,
  actor,
  body
) {
  const requisition = await getRequisitionHeaderFromView(requisitionGuidHex, enterpriseId);
  if (!requisition) return { notFound: 'requisition' };

  const candidateExists = await candidateExistsInView(candidateGuidHex, enterpriseId);
  if (!candidateExists) return { notFound: 'candidate' };

  const existing = await findExistingApplication(requisitionGuidHex, candidateGuidHex, enterpriseId);
  if (existing?.application_guid) {
    throw new ConflictError(ALREADY_APPLIED_MESSAGE);
  }

  const posting = await findPostingForRequisition(requisitionGuidHex, enterpriseId);
  if (!posting?.posting_guid) {
    throw new ValidationError('Validation failed', [POSTING_REQUIRED_MESSAGE]);
  }

  const source_code = String(body?.source_code ?? DEFAULT_ADD_SOURCE_CODE).trim().toUpperCase();
  const pkg = await applyJobViaPackage(
    {
      enterprise_id: enterpriseId,
      candidate_guid: candidateGuidHex,
      source_code,
      created_by: actor
    },
    posting.posting_guid
  );

  if (!packageStatusIsSuccess(pkg.status)) {
    const message = pkg.message || ALREADY_APPLIED_MESSAGE;
    if (isDuplicateApplyMessage(message)) {
      throw new ConflictError(ALREADY_APPLIED_MESSAGE);
    }
    const lower = String(message).toLowerCase();
    if (lower.includes('does not exist') || lower.includes('not found')) {
      throw new NotFoundError(message);
    }
    throw new ValidationError('Validation failed', [message]);
  }

  const created = pkg.application_guid
    ? await getApplicationStageByGuid(pkg.application_guid, enterpriseId)
    : null;

  return {
    data: {
      candidate_guid: candidateGuidHex,
      requisition_guid: requisitionGuidHex,
      application_guid: pkg.application_guid ?? created?.application_guid ?? null,
      application_stage: created?.application_stage ?? created?.status_code ?? 'APPLIED'
    }
  };
}
