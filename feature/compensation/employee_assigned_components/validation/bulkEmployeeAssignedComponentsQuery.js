import {
  collectEmployeeGuidsFromInput,
  MAX_EMPLOYEE_GUIDS,
  parseEmployeeGuidList
} from '../../utils/normalizeHexGuid.js';

/**
 * GET query: ?employee_guids=HEX1,HEX2 or ?employee_guids=HEX1&employee_guids=HEX2
 *
 * @param {Record<string, unknown>} rawQuery
 */
export function parseBulkEmployeeAssignedComponentsQuery(rawQuery) {
  return parseEmployeeGuidList(rawQuery?.employee_guids);
}

/**
 * POST body: { "employee_guids": ["HEX1", "HEX2"] }
 *
 * @param {Record<string, unknown>} body
 */
export function parseBulkEmployeeAssignedComponentsBody(body) {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, message: 'Request body must be a JSON object' };
  }

  if (!Object.prototype.hasOwnProperty.call(body, 'employee_guids')) {
    return { ok: false, message: 'employee_guids is required' };
  }

  if (!Array.isArray(body.employee_guids)) {
    return { ok: false, message: 'employee_guids must be an array' };
  }

  return parseEmployeeGuidList(body.employee_guids);
}

export { MAX_EMPLOYEE_GUIDS, collectEmployeeGuidsFromInput, parseEmployeeGuidList };
