/**
 * Query parsing for GET /api/comp/adjustments (tenant + optional filters + pagination).
 */

import { parseRequiredEnterpriseId } from '../../salary_structures/utils/parseSalaryStructureEnterpriseId.js';
import { AdjustmentListValidationError } from './adjustmentListErrors.js';

export const ADJUSTMENT_LIST_DEFAULT_PAGE = 1;
export const ADJUSTMENT_LIST_DEFAULT_LIMIT = 10;
export const ADJUSTMENT_LIST_MAX_LIMIT = 100;

/**
 * @param {unknown} raw
 * @param {string} fieldName
 * @returns {number|undefined}
 */
function parsePositiveInt(raw, fieldName) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return undefined;
  }
  const n = parseInt(String(raw), 10);
  if (Number.isNaN(n) || n < 1) {
    throw new AdjustmentListValidationError(`${fieldName} must be a positive integer`);
  }
  return n;
}

/**
 * @param {object} query - req.query
 * @returns {{
 *   enterprise_id: number,
 *   adjustment_id?: number,
 *   employee_id?: number,
 *   plan_id?: number,
 *   status?: string,
 *   page: number,
 *   limit: number
 * }}
 */
export function parseAdjustmentListQuery(query) {
  let enterprise_id;
  try {
    enterprise_id = parseRequiredEnterpriseId(query);
  } catch (e) {
    throw new AdjustmentListValidationError(e.message || 'enterprise_id is invalid');
  }

  const page = parsePositiveInt(query?.page, 'page') ?? ADJUSTMENT_LIST_DEFAULT_PAGE;
  const limit = Math.min(
    ADJUSTMENT_LIST_MAX_LIMIT,
    parsePositiveInt(query?.limit, 'limit') ?? ADJUSTMENT_LIST_DEFAULT_LIMIT
  );

  const adjustment_id = parsePositiveInt(query?.adjustment_id, 'adjustment_id');
  const employee_id = parsePositiveInt(query?.employee_id, 'employee_id');
  const plan_id = parsePositiveInt(query?.plan_id, 'plan_id');

  let status;
  if (query?.status !== undefined && query?.status !== null && String(query.status).trim() !== '') {
    status = String(query.status).trim();
  }

  return {
    enterprise_id,
    adjustment_id,
    employee_id,
    plan_id,
    status,
    page,
    limit
  };
}
