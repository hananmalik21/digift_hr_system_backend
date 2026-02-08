import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import oracledb from 'oracledb';
import EmployeeModel from '../model/employeeModel.js';
import PositionsModel from '../../positions/model/positions_model.js';
import { getConnection } from '../../../config/db.js';
import {
  validateRequired,
  createEmployeeAllInOne,
  fromBody,
  fromBodyKeyContains
} from '../services/employeeCreateAllInOneService.js';
import {
  sendEmployeeList,
  sendEmployee,
  sendCreated,
  sendUpdated,
  sendDeleted,
  sendBadRequest,
  sendServerError,
  sendNotFound
} from '../view/employeeView.js';
import { ValidationError, NotFoundError } from '../../../utils/errors/index.js';
import { asyncHandler } from '../../../middleware/asyncHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Upload dir for all-in-one document (create if missing)
const UPLOADS_EMPLOYEES_DIR = path.resolve(__dirname, '../../../../uploads/employees');
if (!fs.existsSync(UPLOADS_EMPLOYEES_DIR)) {
  fs.mkdirSync(UPLOADS_EMPLOYEES_DIR, { recursive: true });
}

const uploadAllInOne = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, true)
}).single('document');

/** Only run multer when request is multipart (form-data with optional file). */
function maybeMulterAllInOne(req, res, next) {
  const contentType = (req.headers['content-type'] || '').toLowerCase();
  if (!contentType.includes('multipart/form-data')) {
    return next();
  }
  uploadAllInOne(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'File too large (max 10MB)'
        : (err.message || 'File upload error');
      return res.status(400).json({ success: false, message: msg, details: err.code || null });
    }
    next();
  });
}

// Middleware to track request start time for execution time calculation
router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

/**
 * Get enterprise ID from request
 * Checks query params, body, or environment variable
 */
function getEnterprise(req) {
  const v = req.query.enterprise_id ?? req.body.ENTERPRISE_ID ?? process.env.DEFAULT_ENTERPRISE_ID;
  return Number(v);
}

/**
 * Get enterprise ID for employee full-details (req.user.enterprise_id or x-enterprise-id header first)
 */
function getEnterpriseIdForEmployee(req) {
  const v = req.user?.enterprise_id ?? req.headers['x-enterprise-id'] ?? getEnterprise(req);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Extract user ID from request
 */
function getUserId(req) {
  return req.headers['x-user-id'] || req.user?.id || 'SYSTEM';
}

/**
 * Parse and validate pagination parameters (same pattern as leave_requests, leave_types).
 * @param {Object} query - req.query
 * @returns {{ page: number, pageSize: number }}
 */
function parsePagination(query) {
  let page = 1;
  let pageSize = 10;

  if (query.page !== undefined) {
    const parsedPage = parseInt(query.page, 10);
    if (isNaN(parsedPage) || parsedPage < 1) {
      throw new Error('Invalid page number. Must be a positive integer.');
    }
    page = parsedPage;
  }

  if (query.page_size !== undefined) {
    const parsedPageSize = parseInt(query.page_size, 10);
    if (isNaN(parsedPageSize) || parsedPageSize < 1) {
      throw new Error('Invalid page_size. Must be a positive integer.');
    }
    pageSize = Math.min(100, parsedPageSize);
  }

  return { page, pageSize };
}

/**
 * Build pagination metadata (same shape as other APIs).
 */
function buildPaginationMeta(page, pageSize, totalCount) {
  const totalPages = Math.ceil(totalCount / pageSize) || 0;
  return {
    page,
    pageSize,
    total: totalCount,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1
  };
}

/**
 * Build WHERE clause and bind arrays for EMPL.V_EMPLOYEE_ASSIGNMENTS_LIST.
 * - Base filters: enterpriseId, positionId, jobFamilyId, jobLevelId, gradeId (positional :1–:9).
 * - Dynamic org filter: when org_unit_id_hex is set, add JSON_EXISTS on ORG_STRUCTURE_LIST_JSON
 *   (org_unit_id as hex string; optional level_code). Count uses :10[:11]; data uses :12[:13] (offset/pageSize are :10,:11).
 * - Pagination: data only, OFFSET :10 FETCH :11.
 */
function buildEmployeeListWhereAndBinds(filters) {
  const baseConditions = [
    'v.ENTERPRISE_ID = :1',
    '(:2 IS NULL OR v.POSITION_ID = :2)',
    '(:3 IS NULL OR v.JOB_FAMILY_ID = :3)',
    '(:4 IS NULL OR v.JOB_LEVEL_ID = :4)',
    '(:5 IS NULL OR v.GRADE_ID = :5)'
  ];

  const p = filters.positionId ?? null;
  const jf = filters.jobFamilyId ?? null;
  const jl = filters.jobLevelId ?? null;
  const g = filters.gradeId ?? null;
  const hasJsonFilter = filters.org_unit_id_hex != null && filters.org_unit_id_hex !== '';
  const hasLevelCode = hasJsonFilter && filters.level_code != null && filters.level_code !== '';

  const countConditions = [...baseConditions];
  const dataConditions = [...baseConditions];
  if (hasJsonFilter) {
    if (hasLevelCode) {
      countConditions.push(
        `JSON_EXISTS(v.ORG_STRUCTURE_LIST_JSON, '$[*]?(@.level_code == $lvl && @.org_unit_id == $oid)' PASSING :10 AS "oid", :11 AS "lvl")`
      );
      dataConditions.push(
        `JSON_EXISTS(v.ORG_STRUCTURE_LIST_JSON, '$[*]?(@.level_code == $lvl && @.org_unit_id == $oid)' PASSING :12 AS "oid", :13 AS "lvl")`
      );
    } else {
      countConditions.push(
        `JSON_EXISTS(v.ORG_STRUCTURE_LIST_JSON, '$[*]?(@.org_unit_id == $oid)' PASSING :10 AS "oid")`
      );
      dataConditions.push(
        `JSON_EXISTS(v.ORG_STRUCTURE_LIST_JSON, '$[*]?(@.org_unit_id == $oid)' PASSING :12 AS "oid")`
      );
    }
  }

  const countWhere = countConditions.join(' AND ');
  const dataWhere = dataConditions.join(' AND ');

  const countSql = `SELECT COUNT(*) AS total_records FROM EMPL.V_EMPLOYEE_ASSIGNMENTS_LIST v WHERE ${countWhere}`;
  const dataSql = `SELECT v.* FROM EMPL.V_EMPLOYEE_ASSIGNMENTS_LIST v WHERE ${dataWhere}
  ORDER BY v.EMPLOYEE_ID NULLS LAST
  OFFSET :10 ROWS FETCH NEXT :11 ROWS ONLY`;

  const countBinds = [
    filters.enterpriseId,
    p, p,
    jf, jf,
    jl, jl,
    g, g
  ];
  if (hasJsonFilter) {
    countBinds.push(filters.org_unit_id_hex);
    if (hasLevelCode) countBinds.push(filters.level_code);
  }

  const dataBinds = [
    filters.enterpriseId,
    p, p,
    jf, jf,
    jl, jl,
    g, g
  ];
  if (hasJsonFilter) {
    dataBinds.push(filters.org_unit_id_hex);
    if (hasLevelCode) dataBinds.push(filters.level_code);
  }
  dataBinds.push(filters.offset, filters.pageSize);

  return { countSql, dataSql, countBinds, dataBinds };
}

/**
 * Convert 32-char hex string to Buffer for Oracle RAW(16) bind.
 * @param {string|null|undefined} hex
 * @returns {Buffer|null}
 */
function hexToBuffer(hex) {
  if (hex == null || typeof hex !== 'string') return null;
  const s = hex.trim().replace(/-/g, '');
  if (!/^[0-9A-Fa-f]{32}$/.test(s)) return null;
  return Buffer.from(s, 'hex');
}

/**
 * Recursively convert Buffer values (RAW) to hex strings in a row object.
 * @param {Object} row
 * @returns {Object}
 */
function rowRawToHex(row) {
  if (row === null || row === undefined) return row;
  if (row instanceof Buffer) return row.toString('hex').toUpperCase();
  if (typeof row !== 'object') return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = v instanceof Buffer ? v.toString('hex').toUpperCase() : (typeof v === 'object' && v !== null && !(v instanceof Date) ? rowRawToHex(v) : v);
  }
  return out;
}

