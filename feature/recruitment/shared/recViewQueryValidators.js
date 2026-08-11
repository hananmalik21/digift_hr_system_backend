import { ValidationError } from '../../../utils/errors/index.js';
import { isBlank } from './recValidationUtils.js';
import { resolveRequestEnterpriseId } from '../../../utils/requestEnterprise.js';

/**
 * @param {Record<string, unknown>|undefined} query
 * @param {import('express').Request} [req] - When provided, hostname / JWT enterprise wins
 * @returns {number}
 */
export function parseEnterpriseIdFromQuery(query, req) {
  if (req) {
    return resolveRequestEnterpriseId(req, {
      clientRaw: query?.enterprise_id ?? query?.tenant_id,
      required: true,
      fieldLabel: 'enterprise_id'
    });
  }

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
export function parseListPagination(query) {
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
