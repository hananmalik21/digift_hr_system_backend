import { ValidationError } from '../../../../utils/errors/index.js';
import { parseListPagination } from '../../shared/recViewQueryValidators.js';
import { isBlank } from '../../shared/recValidationUtils.js';
import { parseApplicationGuidParam } from '../../applications/utils/recApplicationValidators.js';
import { parseRequisitionGuidParam } from '../../requisitions/utils/recRequisitionValidators.js';
import { VALID_STAGE_CODES } from '../../applications/utils/recApplicationConstants.js';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  ELIGIBILITY_STATUS_CODES,
  LIVE_SORT_KEYS,
  MATCH_LEVEL_CODES,
  MAX_PAGE_SIZE
} from './recApplicationMatchConstants.js';

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

function parseAllowedCode(raw, allowed, fieldLabel) {
  if (isBlank(raw)) return null;
  const code = String(raw).trim().toUpperCase();
  if (!allowed.includes(code)) {
    throw new ValidationError('Validation failed', [
      `${fieldLabel} must be one of: ${allowed.join(', ')}`
    ]);
  }
  return code;
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

export function parseMatchListPagination(query) {
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

export function parseMatchSortKey(query) {
  const rawSortBy = query?.sort_by ?? query?.sortBy;
  if (isBlank(rawSortBy)) return 'match_score';
  const key = String(rawSortBy).trim().toLowerCase();
  if (!LIVE_SORT_KEYS.includes(key)) {
    throw new ValidationError('Validation failed', [
      `sort_by must be one of: ${LIVE_SORT_KEYS.join(', ')}`
    ]);
  }
  return key;
}

export function parseMatchSortOrder(query) {
  const raw = query?.sort_order ?? query?.sortOrder;
  if (isBlank(raw)) return 'desc';
  const order = String(raw).trim().toLowerCase();
  if (order !== 'asc' && order !== 'desc') {
    throw new ValidationError('Validation failed', ['sort_order must be asc or desc']);
  }
  return order;
}

export function parseMinMatchScore(raw) {
  if (isBlank(raw)) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new ValidationError('Validation failed', ['min_match_score must be a number between 0 and 100']);
  }
  return n;
}

export function parseMatchLevelFilter(raw) {
  return parseAllowedCode(raw, MATCH_LEVEL_CODES, 'match_level');
}

export function parseEligibilityStatusFilter(raw) {
  return parseAllowedCode(raw, ELIGIBILITY_STATUS_CODES, 'eligibility_status');
}

export function parseApplicationStageFilter(raw) {
  return parseAllowedCode(raw, VALID_STAGE_CODES, 'application_stage');
}

export function validateRequisitionGuidEnterprise(requisitionGuidParam, enterpriseId) {
  return {
    requisition_guid: parseMatchRequisitionGuidParam(requisitionGuidParam),
    enterprise_id: requireEnterpriseId(enterpriseId)
  };
}

export function validateApplicationGuidEnterprise(applicationGuidParam, enterpriseId) {
  return {
    application_guid: parseApplicationGuidParam(applicationGuidParam),
    enterprise_id: requireEnterpriseId(enterpriseId)
  };
}
