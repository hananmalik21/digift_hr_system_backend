/**
 * Shared helpers for EMPL.V_EMPLOYEE_ASSIGNMENTS_LIST row mapping and list queries.
 */

import { employeeAccessJoin } from './userContext.js';

export const EMPL_EMPLOYEE_ASSIGNMENTS_LIST_VIEW = 'EMPL.V_EMPLOYEE_ASSIGNMENTS_LIST';

/** Explicit column projection for assignment list APIs (GUIDs as RAWTOHEX). */
export const EMPL_ASSIGNMENTS_LIST_SELECT_SQL = `
  v.ENTERPRISE_ID              AS enterprise_id,
  v.EMPLOYEE_ID                AS employee_id,
  RAWTOHEX(v.EMPLOYEE_GUID)    AS employee_guid,
  v.FIRST_NAME_EN              AS first_name_en,
  v.MIDDLE_NAME_EN             AS middle_name_en,
  v.LAST_NAME_EN               AS last_name_en,
  v.FOURTH_NAME_EN             AS fourth_name_en,
  v.FIRST_NAME_AR              AS first_name_ar,
  v.MIDDLE_NAME_AR             AS middle_name_ar,
  v.LAST_NAME_AR               AS last_name_ar,
  v.FOURTH_NAME_AR             AS fourth_name_ar,
  v.FAMILY_NAME_AR             AS family_name_ar,
  v.EMAIL                      AS email,
  v.PHONE_NUMBER               AS phone_number,
  v.MOBILE_NUMBER              AS mobile_number,
  v.DATE_OF_BIRTH              AS date_of_birth,
  v.EMPLOYEE_STATUS            AS employee_status,
  v.EMPLOYEE_IS_ACTIVE         AS employee_is_active,
  v.ASSIGNMENT_ID              AS assignment_id,
  RAWTOHEX(v.ASSIGNMENT_GUID)  AS assignment_guid,
  v.EMPLOYEE_NUMBER            AS employee_number,
  RAWTOHEX(v.ORG_UNIT_ID)      AS org_unit_id,
  v.ORG_STRUCTURE_LIST         AS org_structure_list,
  v.WORK_LOCATION_ID           AS work_location_id,
  RAWTOHEX(v.POSITION_ID)      AS position_id,
  v.POSITION_OBJ               AS position_obj,
  v.JOB_FAMILY_ID              AS job_family_id,
  v.JOB_LEVEL_ID               AS job_level_id,
  v.GRADE_ID                   AS grade_id,
  v.ENTERPRISE_HIRE_DATE       AS enterprise_hire_date,
  v.CONTRACT_TYPE_CODE         AS contract_type_code,
  v.PROBATION_DAYS             AS probation_days,
  v.REPORTING_TO_EMP_ID        AS reporting_to_emp_id,
  v.EMPLOYMENT_STATUS          AS employment_status,
  v.EFFECTIVE_START_DATE       AS effective_start_date,
  v.EFFECTIVE_END_DATE         AS effective_end_date,
  v.ASSIGNMENT_STATUS          AS assignment_status,
  v.ASSIGNMENT_IS_ACTIVE       AS assignment_is_active
`.trim();

/**
 * Parse JSON safely. Returns nested object/array when input is string; leaves objects as-is.
 * On parse failure returns the original string instead of throwing.
 * @param {*} value
 * @returns {*}
 */