/**
 * Parse JSON safely so response always returns nested objects/arrays, not escaped strings.
 * @param {*} v - value from driver (string, object, or null)
 * @returns {*} parsed object/array, or original value, or null
 */
function safeJson(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }
  return v;
}

/**
 * Parse org_structure_list from view (CLOB/string or Lob) into a JSON array.
 * With oracledb.fetchAsString = [oracledb.CLOB], the value is a string; never return Lob or object with "0"/"1" keys.
 * @param {*} value - CLOB string, null, or (legacy) Lob object
 * @returns {Array}
 */
function parseOrgStructureList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const s = value.trim();
    if (s === '' || s.toLowerCase() === 'null') return [];
    try {
      const parsed = JSON.parse(s);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Normalize a single employee list row: RAW→hex, org_structure_list and position_obj as parsed JSON (never escaped strings).
 * Returns only position_obj as object; position_obj_json is removed.
 */
function normalizeEmployeeListRow(row) {
  const r = rowRawToHex(row);
  delete r.ORG_STRUCTURE_LIST_JSON;
  delete r.org_structure_list_json;

  const listRaw = r.ORG_STRUCTURE_LIST ?? r.org_structure_list ?? r.ORG_STRUCTURE_LIST_JSON ?? r.org_structure_list_json;
  let org_structure_list = safeJson(listRaw);
  if (!Array.isArray(org_structure_list)) org_structure_list = [];
  r.org_structure_list = org_structure_list;
  delete r.ORG_STRUCTURE_LIST;
  if ('ORG_STRUCTURE_LIST_JSON' in r) delete r.ORG_STRUCTURE_LIST_JSON;

  const posRaw = r.POSITION_OBJ ?? r.position_obj ?? r.POSITION_OBJ_JSON ?? r.position_obj_json;
  const posObj = safeJson(posRaw);
  r.position_obj = (typeof posObj === 'object' && posObj !== null) ? posObj : null;
  delete r.POSITION_OBJ;
  delete r.POSITION_OBJ_JSON;
  delete r.position_obj_json;

  return r;
}

// --- Full details (V_EMPLOYEE_FULL_DETAILS) helpers ---

/**
 * Convert RAW GUID to hex string. Handles Buffer, null, or string.
 * @param {Buffer|string|null|undefined} val
 * @returns {string|null}
 */
function toHex(val) {
  if (val == null) return null;
  if (val instanceof Buffer) return val.toString('hex').toUpperCase();
  if (typeof val === 'string') return val.trim();
  return null;
}

/**
 * Parse CLOB/JSON column to array safely. If already array keep; if object wrap in []; if string JSON.parse; null/empty → [].
 * @param {*} value - CLOB string, object, array, or null
 * @returns {Array}
 */
function parseJsonToArray(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return [value];
  if (typeof value !== 'string') return [];
  const s = value.trim();
  if (!s || s.toLowerCase() === 'null') return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : (parsed != null && typeof parsed === 'object' ? [parsed] : []);
  } catch {
    return [];
  }
}

/**
 * Ensure date/timestamp is returned as ISO string.
 * @param {Date|string|null|undefined} val
 * @returns {string|null}
 */
function dateToIso(val) {
  if (val == null) return null;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'string') return val;
  return null;
}

/** Employee flat columns only (latest row from V_EMPLOYEE_FULL_DETAILS). */
const EMPLOYEE_TABLE_COLUMNS = new Set([
  'EMPLOYEE_ID', 'EMPLOYEE_GUID', 'ENTERPRISE_ID',
  'FIRST_NAME_EN', 'MIDDLE_NAME_EN', 'LAST_NAME_EN',
  'FIRST_NAME_AR', 'MIDDLE_NAME_AR', 'LAST_NAME_AR', 'FAMILY_NAME_AR',
  'EMAIL', 'PHONE_NUMBER', 'MOBILE_NUMBER', 'DATE_OF_BIRTH',
  'STATUS', 'IS_ACTIVE', 'CREATED_BY', 'CREATION_DATE', 'LAST_UPDATED_BY', 'LAST_UPDATE_DATE',
  'EMPLOYEE_STATUS', 'EMPLOYEE_IS_ACTIVE'
]);

/**
 * Column mapping: view columns → output group. Assignment = latest assignment flat; demographics, schedule, compensation, allowances, document_compliance = latest flat.
 */
