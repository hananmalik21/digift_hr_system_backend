import { ValidationError } from '../../../../utils/errors/index.js';
import { parseListPagination } from '../../shared/recViewQueryValidators.js';
import { isBlank } from '../../shared/recValidationUtils.js';
import { parseCandidateGuidParam } from '../../candidates/utils/recCandidateValidators.js';
import { parseRequisitionGuidParam } from '../../requisitions/utils/recRequisitionValidators.js';
import { parseOptionalYnFilter } from '../../job_postings/utils/recJobPostingViewValidators.js';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT_BY,
  DEFAULT_SORT_ORDER,
  MAX_PAGE_SIZE,
  SORT_COLUMNS,
  SORT_KEYS
} from './recCandidateMatchConstants.js';

const REQUISITION_GUID_MESSAGES = {
  requiredMessage: 'requisition_guid is required',
  invalidMessage: 'requisition_guid must be a valid 32-character hex GUID'
};

function requireEnterpriseId(enterpriseId) {
  if (enterpriseId == null || !Number.isFinite(Number(enterpriseId)) || Number(enterpriseId) <= 0) {
    throw new ValidationError('Validation failed', ['enterprise_id is required']);
  }
  return Number(enterpriseId);
}

function parseMatchRequisitionGuidParam(value) {
  if (isBlank(value)) {
    throw new ValidationError('Validation failed', [REQUISITION_GUID_MESSAGES.requiredMessage]);
  }
  try {
    return parseRequisitionGuidParam(value);
  } catch {
    throw new ValidationError('Validation failed', [REQUISITION_GUID_MESSAGES.invalidMessage]);
  }
}

export function parseFindCandidatesPagination(query) {
  const raw = { ...(query || {}) };
  if (isBlank(raw.page_size) && isBlank(raw.pageSize) && isBlank(raw.limit)) {
    raw.page_size = DEFAULT_PAGE_SIZE;
  }
  const { page, limit } = parseListPagination(raw);
  return {
    page: page || DEFAULT_PAGE,
    limit: Math.min(limit, MAX_PAGE_SIZE)
  };
}

export function parseFindCandidatesSortKey(query) {
  const rawSortBy = query?.sort_by ?? query?.sortBy;
  if (isBlank(rawSortBy)) return DEFAULT_SORT_BY;
  const key = String(rawSortBy).trim().toLowerCase();
  if (!SORT_COLUMNS[key]) {
    throw new ValidationError('Validation failed', [`sort_by must be one of: ${SORT_KEYS.join(', ')}`]);
  }
  return key;
}

export function parseFindCandidatesSortOrder(query) {
  const raw = query?.sort_order ?? query?.sortOrder;
  if (isBlank(raw)) return DEFAULT_SORT_ORDER;
  const order = String(raw).trim().toLowerCase();
  if (order !== 'asc' && order !== 'desc') {
    throw new ValidationError('Validation failed', ['sort_order must be asc or desc']);
  }
  return order;
}

function parseScore0to100(raw, fieldName) {
  if (isBlank(raw)) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new ValidationError('Validation failed', [`${fieldName} must be a number between 0 and 100`]);
  }
  return n;
}

export function parseMinMatchScore(raw) {
  return parseScore0to100(raw, 'min_match_score');
}

export function parseMinAvailabilityScore(raw) {
  return parseScore0to100(raw, 'min_availability_score');
}

export function parseOptionalUpperCode(raw) {
  if (isBlank(raw)) return null;
  return String(raw).trim().toUpperCase();
}

export function parseWillingToRelocateFilter(raw) {
  return parseOptionalYnFilter(raw, 'willing_to_relocate');
}

export function parseFindCandidatesSortSql(query) {
  const key = parseFindCandidatesSortKey(query);
  const order = parseFindCandidatesSortOrder(query).toUpperCase();
  const column = SORT_COLUMNS[key];
  return `ORDER BY ${column} ${order} NULLS LAST, v.TITLE_MATCH_SCORE DESC NULLS LAST, v.YEARS_EXPERIENCE DESC NULLS LAST, v.CANDIDATE_ID DESC`;
}

export function validateRequisitionGuidEnterprise(requisitionGuidParam, enterpriseId) {
  return {
    requisition_guid: parseMatchRequisitionGuidParam(requisitionGuidParam),
    enterprise_id: requireEnterpriseId(enterpriseId)
  };
}

export function validateRequisitionCandidateEnterprise(
  requisitionGuidParam,
  candidateGuidParam,
  enterpriseId
) {
  return {
    requisition_guid: parseMatchRequisitionGuidParam(requisitionGuidParam),
    candidate_guid: parseCandidateGuidParam(candidateGuidParam),
    enterprise_id: requireEnterpriseId(enterpriseId)
  };
}

/**
 * Validate POST /requisitions/:requisition_guid/applicants body + URL.
 * Does not accept created_by or source_code from the client.
 *
 * @param {string} requisitionGuidParam
 * @param {Record<string, unknown>|undefined} body
 * @param {number|null|undefined} resolvedEnterpriseId — from hostname/JWT/body via resolveRequestEnterpriseId
 */
export function validateAddAsApplicantRequest(requisitionGuidParam, body, resolvedEnterpriseId) {
  const b = body && typeof body === 'object' ? body : {};
  const enterpriseRaw = b.enterprise_id ?? b.enterpriseId;
  if (enterpriseRaw == null || String(enterpriseRaw).trim() === '') {
    throw new ValidationError('Validation failed', ['enterprise_id is required']);
  }
  const enterpriseNum = Number(enterpriseRaw);
  if (!Number.isFinite(enterpriseNum) || enterpriseNum <= 0) {
    throw new ValidationError('Validation failed', ['enterprise_id must be numeric']);
  }

  const candidateRaw = b.candidate_guid ?? b.candidateGuid;
  if (isBlank(candidateRaw)) {
    throw new ValidationError('Validation failed', ['candidate_guid is required']);
  }

  let candidate_guid;
  try {
    candidate_guid = parseCandidateGuidParam(candidateRaw);
  } catch {
    throw new ValidationError('Validation failed', [
      'candidate_guid must be a valid 32-character hex GUID'
    ]);
  }

  // Prefer tenant-resolved enterprise (hostname/JWT match); body value already validated as numeric.
  return {
    requisition_guid: parseMatchRequisitionGuidParam(requisitionGuidParam),
    candidate_guid,
    enterprise_id: requireEnterpriseId(resolvedEnterpriseId ?? enterpriseNum)
  };
}

export { parseOptionalUpperCode as parseMatchLevelFilter };
export { parseOptionalUpperCode as parseAvailabilityCodeFilter };