export function safeJson(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

/** @deprecated Use safeJson. Kept for compatibility. */
export function safeJsonParse(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object' && !(value instanceof Date)) return value;
  if (typeof value !== 'string') return fallback;
  const s = value.trim();
  if (!s || s.toLowerCase() === 'null') return fallback;
  try {
    const parsed = JSON.parse(s);
    return parsed != null ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Convert Oracle RAW/Buffer columns to uppercase hex strings (recursive for nested objects).
 * @param {*} row
 * @returns {*}
 */
export function rowRawToHex(row) {
  if (row === null || row === undefined) return row;
  if (row instanceof Buffer) return row.toString('hex').toUpperCase();
  if (typeof row !== 'object') return row;
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = value instanceof Buffer
      ? value.toString('hex').toUpperCase()
      : (typeof value === 'object' && value !== null && !(value instanceof Date)
        ? rowRawToHex(value)
        : value);
  }
  return out;
}

export function uppercaseHexString(value) {
  return typeof value === 'string' ? value.toUpperCase() : value;
}

export function assertPositiveEnterpriseId(value) {
  const enterpriseId = value != null ? Number(value) : NaN;
  if (!Number.isFinite(enterpriseId) || enterpriseId < 1) {
    const err = new Error('enterprise_id is required and must be a positive number');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  return enterpriseId;
}

export function assertPositiveUserId(value) {
  const userId = value != null && value !== '' ? Number(value) : NaN;
  if (!Number.isFinite(userId) || userId < 1) {
    const err = new Error('user_id is required and must be a positive number');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  return userId;
}

/**
 * @param {Object} accessOptions
 * @returns {string}
 */
export function buildEmployeeAssignmentsListFromClause(accessOptions) {
  return `${EMPL_EMPLOYEE_ASSIGNMENTS_LIST_VIEW} v
    ${employeeAccessJoin('v.ENTERPRISE_ID', 'v.EMPLOYEE_ID', ':user_id', accessOptions)}`;
}

/** SQL fragment + bind key for SEARCH_KEY filtering. */
export function buildSearchKeyCondition(bindName = 'search') {
  return `UPPER(v.SEARCH_KEY) LIKE '%' || UPPER(:${bindName}) || '%'`;
}

export const EMPL_ASSIGNMENTS_SEARCH_KEY_CONDITION = buildSearchKeyCondition('search');

/**
 * @param {Object} row
 * @returns {Array|*}
 */
export function parseOrgStructureListFromRow(row) {
  const listRaw = row?.ORG_STRUCTURE_LIST ?? row?.org_structure_list
    ?? row?.ORG_STRUCTURE_LIST_JSON ?? row?.org_structure_list_json;
  const parsed = safeJson(listRaw);
  if (Array.isArray(parsed)) return parsed;
  if (parsed == null) return [];
  return parsed;
}

/**
 * @param {Object} row
 * @param {{ fallbackToRaw?: boolean }} [options]
 * @returns {*|null}
 */
export function parsePositionObjFromRow(row, options = {}) {
  const { fallbackToRaw = true } = options;
  const positionRaw = row?.POSITION_OBJ ?? row?.position_obj
    ?? row?.POSITION_OBJ_JSON ?? row?.position_obj_json;
  const parsed = safeJson(positionRaw);
  if (parsed != null) return parsed;
  return fallbackToRaw ? (positionRaw ?? null) : null;
}

function lowercaseRowKeys(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[key.toLowerCase()] = value;
  }
  return out;
}

function applyHexGuidFields(row, fields) {
  for (const field of fields) {
    if (row[field] != null) row[field] = uppercaseHexString(row[field]);
  }
}

/**
 * Normalize assignment list row for GET /api/empl/employee-assignments.
 * Keeps position_obj; does not collapse to minimal position.
 * @param {Object} row
 * @returns {Object}
 */
export function normalizeEmployeeAssignmentListRow(row) {
  if (!row) return row;

  const out = lowercaseRowKeys(row);
  applyHexGuidFields(out, ['employee_guid', 'assignment_guid', 'org_unit_id', 'position_id']);

  const orgListRaw = out.org_structure_list ?? out.org_structure_list_json;
  const parsedOrgList = safeJson(orgListRaw);
  out.org_structure_list = parsedOrgList != null ? parsedOrgList : (orgListRaw ?? null);

  const positionRaw = out.position_obj ?? out.position_obj_json;
  const parsedPosition = safeJson(positionRaw);
  out.position_obj = parsedPosition != null ? parsedPosition : (positionRaw ?? null);

  delete out.org_structure_list_json;
  delete out.position_obj_json;
  delete out.search_key;

  return out;
}

export function isPositionObjEmpty(obj) {
  if (!obj || typeof obj !== 'object') return true;
  return Object.values(obj).every(v => v == null || v === '');
}

/** Minimal position shape for employee list APIs. */
export function toMinimalPosition(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const id = obj.position_id ?? obj.POSITION_ID ?? obj.positionId;
  if (id == null) return null;
  return {
    position_id: id,
    position_code: obj.position_code ?? obj.POSITION_CODE ?? obj.positionCode ?? null,
    status: obj.status ?? obj.STATUS ?? obj.position_status ?? obj.POSITION_STATUS ?? null,
    position_title_en: obj.position_title_en ?? obj.POSITION_TITLE_EN ?? obj.position_name_en ?? obj.POSITION_NAME_EN ?? obj.positionTitleEn ?? null
  };
}

export function buildPositionFromRow(row) {
  const positionId = row.POSITION_ID ?? row.position_id;
  if (positionId == null) return null;
  return toMinimalPosition({
    position_id: positionId,
    position_code: row.POSITION_CODE ?? row.position_code,
    status: row.POSITION_STATUS ?? row.position_status,
    position_title_en: row.POSITION_NAME_EN ?? row.POSITION_TITLE_EN ?? row.position_name_en ?? row.position_title_en
  });
}

/**
 * Normalize list row for cursor/offset employee list APIs.
 * Collapses position to minimal `position` object.
 * @param {Object} row
 * @returns {Object}
 */
export function normalizeEmployeeListRowWithPosition(row) {
  const r = rowRawToHex(row);

  let org_structure_list = parseOrgStructureListFromRow(r);
  if (!Array.isArray(org_structure_list)) org_structure_list = [];

  const positionObj = parsePositionObjFromRow(r, { fallbackToRaw: false });
  const resolvedPosition = (typeof positionObj === 'object' && positionObj !== null && !isPositionObjEmpty(positionObj))
    ? positionObj
    : buildPositionFromRow(r);

  const out = lowercaseRowKeys(r);
  out.org_structure_list = org_structure_list;
  out.position = toMinimalPosition(resolvedPosition);

  delete out.org_structure_list_json;
  delete out.position_obj_json;
  delete out.position_obj;
  delete out.search_key;

  return out;
}