const FULL_DETAILS_COLUMN_GROUPS = {
  ASSIGNMENT_ID: 'assignment',
  ASSIGNMENT_GUID: 'assignment',
  EMPLOYEE_NUMBER: 'assignment',
  ORG_UNIT_ID: 'assignment',
  POSITION_ID: 'assignment',
  WORK_LOCATION_ID: 'assignment',
  JOB_FAMILY_ID: 'assignment',
  JOB_LEVEL_ID: 'assignment',
  GRADE_ID: 'assignment',
  ENTERPRISE_HIRE_DATE: 'assignment',
  CONTRACT_TYPE_CODE: 'assignment',
  PROBATION_DAYS: 'assignment',
  REPORTING_TO_EMP_ID: 'assignment',
  EMPLOYMENT_STATUS: 'assignment',
  EFFECTIVE_START_DATE: 'assignment',
  EFFECTIVE_END_DATE: 'assignment',
  ASSIGNMENT_STATUS: 'assignment',
  ASSIGNMENT_IS_ACTIVE: 'assignment',
  ORG_STRUCTURE_LIST: 'assignment',
  ORG_STRUCTURE_LIST_JSON: 'assignment',
  JOB_ID: 'assignment',
  CIVIL_ID_NUMBER: 'demographics',
  PASSPORT_NUMBER: 'demographics',
  NATIONALITY: 'demographics',
  NATIONALITY_CODE: 'demographics',
  GENDER_CODE: 'demographics',
  VISA_NUMBER: 'demographics',
  VISA_EXPIRY: 'demographics',
  WORK_PERMIT_NUMBER: 'demographics',
  WORK_PERMIT_EXPIRY: 'demographics',
  MARITAL_STATUS_CODE: 'demographics',
  RELIGION_CODE: 'demographics',
  DEMO_ID: 'demographics',
  DEMO_GUID: 'demographics',
  WORK_SCHEDULE_ID: 'schedule',
  EMP_SCH_ID: 'schedule',
  EMP_SCH_GUID: 'schedule',
  SCHEDULE_CODE: 'schedule',
  SCHEDULE_NAME_EN: 'schedule',
  SCHEDULE_NAME_AR: 'schedule',
  WORK_PATTERN_ID: 'schedule',
  ASSIGNMENT_MODE: 'schedule',
  SCHEDULE_STATUS: 'schedule',
  WS_START: 'schedule',
  WS_END: 'schedule',
  WS_STATUS: 'schedule',
  WS_IS_ACTIVE: 'schedule',
  SALARY: 'compensation',
  BASIC_SALARY_KWD: 'compensation',
  CURRENCY_CODE: 'compensation',
  PAY_FREQUENCY: 'compensation',
  COMPENSATION_BASIS: 'compensation',
  COMP_ID: 'compensation',
  COMP_GUID: 'compensation',
  COMP_START: 'compensation',
  COMP_END: 'compensation',
  COMP_STATUS: 'compensation',
  COMP_IS_ACTIVE: 'compensation',
  HOUSING_KWD: 'allowances',
  TRANSPORT_KWD: 'allowances',
  OTHER_KWD: 'allowances',
  FOOD_KWD: 'allowances',
  MOBILE_KWD: 'allowances',
  HOUSING_ALLOWANCE: 'allowances',
  TRANSPORT_ALLOWANCE: 'allowances',
  OTHER_ALLOWANCE: 'allowances',
  ALLOW_ID: 'allowances',
  ALLOW_GUID: 'allowances',
  ALLOW_START: 'allowances',
  ALLOW_END: 'allowances',
  ALLOW_STATUS: 'allowances',
  ALLOW_IS_ACTIVE: 'allowances',
  DOC_COMPLIANCE_STATUS: 'document_compliance',
  DOC_COMPLIANCE_LAST_CHECK: 'document_compliance',
  DOC_COMP_ID: 'document_compliance',
  DOC_COMP_GUID: 'document_compliance',
  CIVIL_ID_EXPIRY: 'document_compliance',
  PASSPORT_EXPIRY: 'document_compliance',
  DOCC_STATUS: 'document_compliance',
  DOCC_IS_ACTIVE: 'document_compliance',
  DOCUMENTS_JSON: null,
  EMERGENCY_CONTACTS_JSON: null,
  BANK_CODE: 'bank',
  BANK_ACCOUNT_NUMBER: 'bank',
  BANK_NAME: 'bank',
  BANK_NAME_AR: 'bank',
  IBAN: 'bank',
  BANK_ID: 'bank',
  BANK_GUID: 'bank',
  ACCOUNT_NUMBER: 'bank',
  BANK_IS_PRIMARY: 'bank',
  BANK_STATUS: 'bank',
  BANK_IS_ACTIVE: 'bank',
  ADDRESS_LINE1: 'address',
  ADDRESS_LINE2: 'address',
  ADDRESS_LINE3: 'address',
  CITY: 'address',
  COUNTRY: 'address',
  COUNTRY_CODE: 'address',
  POSTAL_CODE: 'address',
  REGION: 'address',
  AREA: 'address',
  ADDRESS_ID: 'address',
  ADDRESS_GUID: 'address',
  ADDRESS_IS_PRIMARY: 'address',
  ADDRESS_STATUS: 'address',
  ADDRESS_IS_ACTIVE: 'address'
};

/**
 * Convert object keys to snake_case (for API response).
 */
function toSnakeCaseKeys(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object' || obj instanceof Date || obj instanceof Buffer) return obj;
  if (Array.isArray(obj)) return obj.map(toSnakeCaseKeys);
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    let newKey;
    if (key.includes('_') || key === key.toUpperCase()) {
      newKey = key.toLowerCase();
    } else {
      newKey = key.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
    }
    out[newKey] = value === null || value === undefined ? value : (typeof value === 'object' && !(value instanceof Date) && !(value instanceof Buffer) ? toSnakeCaseKeys(value) : value);
  }
  return out;
}

/**
 * Map a single row from EMPL.V_EMPLOYEE_FULL_DETAILS into the required response shape.
 * - assignment = latest assignment flat columns + org_structure_list (parsed) + position object (or null).
 * - work_schedule, compensation, allowances, document_compliance = latest flat objects.
 * - documents, emergency_contacts, bank_accounts, addresses = parsed arrays.
 * - work_schedules, compensation_history, allowances_history, document_compliance_history = parsed history arrays (no *_json keys).
 */
function mapRowToFullDetailsShape(row) {
  const groups = {
    employee: {},
    assignment: {},
    demographics: {},
    schedule: {},
    compensation: {},
    allowances: {},
    document_compliance: {},
    bank: {},
    address: {}
  };

  const jsonColumnKeys = new Set([
    'DOCUMENTS_JSON', 'EMERGENCY_CONTACTS_JSON', 'BANK_ACCOUNTS_JSON', 'ADDRESSES_JSON',
    'WORK_SCHEDULES_JSON', 'COMPENSATION_JSON', 'ALLOWANCES_JSON', 'DOCUMENT_COMPLIANCE_JSON'
  ]);
  for (const [key, value] of Object.entries(row)) {
    const keyUpper = key.toUpperCase && key.toUpperCase() || key;
    if (jsonColumnKeys.has(keyUpper)) continue;

    let group = EMPLOYEE_TABLE_COLUMNS.has(keyUpper)
      ? 'employee'
      : FULL_DETAILS_COLUMN_GROUPS[keyUpper];
    if (group == null) continue;

    let outVal = value;
    if (value instanceof Buffer) outVal = toHex(value);
    else if (value instanceof Date) outVal = dateToIso(value);
    groups[group][key] = outVal;
  }

  const documents = parseJsonToArray(row.DOCUMENTS_JSON ?? row.documents_json);
  const emergency_contacts = parseJsonToArray(row.EMERGENCY_CONTACTS_JSON ?? row.emergency_contacts_json);
  const bank_accounts = parseJsonToArray(row.BANK_ACCOUNTS_JSON ?? row.bank_accounts_json);
  const addresses = parseJsonToArray(row.ADDRESSES_JSON ?? row.addresses_json);
  const work_schedules = parseJsonToArray(row.WORK_SCHEDULES_JSON ?? row.work_schedules_json);
  const compensation_history = parseJsonToArray(row.COMPENSATION_JSON ?? row.compensation_json);
  const allowances_history = parseJsonToArray(row.ALLOWANCES_JSON ?? row.allowances_json);
  const document_compliance_history = parseJsonToArray(row.DOCUMENT_COMPLIANCE_JSON ?? row.document_compliance_json);

  const assignmentOut = toSnakeCaseKeys(groups.assignment);
  assignmentOut.org_structure_list = parseOrgStructureList(row.ORG_STRUCTURE_LIST ?? row.org_structure_list ?? row.ORG_STRUCTURE_LIST_JSON ?? row.org_structure_list_json);
  delete assignmentOut.org_structure_list_json;

  const positionIdVal = row.POSITION_ID ?? row.position_id ?? groups.assignment.POSITION_ID ?? groups.assignment.position_id;
  const positionId = positionIdVal != null && typeof positionIdVal === 'object' && Buffer.isBuffer(positionIdVal)
    ? toHex(positionIdVal)
    : (positionIdVal != null ? positionIdVal : null);
  if (positionId != null) {
    assignmentOut.position = {
      position_id: positionId,
      position_code: row.POSITION_CODE ?? row.position_code ?? null,
      position_name_en: row.POSITION_NAME_EN ?? row.POSITION_TITLE_EN ?? row.position_name_en ?? row.position_title_en ?? null,
      position_name_ar: row.POSITION_NAME_AR ?? row.POSITION_TITLE_AR ?? row.position_name_ar ?? row.position_title_ar ?? null,
      position_status: row.POSITION_STATUS ?? row.position_status ?? null
    };
  } else {
    assignmentOut.position = null;
  }

  return {
    employee: toSnakeCaseKeys(groups.employee),
    assignment: assignmentOut,
    demographics: toSnakeCaseKeys(groups.demographics),
    work_schedule: toSnakeCaseKeys(groups.schedule),
    compensation: toSnakeCaseKeys(groups.compensation),
    allowances: toSnakeCaseKeys(groups.allowances),
    document_compliance: toSnakeCaseKeys(groups.document_compliance),
    documents,
    emergency_contacts,
    bank_accounts,
    addresses,
    work_schedules,
    compensation_history,
    allowances_history,
    document_compliance_history
  };
}

