import { ValidationError } from '../../../../utils/errors/index.js';
import { ensureHex32, normalizeHex32 } from '../../../../utils/guidUtils.js';

function isBlank(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

/**
 * @param {Record<string, unknown>|undefined} query
 * @returns {number}
 */
export function parseEnterpriseIdFromQuery(query) {
  const raw = query?.enterprise_id ?? query?.tenant_id;
  if (isBlank(raw)) {
    throw new ValidationError('Validation failed', ['enterprise_id is required']);
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new ValidationError('Validation failed', ['enterprise_id must be a positive number']);
  }
  return n;
}

/**
 * @param {Record<string, unknown>|undefined} query
 * @returns {{ page: number, limit: number }}
 */
export function parseCandidateListPagination(query) {
  const DEFAULT_PAGE = 1;
  const DEFAULT_LIMIT = 10;
  const MAX_LIMIT = 100;

  let page = DEFAULT_PAGE;
  const rawPage = query?.page;
  if (!isBlank(rawPage)) {
    const p = Number.parseInt(String(rawPage), 10);
    if (!Number.isFinite(p) || !Number.isInteger(p) || p < 1) {
      throw new ValidationError('Validation failed', ['page must be a positive integer']);
    }
    page = p;
  }

  let limit = DEFAULT_LIMIT;
  const rawLimit = query?.page_size ?? query?.pageSize ?? query?.limit;
  if (!isBlank(rawLimit)) {
    const n = Number.parseInt(String(rawLimit), 10);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
      throw new ValidationError('Validation failed', ['page_size must be a positive integer']);
    }
    limit = Math.min(n, MAX_LIMIT);
  }

  return { page, limit };
}

/**
 * @param {unknown} resumeGuidParam
 * @returns {string}
 */
export function parseResumeGuidParam(resumeGuidParam) {
  if (isBlank(resumeGuidParam)) {
    throw new ValidationError('Validation failed', ['resume_guid is required']);
  }
  try {
    return ensureHex32(normalizeHex32(resumeGuidParam));
  } catch {
    throw new ValidationError('Validation failed', ['resume_guid must be a valid 32-character hex GUID']);
  }
}

/**
 * @param {unknown} candidateGuidParam
 * @param {unknown} enterpriseIdQuery
 * @returns {{ candidate_guid: string, enterprise_id: number }}
 */
export function validateCandidateGuidEnterpriseParams(candidateGuidParam, enterpriseIdQuery) {
  const errors = [];
  let candidate_guid = null;
  try {
    candidate_guid = ensureHex32(normalizeHex32(candidateGuidParam));
  } catch {
    errors.push('candidate_guid must be a valid 32-character hex GUID');
  }
  if (isBlank(enterpriseIdQuery)) {
    errors.push('enterprise_id query parameter is required');
  } else {
    const eid = Number(enterpriseIdQuery);
    if (!Number.isFinite(eid) || eid <= 0) {
      errors.push('enterprise_id must be a positive number');
    }
  }
  if (errors.length) {
    throw new ValidationError('Validation failed', errors);
  }
  return {
    candidate_guid,
    enterprise_id: Number(enterpriseIdQuery)
  };
}
