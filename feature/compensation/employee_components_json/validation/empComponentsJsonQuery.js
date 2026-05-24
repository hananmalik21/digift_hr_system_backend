import {
  collectEmployeeGuidsFromInput,
  MAX_EMPLOYEE_GUIDS
} from '../../utils/normalizeHexGuid.js';

const MAX_PAGE_SIZE = 100;

function parseOptionalPositiveInt(raw, fieldName) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`${fieldName} must be a valid positive integer`);
  }
  return n;
}

function parsePagination(input) {
  let page = 1;
  if (input?.page !== undefined && String(input.page).trim() !== '') {
    const p = Number.parseInt(String(input.page), 10);
    if (!Number.isFinite(p) || p < 1) {
      throw new Error('page must be a positive integer');
    }
    page = p;
  }

  const rawSize = input?.page_size ?? input?.limit;
  let pageSize = 10;
  if (rawSize !== undefined && String(rawSize).trim() !== '') {
    const n = Number.parseInt(String(rawSize), 10);
    if (!Number.isFinite(n) || n < 1) {
      throw new Error('page_size must be a positive integer');
    }
    pageSize = Math.min(MAX_PAGE_SIZE, n);
  }

  return { page, pageSize };
}

function parseCoreInput(input) {
  const entRaw = input?.enterprise_id;
  if (entRaw === undefined || entRaw === null || String(entRaw).trim() === '') {
    return { ok: false, message: 'enterprise_id is required' };
  }

  const enterprise_id = Number.parseInt(String(entRaw), 10);
  if (!Number.isFinite(enterprise_id) || enterprise_id < 1) {
    return { ok: false, message: 'enterprise_id must be a valid positive integer' };
  }

  const guidResult = collectEmployeeGuidsFromInput(input, {
    allowEmpty: true,
    maxCount: MAX_EMPLOYEE_GUIDS
  });
  if (!guidResult.ok) {
    return guidResult;
  }

  const plan_id = parseOptionalPositiveInt(input?.plan_id, 'plan_id');
  const pagination = parsePagination(input);

  return {
    ok: true,
    data: {
      enterprise_id,
      employee_guids: guidResult.employee_guids,
      plan_id,
      pagination
    }
  };
}

/**
 * POST body parser for /api/comp/bulk-employee-components
 *
 * @param {Record<string, unknown>} body
 * @returns {{ ok: true, data: object } | { ok: false, message: string }}
 */
export function parseBulkEmployeeComponentsBody(body) {
  try {
    if (body == null || typeof body !== 'object' || Array.isArray(body)) {
      return { ok: false, message: 'Request body must be a JSON object' };
    }

    if (
      body.employee_guids !== undefined &&
      body.employee_guids !== null &&
      !Array.isArray(body.employee_guids)
    ) {
      return { ok: false, message: 'employee_guids must be an array' };
    }

    return parseCoreInput(body);
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Invalid request body'
    };
  }
}

export { MAX_EMPLOYEE_GUIDS, MAX_PAGE_SIZE };