/**
 * Single row by ID (backward compatible).
 */
const SQL_FULL_DETAILS_BY_ID = `
  SELECT v.*
  FROM EMPL.V_EMPLOYEE_FULL_DETAILS v
  WHERE v.ENTERPRISE_ID = :enterprise_id AND v.EMPLOYEE_ID = :employee_id
`;

/**
 * Single row by GUID (backward compatible).
 */
const SQL_FULL_DETAILS_BY_GUID = `
  SELECT v.*
  FROM EMPL.V_EMPLOYEE_FULL_DETAILS v
  WHERE v.ENTERPRISE_ID = :enterprise_id AND v.EMPLOYEE_GUID = HEXTORAW(:employee_guid_hex)
`;

/**
 * Paginated query from EMPL.V_EMPLOYEE_FULL_DETAILS.
 * Binds: enterprise_id (required), employee_id (optional), employee_guid_hex (optional), offset, limit.
 * Single row when employee_id or employee_guid_hex set; list when both null.
 */
const SQL_FULL_DETAILS_PAGINATED = `
  SELECT
    v.ENTERPRISE_ID, v.EMPLOYEE_ID, v.EMPLOYEE_GUID,
    v.FIRST_NAME_EN, v.MIDDLE_NAME_EN, v.LAST_NAME_EN,
    v.FIRST_NAME_AR, v.MIDDLE_NAME_AR, v.LAST_NAME_AR, v.FAMILY_NAME_AR,
    v.EMAIL, v.PHONE_NUMBER, v.MOBILE_NUMBER, v.DATE_OF_BIRTH,
    v.EMPLOYEE_STATUS, v.EMPLOYEE_IS_ACTIVE, v.CREATION_DATE, v.LAST_UPDATE_DATE,
    v.ASSIGNMENT_ID, v.ASSIGNMENT_GUID, v.EMPLOYEE_NUMBER, v.ORG_UNIT_ID, v.ORG_STRUCTURE_LIST,
    v.WORK_LOCATION_ID, v.POSITION_ID, v.POSITION_CODE, v.POSITION_NAME_EN, v.POSITION_NAME_AR, v.POSITION_STATUS,
    v.JOB_FAMILY_ID, v.JOB_LEVEL_ID, v.GRADE_ID, v.ENTERPRISE_HIRE_DATE, v.CONTRACT_TYPE_CODE, v.PROBATION_DAYS,
    v.REPORTING_TO_EMP_ID, v.EMPLOYMENT_STATUS, v.EFFECTIVE_START_DATE, v.EFFECTIVE_END_DATE,
    v.ASSIGNMENT_STATUS, v.ASSIGNMENT_IS_ACTIVE,
    v.DEMO_ID, v.DEMO_GUID, v.GENDER_CODE, v.NATIONALITY_CODE, v.MARITAL_STATUS_CODE, v.RELIGION_CODE,
    v.CIVIL_ID_NUMBER, v.PASSPORT_NUMBER,
    v.EMP_SCH_ID, v.EMP_SCH_GUID, v.WORK_SCHEDULE_ID, v.WS_START, v.WS_END, v.WS_STATUS, v.WS_IS_ACTIVE,
    v.COMP_ID, v.COMP_GUID, v.BASIC_SALARY_KWD, v.COMP_START, v.COMP_END, v.COMP_STATUS, v.COMP_IS_ACTIVE,
    v.ALLOW_ID, v.ALLOW_GUID, v.HOUSING_KWD, v.TRANSPORT_KWD, v.FOOD_KWD, v.MOBILE_KWD, v.OTHER_KWD,
    v.ALLOW_START, v.ALLOW_END, v.ALLOW_STATUS, v.ALLOW_IS_ACTIVE,
    v.DOC_COMP_ID, v.DOC_COMP_GUID, v.CIVIL_ID_EXPIRY, v.PASSPORT_EXPIRY, v.VISA_NUMBER, v.VISA_EXPIRY,
    v.WORK_PERMIT_NUMBER, v.WORK_PERMIT_EXPIRY, v.DOCC_STATUS, v.DOCC_IS_ACTIVE,
    v.DOCUMENTS_JSON, v.EMERGENCY_CONTACTS_JSON, v.BANK_ACCOUNTS_JSON, v.ADDRESSES_JSON,
    v.WORK_SCHEDULES_JSON, v.COMPENSATION_JSON, v.ALLOWANCES_JSON, v.DOCUMENT_COMPLIANCE_JSON
  FROM EMPL.V_EMPLOYEE_FULL_DETAILS v
  WHERE v.ENTERPRISE_ID = :enterprise_id
    AND (:employee_id IS NULL OR v.EMPLOYEE_ID = :employee_id)
    AND (:employee_guid_hex IS NULL OR v.EMPLOYEE_GUID = HEXTORAW(:employee_guid_hex))
  ORDER BY v.EMPLOYEE_ID
  OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
`;

/**
 * GET /api/employees/:idOrGuid/full-details – fetch single employee full details from EMPL.V_EMPLOYEE_FULL_DETAILS.
 * Accepts employee_id (NUMBER) or employee_guid (32-char hex). enterprise_id mandatory (x-enterprise-id or req.user.enterprise_id).
 * Response includes assignment.position = { position_id, position_code, position_name_en, position_name_ar, position_status } (or null).
 * @param {import('express').Request} req - req.params.guid (employee_id number OR 32-char hex GUID)
 * @param {import('express').Response} res
 */
export async function getEmployeeById(req, res) {
  const param = String(req.params.guid ?? '').trim();
  const normalizedGuid = param.replace(/-/g, '').toUpperCase();
  const isNumericId = /^\d+$/.test(param);
  const isGuid = normalizedGuid.length === 32 && /^[0-9A-Fa-f]+$/.test(normalizedGuid);

  if (!isNumericId && !isGuid) {
    return sendBadRequest(res, req, 'Parameter must be employee_id (numeric) or employee_guid (32-char hex).');
  }

  const enterpriseId = getEnterpriseIdForEmployee(req);
  if (!enterpriseId || !Number.isFinite(enterpriseId)) {
    return sendBadRequest(res, req, 'enterprise_id is required (x-enterprise-id header or req.user.enterprise_id)');
  }

  const binds = {
    enterprise_id: enterpriseId,
    employee_id: isNumericId ? parseInt(param, 10) : null,
    employee_guid_hex: isGuid ? normalizedGuid : null,
    offset: 0,
    limit: 1
  };

  let connection;
  try {
    connection = await getConnection();
    const opts = { outFormat: oracledb.OUT_FORMAT_OBJECT };
    const result = await connection.execute(SQL_FULL_DETAILS_PAGINATED, binds, opts);
    const row = result.rows?.[0] ?? null;
    if (!row) return sendNotFound(res, req, 'Employee not found');

    const data = mapRowToFullDetailsShape(rowRawToHex(row));
    res.json({ success: true, message: 'Employee fetched successfully', data });
  } catch (err) {
    sendServerError(res, req, 'Failed to fetch employee full details', {
      message: err?.message ?? String(err),
      ...(err?.errorNum != null && { errorNum: err.errorNum }),
      ...(err?.oraError != null && { oraCode: err.oraError?.code, oraMessage: err.oraError?.message })
    });
  } finally {
    if (connection) try { await connection.close(); } catch (_) {}
  }
}

const SQL_ONE_ASSIGNMENT_ROW_BY_EMPLOYEE_ID = `
  SELECT v.* FROM EMPL.V_EMPLOYEE_ASSIGNMENTS_LIST v
  WHERE v.EMPLOYEE_ID = :employee_id
  ORDER BY v.ASSIGNMENT_ID DESC NULLS LAST
  FETCH FIRST 1 ROW ONLY
`;

/**
 * Fetch a single employee row from EMPL.V_EMPLOYEE_ASSIGNMENTS_LIST (employee + assignment merged, org_structure_list).
 * Used to return the same shape as the list API for a given employee_id (e.g. after update).
 * @param {number} employeeId
 * @returns {Promise<Object|null>} Normalized row (snake_case) or null if not found
 */
export async function getEmployeeListRowByEmployeeId(employeeId) {
  let connection;
  try {
    connection = await getConnection();
    const result = await connection.execute(
      SQL_ONE_ASSIGNMENT_ROW_BY_EMPLOYEE_ID,
      { employee_id: Number(employeeId) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const row = result.rows?.[0] ?? null;
    if (!row) return null;
    const normalized = normalizeEmployeeListRow(row);
    const data = toSnakeCaseKeys(normalized);
    if (data.position_id) {
      try {
        const full = await PositionsModel.findById(data.position_id);
        data.position = full
          ? {
              position_id: full.position_id ?? null,
              position_code: full.position_code ?? null,
              status: full.status ?? null,
              position_title_en: full.position_title_en ?? null
            }
          : null;
      } catch (_) {
        data.position = null;
      }
    } else {
      data.position = null;
    }
    return data;
  } finally {
    if (connection) try { await connection.close(); } catch (_) {}
  }
}

/**
 * GET /api/employees – fetch employee listing from EMPL.V_EMPLOYEE_ASSIGNMENTS_LIST.
 * Supports pagination and optional filters. Uses bind variables only; RAW(16) in response as hex.
 * Pagination: same pattern as leave_requests, leave_types (page, page_size, parsePagination, buildPaginationMeta).
 *
 * @param {import('express').Request} req - req.query: enterpriseId (required), org_unit_id (hex, dynamic org filter via ORG_STRUCTURE_LIST_JSON), level_code (optional, with org_unit_id), positionId, jobFamilyId, jobLevelId, gradeId, page, page_size
 * @param {import('express').Response} res
 */
export async function getEmployees(req, res) {
  let page;
  let pageSize;
  try {
    const pagination = parsePagination(req.query);
    page = pagination.page;
    pageSize = pagination.pageSize;
  } catch (paginationError) {
    return sendBadRequest(res, req, paginationError.message);
  }

  const q = req.query;
  const enterpriseIdRaw = q.enterpriseId ?? q.enterprise_id;
  const enterpriseId = enterpriseIdRaw != null && enterpriseIdRaw !== '' ? Number(enterpriseIdRaw) : NaN;
  if (!Number.isFinite(enterpriseId) || enterpriseId < 1) {
    return sendBadRequest(res, req, 'enterpriseId (or enterprise_id) is required and must be a positive number');
  }

  // org_unit_id + level_code: dynamic org filter via ORG_STRUCTURE_LIST_JSON (hex string, not RAW)
  const orgUnitIdHexRaw = (q.org_unit_id ?? q.orgUnitId) != null && String(q.org_unit_id ?? q.orgUnitId).trim() !== '' ? String(q.org_unit_id ?? q.orgUnitId).trim() : null;
  const levelCodeRaw = (q.level_code ?? q.levelCode) != null && String(q.level_code ?? q.levelCode).trim() !== '' ? String(q.level_code ?? q.levelCode).trim() : null;
  if (levelCodeRaw != null && (orgUnitIdHexRaw == null || orgUnitIdHexRaw === '')) {
    return sendBadRequest(res, req, 'level_code requires org_unit_id');
  }
  const orgUnitIdHexForJson = orgUnitIdHexRaw ? orgUnitIdHexRaw.replace(/-/g, '').trim().toUpperCase() : null;
  if (orgUnitIdHexRaw && (!/^[0-9A-Fa-f]{32}$/.test(orgUnitIdHexForJson))) {
    return sendBadRequest(res, req, 'org_unit_id must be a 32-character hex string');
  }

  const positionIdHex = (q.positionId ?? q.position_id) != null && String(q.positionId ?? q.position_id).trim() !== '' ? String(q.positionId ?? q.position_id).trim() : null;
  const jobFamilyIdRaw = q.jobFamilyId ?? q.job_family_id;
  const jobLevelIdRaw = q.jobLevelId ?? q.job_level_id;
  const gradeIdRaw = q.gradeId ?? q.grade_id;
  const jobFamilyId = jobFamilyIdRaw != null && jobFamilyIdRaw !== '' ? parseInt(jobFamilyIdRaw, 10) : null;
  const jobLevelId = jobLevelIdRaw != null && jobLevelIdRaw !== '' ? parseInt(jobLevelIdRaw, 10) : null;
  const gradeId = gradeIdRaw != null && gradeIdRaw !== '' ? parseInt(gradeIdRaw, 10) : null;

  const positionIdBuf = hexToBuffer(positionIdHex);
  if (positionIdHex != null && positionIdBuf == null) {
    return sendBadRequest(res, req, 'positionId must be a 32-character hex string');
  }

  const offset = (page - 1) * pageSize;
  const filters = {
    enterpriseId,
    org_unit_id_hex: orgUnitIdHexForJson,
    level_code: levelCodeRaw ?? null,
    positionId: positionIdBuf,
    jobFamilyId: Number.isFinite(jobFamilyId) ? jobFamilyId : null,
    jobLevelId: Number.isFinite(jobLevelId) ? jobLevelId : null,
    gradeId: Number.isFinite(gradeId) ? gradeId : null,
    offset,
    pageSize
  };
  const { countSql, dataSql, countBinds, dataBinds } = buildEmployeeListWhereAndBinds(filters);

  let connection;
  try {
    connection = await getConnection();

    const [countResult, dataResult] = await Promise.all([
      connection.execute(countSql, countBinds, { outFormat: oracledb.OUT_FORMAT_OBJECT }),
      connection.execute(dataSql, dataBinds, { outFormat: oracledb.OUT_FORMAT_OBJECT })
    ]);

    const totalRecords = countResult.rows && countResult.rows[0] ? Number(countResult.rows[0].TOTAL_RECORDS) : 0;
    const paginationMeta = buildPaginationMeta(page, pageSize, totalRecords);
    const rows = dataResult.rows || [];
    const data = rows.map(row => normalizeEmployeeListRow(row));

    sendEmployeeList(res, req, data, {
      total: totalRecords,
      pagination: paginationMeta
    });
  } catch (err) {
    sendServerError(res, req, 'Failed to fetch employees', err);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}

/**
 * Map create-employee (all-in-one) Oracle errors to user-friendly messages.
 * @param {string} message - Raw error message
 * @returns {{ message: string, status?: number }}
 */
function getCreateEmployeeFriendlyMessage(message) {
  const m = String(message);

  // Civil ID duplicate (ORA-00001 / UK_DEMO_CIVILID)
  const isCivilIdConstraint = (m.includes('ORA-00001') || m.includes('UK_DEMO_CIVILID') || m.includes('CIVIL_ID_NUMBER')) && m.includes('already exists');
  if (isCivilIdConstraint) {
    const isNullConflict = /CIVIL_ID_NUMBER\s*:\s*NULL/i.test(m);
    return {
      message: isNullConflict
        ? 'Another employee already exists for this enterprise with no Civil ID. Provide a unique civil_id_number for this employee.'
        : 'An employee with this civil ID already exists for this enterprise. Please use a unique civil ID.',
      status: 409
    };
  }

  // ORA-20001: EMAIL already exists for this enterprise
  if (m.includes('ORA-20001') && /EMAIL\s+already\s+exists\s+for\s+this\s+enterprise/i.test(m)) {
    return {
      message: 'An employee with this email already exists for this enterprise. Please use a different email.',
      status: 409
    };
  }

  // Other ORA-20001: use the last (most specific) ORA-20001 message as the user message
  if (m.includes('ORA-20001')) {
    const match = m.match(/ORA-20001:\s*([^.\n]+(?:\.|$))/g);
    const last = match ? match[match.length - 1] : null;
    const text = last ? last.replace(/^ORA-20001:\s*/i, '').trim() : m;
    return { message: text || 'Employee creation failed. Please check your data and try again.' };
  }

  return { message: m };
}

/**
 * Validation helper
 */
function validateEmployeeData(data, isUpdate = false) {
  const errors = [];

  const firstName = data.FIRST_NAME_EN ?? data.FIRST_NAME;
  const lastName = data.LAST_NAME_EN ?? data.LAST_NAME;

  if (!isUpdate) {
    // Required fields for creation
    if (!firstName || String(firstName).trim() === '') {
      errors.push('FIRST_NAME_EN (or FIRST_NAME) is required');
    }
    if (!lastName || String(lastName).trim() === '') {
      errors.push('LAST_NAME_EN (or LAST_NAME) is required');
    }
    if (!data.EMAIL || data.EMAIL.trim() === '') {
      errors.push('EMAIL is required');
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.EMAIL)) {
        errors.push('EMAIL must be a valid email address');
      }
    }
    if (!data.PHONE_NUMBER || data.PHONE_NUMBER.trim() === '') {
      errors.push('PHONE_NUMBER is required');
    }
    if (!data.DATE_OF_BIRTH) {
      errors.push('DATE_OF_BIRTH is required');
    } else {
      const dob = new Date(data.DATE_OF_BIRTH);
      if (isNaN(dob.getTime())) {
        errors.push('DATE_OF_BIRTH must be a valid date');
      }
    }
  } else {
    // For updates, validate only provided fields
    if ((data.FIRST_NAME_EN ?? data.FIRST_NAME) !== undefined && String(data.FIRST_NAME_EN ?? data.FIRST_NAME).trim() === '') {
      errors.push('FIRST_NAME_EN cannot be empty');
    }
    if ((data.LAST_NAME_EN ?? data.LAST_NAME) !== undefined && String(data.LAST_NAME_EN ?? data.LAST_NAME).trim() === '') {
      errors.push('LAST_NAME_EN cannot be empty');
    }
    if (data.EMAIL !== undefined) {
      if (data.EMAIL.trim() === '') {
        errors.push('EMAIL cannot be empty');
      } else {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(data.EMAIL)) {
          errors.push('EMAIL must be a valid email address');
        }
      }
    }
    if (data.PHONE_NUMBER !== undefined && data.PHONE_NUMBER.trim() === '') {
      errors.push('PHONE_NUMBER cannot be empty');
    }
    if (data.DATE_OF_BIRTH !== undefined) {
      const dob = new Date(data.DATE_OF_BIRTH);
      if (isNaN(dob.getTime())) {
        errors.push('DATE_OF_BIRTH must be a valid date');
      }
    }
  }

  // Validate STATUS if provided
  if (data.STATUS !== undefined) {
    const validStatuses = ['DRAFT', 'ACTIVE', 'INACTIVE', 'TERMINATED'];
    if (!validStatuses.includes(String(data.STATUS).toUpperCase())) {
      errors.push(`STATUS must be one of: ${validStatuses.join(', ')}`);
    }
  }

  // Validate IS_ACTIVE if provided
  if (data.IS_ACTIVE !== undefined) {
    const validValues = ['Y', 'N', true, false, 'true', 'false'];
    const value = String(data.IS_ACTIVE).toUpperCase();
    if (!validValues.includes(value) && value !== 'TRUE' && value !== 'FALSE') {
      errors.push('IS_ACTIVE must be Y/N or true/false');
    }
  }

  return errors;
}

/**
 * @route   GET /api/employees
 * @desc    Get employee listing from EMPL.V_EMPLOYEE_ASSIGNMENTS_LIST with pagination and filters (incl. dynamic org via org_unit_id + level_code)
 * @query   enterpriseId (required), org_unit_id (hex, filter by ORG_STRUCTURE_LIST_JSON), level_code (optional with org_unit_id), positionId, jobFamilyId, jobLevelId, gradeId, page, page_size
 * @access  Public
 */
router.get('/', asyncHandler(getEmployees));

/**
 * @route   GET /api/employees/by-guid/:guid
 * @desc    Get single employee by GUID
 * @param   guid - Employee GUID (32-char hex)
 * @access  Public
 */
router.get('/by-guid/:guid', asyncHandler(async (req, res) => {
  try {
    const employee = await EmployeeModel.findByGuidHex(req.params.guid);
    sendEmployee(res, req, employee);
  } catch (error) {
    if (error instanceof ValidationError) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to fetch employee', error);
  }
}));

/**
 * @route   GET /api/employees/:idOrGuid/full-details
 * @desc    Get single employee full details from EMPL.V_EMPLOYEE_FULL_DETAILS (employee_id or employee_guid)
 * @param   idOrGuid - employee_id (numeric) OR employee_guid (32-char hex)
 * @access  Public
 */
router.get('/:guid/full-details', asyncHandler(getEmployeeById));

/**
 * Helper function to check if a string is a 32-character hex GUID
 */
function isHex32(v) {
  return typeof v === 'string' && /^[0-9a-fA-F]{32}$/.test(v.replace(/-/g, ''));
}

/**
 * Helper function to normalize GUID (remove hyphens, uppercase)
 */
function normalizeHex32(v) {
  return typeof v === 'string' ? v.trim().replace(/-/g, '').toUpperCase() : v;
}

/**
 * @route   GET /api/employees/:id
 * @desc    Get single employee by ID or GUID
 * @param   id - Employee ID (numeric) or GUID (32-char hex)
 * @access  Public
 */
router.get('/:id', asyncHandler(async (req, res) => {
  try {
    const idParam = req.params.id;
    const normalizedId = normalizeHex32(idParam);
    
    // Check if it's a GUID (32-char hex)
    if (isHex32(normalizedId)) {
      const employee = await EmployeeModel.findByGuidHex(normalizedId);
      sendEmployee(res, req, employee);
      return;
    }
    
    // Otherwise, treat as numeric ID
    const enterpriseId = getEnterprise(req);
    if (!enterpriseId || isNaN(enterpriseId)) {
      return sendBadRequest(res, req, 'ENTERPRISE_ID is required');
    }

    const employeeId = parseInt(idParam);
    
    if (isNaN(employeeId)) {
      return sendBadRequest(res, req, 'Invalid EMPLOYEE_ID format. Must be numeric ID or 32-character GUID');
    }

    const employee = await EmployeeModel.findById(enterpriseId, employeeId);
    sendEmployee(res, req, employee);
  } catch (error) {
    if (error instanceof ValidationError) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to fetch employee', error);
  }
}));

/**
 * @route   POST /api/employees
 * @desc    Create a new employee
 * @body    { FIRST_NAME, LAST_NAME, EMAIL, PHONE_NUMBER, DATE_OF_BIRTH, ... }
 * @access  Public
 */
/**
 * @route   POST /api/create-employee
 * @desc    Create employee via EMPL.EMPL_EMPLOYEE_CREATE_API_PKG.CREATE_EMPLOYEE_ALL_IN_ONE (all logic in PL/SQL)
 * @body    Example request JSON (see below)
 * @access  Public
 *
 * Example request JSON:
 * {
 *   "enterprise_id": 1,
 *   "first_name_en": "Ahmed",
 *   "last_name_en": "Ali",
 *   "email": "ahmed.ali@example.com",
 *   "phone_number": "+96550000000",
 *   "date_of_birth": "1990-05-15",
 *   "gender_code": "M",
 *   "nationality": "KW",
 *   "contact_name": "Sara Ali",
 *   "relationship": "Spouse",
 *   "emerg_phone": "+96551111111",
 *   "work_schedule_id": 1,
 *   "bank_code": "BANK01",
 *   "account_number": "1234567890",
 *   "org_unit_id_hex": "A1B2C3D4E5F60718293A4B5C6D7E8F90",
 *   "enterprise_hire_date": "2024-01-01",
 *   "contract_type_code": "FULL_TIME",
 *   "employment_status": "ACTIVE",
 *   "housing_kwd": 150,
 *   "transport_kwd": 50,
 *   "other_kwd": 0
 * }
 *
 * Form-data (multipart): same fields as form fields + optional file field "document".
 * When "document" is uploaded, doc_file_name, doc_mime_type, doc_access_url, doc_hash_sha256 are set from the file.
 */
async function createEmployeeAllInOneHandler(req, res) {
  const body = { ...(req.body || {}) };

  // Force-read from raw req.body (form-data keys can vary)
  const raw = req.body || {};
  const civilVal = fromBody(raw, 'civil_id_number', 'civilIdNumber', 'CIVIL_ID_NUMBER', 'civil_id', 'CIVIL_ID', 'civil_number', 'civilID');
  let passportVal = fromBody(raw, 'passport_number', 'passportNumber', 'PASSPORT_NUMBER', 'passport', 'PASSPORT', 'passport_no', 'passportNo', 'PASSPORT_NO');
  if (passportVal == null) passportVal = fromBodyKeyContains(raw, 'passport');
  const visaVal = fromBody(raw, 'visa_number', 'visaNumber', 'VISA_NUMBER', 'visa_no', 'visaNo', 'VISA_NO');
  const visaExpiryVal = raw.visa_expiry ?? raw.visaExpiry ?? raw.VISA_EXPIRY;
  const workPermitNumVal = fromBody(raw, 'work_permit_number', 'workPermitNumber', 'WORK_PERMIT_NUMBER', 'work_permit_no', 'workPermitNo');
  const workPermitExpiryVal = raw.work_permit_expiry ?? raw.workPermitExpiry ?? raw.WORK_PERMIT_EXPIRY ?? raw.work_permit_expiry_date ?? raw.workPermitExpiryDate;
  if (civilVal != null) body.civil_id_number = civilVal;
  if (passportVal != null) body.passport_number = passportVal;
  if (visaVal != null) body.visa_number = visaVal;
  if (visaExpiryVal != null && String(visaExpiryVal).trim() !== '' && String(visaExpiryVal).toLowerCase() !== 'null') body.visa_expiry = visaExpiryVal;
  if (workPermitNumVal != null) body.work_permit_number = workPermitNumVal;
  if (workPermitExpiryVal != null && String(workPermitExpiryVal).trim() !== '' && String(workPermitExpiryVal).toLowerCase() !== 'null') body.work_permit_expiry = workPermitExpiryVal;

  // Normalize document fields from form/JSON (so buildBinds sees them)
  const docFileNameRaw = raw.doc_file_name ?? raw.docFileName ?? raw.DOC_FILE_NAME ?? raw.file_name ?? raw.fileName ?? raw.document_file_name;
  const docTypeRaw = raw.document_type_code ?? raw.documentTypeCode ?? raw.DOCUMENT_TYPE_CODE;
  const docUrlRaw = raw.doc_access_url ?? raw.docAccessUrl ?? raw.DOC_ACCESS_URL;
  const docMimeRaw = raw.doc_mime_type ?? raw.docMimeType ?? raw.DOC_MIME_TYPE;
  const docHashRaw = raw.doc_hash_sha256 ?? raw.docHashSha256 ?? raw.DOC_HASH_SHA256;
  if (docFileNameRaw != null && String(docFileNameRaw).trim() !== '') body.doc_file_name = String(docFileNameRaw).trim();
  if (docTypeRaw != null && String(docTypeRaw).trim() !== '') body.document_type_code = String(docTypeRaw).trim();
  if (docUrlRaw != null && String(docUrlRaw).trim() !== '') body.doc_access_url = String(docUrlRaw).trim();
  if (docMimeRaw != null && String(docMimeRaw).trim() !== '') body.doc_mime_type = String(docMimeRaw).trim();
  if (docHashRaw != null && String(docHashRaw).trim() !== '') body.doc_hash_sha256 = String(docHashRaw).trim();

  // If a file was uploaded, save it, compute hash, and set document fields for the procedure
  if (req.file) {
    const hash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    const ext = path.extname(req.file.originalname) || '';
    const base = path.basename(req.file.originalname, ext).replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = `${crypto.randomUUID()}${base ? `-${base}` : ''}${ext}`;
    const filepath = path.join(UPLOADS_EMPLOYEES_DIR, filename);
    fs.writeFileSync(filepath, req.file.buffer);
    body.doc_file_name = req.file.originalname || filename;
    body.doc_mime_type = req.file.mimetype || 'application/octet-stream';
    body.doc_access_url = `/uploads/employees/${filename}`;
    body.doc_hash_sha256 = hash;
    if (body.document_type_code == null || body.document_type_code === '') {
      body.document_type_code = 'EMPLOYEE_DOC';
    }
  }

  const validation = validateRequired(body);
  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      message: `Missing or invalid required field(s): ${validation.missing.join(', ')}`,
      details: null
    });
  }

  const enterpriseId = Number(body.enterprise_id ?? body.ENTERPRISE_ID ?? getEnterprise(req));
  let connection;
  try {
    connection = await getConnection();
    const { employeeId } = await createEmployeeAllInOne(connection, body);
    const data = await getEmployeeListRowByEmployeeId(employeeId);
    res.status(201).json({
      success: true,
      employee_id: employeeId,
      ...(data != null && { data })
    });
  } catch (err) {
    const message = err.message || String(err);
    const friendly = getCreateEmployeeFriendlyMessage(message);
    const status = friendly.status ?? 500;
    const details = err.errorNum != null
      ? `ORA-${String(err.errorNum).padStart(5, '0')}: ${message}`
      : message;
    return res.status(status).json({
      success: false,
      message: friendly.message,
      details
    });
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) {}
    }
  }
}

// Canonical URL: POST {{baseUrl}}/api/create-employee
const createEmployeeRouter = express.Router();
createEmployeeRouter.post('/create-employee', maybeMulterAllInOne, asyncHandler(createEmployeeAllInOneHandler));

router.post('/', asyncHandler(async (req, res) => {
  try {
    const data = req.body;
    const errors = validateEmployeeData(data, false);

    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    const enterpriseId = getEnterprise(req);
    if (!enterpriseId || isNaN(enterpriseId)) {
      return sendBadRequest(res, req, 'ENTERPRISE_ID is required');
    }

    const userId = getUserId(req);
    const newEmployee = await EmployeeModel.create(data, enterpriseId, userId);
    sendCreated(res, req, newEmployee);
  } catch (error) {
    if (error instanceof ValidationError) {
      return sendBadRequest(res, req, error.message || 'Validation failed');
    }
    sendServerError(res, req, 'Failed to create employee', error);
  }
}));

/**
 * @route   PUT /api/employees/:id
 * @desc    Update an existing employee
 * @param   id - Employee ID (numeric) or GUID (32-char hex)
 * @body    { FIRST_NAME?, LAST_NAME?, EMAIL?, ... }
 * @access  Public
 */
router.put('/:id', asyncHandler(async (req, res) => {
  try {
    const idParam = req.params.id;
    const normalizedId = normalizeHex32(idParam);
    
    let enterpriseId;
    let employeeId;
    let employeeGuid = null;
    
    // Check if it's a GUID (32-char hex)
    if (isHex32(normalizedId)) {
      // For GUID lookup, we need to find the employee first to get enterprise_id
      const existingEmployee = await EmployeeModel.findByGuidHex(normalizedId);
      if (!existingEmployee) {
        return sendEmployee(res, req, null);
      }
      enterpriseId = existingEmployee.enterprise_id;
      employeeId = existingEmployee.employee_id;
      employeeGuid = normalizedId;
    } else {
      // Otherwise, treat as numeric ID
      enterpriseId = getEnterprise(req);
      if (!enterpriseId || isNaN(enterpriseId)) {
        return sendBadRequest(res, req, 'ENTERPRISE_ID is required');
      }

      employeeId = parseInt(idParam);
      
      if (isNaN(employeeId)) {
        return sendBadRequest(res, req, 'Invalid EMPLOYEE_ID format. Must be numeric ID or 32-character GUID');
      }
    }

    const data = req.body;
    const errors = validateEmployeeData(data, true);

    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Check if employee exists (if not already checked for GUID)
    if (!employeeGuid) {
      const existingEmployee = await EmployeeModel.findById(enterpriseId, employeeId);
      if (!existingEmployee) {
        return sendEmployee(res, req, null);
      }
    }

    const userId = getUserId(req);
    const updatedEmployee = await EmployeeModel.update(enterpriseId, employeeId, data, userId);
    sendUpdated(res, req, updatedEmployee);
  } catch (error) {
    if (error instanceof ValidationError) {
      return sendBadRequest(res, req, error.message || 'Validation failed');
    }
    sendServerError(res, req, 'Failed to update employee', error);
  }
}));

/**
 * @route   DELETE /api/employees/:id
 * @desc    Delete an employee (hard delete)
 * @param   id - Employee ID (numeric) or GUID (32-char hex)
 * @access  Public
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  try {
    const idParam = req.params.id;
    const normalizedId = normalizeHex32(idParam);
    
    let enterpriseId;
    let employeeId;
    
    let employeeToDelete;
    
    // Check if it's a GUID (32-char hex)
    if (isHex32(normalizedId)) {
      // For GUID lookup, we need to find the employee first to get enterprise_id and employee_id
      employeeToDelete = await EmployeeModel.findByGuidHex(normalizedId);
      if (!employeeToDelete) {
        return sendEmployee(res, req, null);
      }
      enterpriseId = employeeToDelete.enterprise_id;
      employeeId = employeeToDelete.employee_id;
    } else {
      // Otherwise, treat as numeric ID
      enterpriseId = getEnterprise(req);
      if (!enterpriseId || isNaN(enterpriseId)) {
        return sendBadRequest(res, req, 'ENTERPRISE_ID is required');
      }

      employeeId = parseInt(idParam);
      
      if (isNaN(employeeId)) {
        return sendBadRequest(res, req, 'Invalid EMPLOYEE_ID format. Must be numeric ID or 32-character GUID');
      }
      
      // Get the employee data before deleting
      employeeToDelete = await EmployeeModel.findById(enterpriseId, employeeId);
      if (!employeeToDelete) {
        return sendEmployee(res, req, null);
      }
    }

    // Delete the employee
    const result = await EmployeeModel.remove(enterpriseId, employeeId);
    sendDeleted(res, req, 'Employee deleted successfully', employeeToDelete);
  } catch (error) {
    sendServerError(res, req, 'Failed to delete employee', error);
  }
}));

export default router;
export { createEmployeeRouter };
