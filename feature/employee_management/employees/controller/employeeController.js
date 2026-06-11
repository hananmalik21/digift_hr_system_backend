import express from 'express';
import multer from 'multer';
import oracledb from 'oracledb';
import EmployeeModel from '../model/employeeModel.js';
import PositionsModel from '../../../enterprise_structure/positions/model/positions_model.js';
import { getConnection } from '../../../../config/db.js';
import {
  validateRequired,
  createEmployeeAllInOne,
  insertDocument,
  updateDocumentAccessUrl,
  fromBody,
  fromBodyKeyContains
} from '../services/employeeCreateAllInOneService.js';
import { generatePasswordWithHash } from '../services/passwordService.js';
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
import { ValidationError } from '../../../../utils/errors/index.js';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  requireActingUserId,
  getActingUsername,
  employeeAccessJoin,
  employeeAccessOptionsFromReq,
  logSecuredAccess
} from '../../../../utils/userContext.js';
import { IS_DEV_MODE } from '../../../../utils/env.js';

const router = express.Router();

const uploadAllInOne = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, true)
}).fields([{ name: 'file', maxCount: 1 }, { name: 'document', maxCount: 1 }]);

function maybeMulterAllInOne(req, res, next) {
  const contentType = (req.headers['content-type'] || '').toLowerCase();
  if (!contentType.includes('multipart/form-data')) {
    return next();
  }
  uploadAllInOne(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'File too large (max 10MB)'
        : err.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Use only one file field: "file" or "document"'
          : (err.message || 'File upload error');
      return res.status(400).json({ success: false, message: msg, details: err.code || null });
    }
    next();
  });
}

function getUploadedFile(req) {
  const files = req.files;
  if (!files) return null;
  return files.file?.[0] ?? files.document?.[0] ?? null;
}

router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

function getEnterprise(req) {
  const v = req.query.enterprise_id ?? req.body.ENTERPRISE_ID ?? process.env.DEFAULT_ENTERPRISE_ID;
  return Number(v);
}

function getEnterpriseIdForEmployee(req) {
  const v = req.user?.enterprise_id ?? req.headers['x-enterprise-id'] ?? getEnterprise(req);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolve the audit actor (string username) for CREATED_BY / LAST_UPDATED_BY.
 * Sourced from the verified JWT (no header / body fallback) and falls back to
 * 'SYSTEM' for unauthenticated internal flows.
 */
function getUserId(req) {
  return getActingUsername(req) ?? 'SYSTEM';
}

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

function buildEmployeeListWhereAndBinds(filters) {
  const hasJsonFilter = filters.org_unit_id_hex != null && filters.org_unit_id_hex !== '';
  const hasLevelCode = hasJsonFilter && filters.level_code != null && filters.level_code !== '';
  const employeeStatusTrimmed = filters.employee_status != null && String(filters.employee_status).trim() !== ''
    ? String(filters.employee_status).trim().toUpperCase()
    : null;
  const searchTrimmed = filters.search != null && String(filters.search).trim() !== ''
    ? String(filters.search).trim()
    : null;

  const conditions = [
    'v.ENTERPRISE_ID = :enterprise_id',
    '(:position_id IS NULL OR v.POSITION_ID = :position_id)',
    '(:job_family_id IS NULL OR v.JOB_FAMILY_ID = :job_family_id)',
    '(:job_level_id IS NULL OR v.JOB_LEVEL_ID = :job_level_id)',
    '(:grade_id IS NULL OR v.GRADE_ID = :grade_id)'
  ];

  const sharedBinds = {
    user_id: filters.userId,
    enterprise_id: filters.enterpriseId,
    // position_id is a RAW(16) column; bind explicitly so a null value does not
    // default to STRING and trigger an ORA-00932 (inconsistent datatypes).
    position_id: {
      val: filters.positionId ?? null,
      dir: oracledb.BIND_IN,
      type: oracledb.DB_TYPE_RAW,
      maxSize: 16
    },
    job_family_id: filters.jobFamilyId ?? null,
    job_level_id: filters.jobLevelId ?? null,
    grade_id: filters.gradeId ?? null
  };

  if (hasJsonFilter) {
    if (hasLevelCode) {
      conditions.push(
        `JSON_EXISTS(v.ORG_STRUCTURE_LIST_JSON, '$[*]?(@.level_code == $lvl && @.org_unit_id == $oid)' PASSING :org_unit_id_hex AS "oid", :level_code AS "lvl")`
      );
      sharedBinds.org_unit_id_hex = filters.org_unit_id_hex;
      sharedBinds.level_code = filters.level_code;
    } else {
      conditions.push(
        `JSON_EXISTS(v.ORG_STRUCTURE_LIST_JSON, '$[*]?(@.org_unit_id == $oid)' PASSING :org_unit_id_hex AS "oid")`
      );
      sharedBinds.org_unit_id_hex = filters.org_unit_id_hex;
    }
  }

  if (employeeStatusTrimmed) {
    conditions.push('v.EMPLOYEE_STATUS = :employee_status');
    sharedBinds.employee_status = employeeStatusTrimmed;
  }

  if (searchTrimmed) {
    conditions.push("v.SEARCH_KEY LIKE '%' || UPPER(:search_key) || '%'");
    sharedBinds.search_key = searchTrimmed;
  }

  // FNDSEC DB-level data access: only rows the acting user is authorized to see
  // are returned (see FNDSEC.FNDSEC_DATA_ACCESS_PKG.CAN_ACCESS_EMPLOYEE).
  const accessOptions = filters.bypassEmployeeAccess ? { bypass: true } : undefined;
  const baseFrom = `EMPL.V_EMPLOYEE_ASSIGNMENTS_LIST v
    ${employeeAccessJoin('v.ENTERPRISE_ID', 'v.EMPLOYEE_ID', ':user_id', accessOptions)}`;

  const whereClause = conditions.join(' AND ');
  const countSql = `SELECT COUNT(*) AS total_records FROM ${baseFrom} WHERE ${whereClause}`;

  const dataBinds = { ...sharedBinds, offset: filters.offset, page_size: filters.pageSize };
  const dataSql = `SELECT v.* FROM ${baseFrom} WHERE ${whereClause}
  ORDER BY v.EMPLOYEE_ID NULLS LAST
  OFFSET :offset ROWS FETCH NEXT :page_size ROWS ONLY`;

  return { countSql, dataSql, countBinds: sharedBinds, dataBinds };
}

function hexToBuffer(hex) {
  if (hex == null || typeof hex !== 'string') return null;
  const s = hex.trim().replace(/-/g, '');
  if (!/^[0-9A-Fa-f]{32}$/.test(s)) return null;
  return Buffer.from(s, 'hex');
}

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

function isPositionObjEmpty(obj) {
  if (!obj || typeof obj !== 'object') return true;
  return Object.values(obj).every(v => v == null || v === '');
}

function toMinimalPosition(obj) {
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

function buildPositionFromRow(r) {
  const positionId = r.POSITION_ID ?? r.position_id;
  if (positionId == null) return null;
  return toMinimalPosition({
    position_id: positionId,
    position_code: r.POSITION_CODE ?? r.position_code,
    status: r.POSITION_STATUS ?? r.position_status,
    position_title_en: r.POSITION_NAME_EN ?? r.POSITION_TITLE_EN ?? r.position_name_en ?? r.position_title_en
  });
}

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
  let posObj = safeJson(posRaw);
  if (typeof posObj === 'object' && posObj !== null && isPositionObjEmpty(posObj)) posObj = null;
  const rawPosition = (typeof posObj === 'object' && posObj !== null) ? posObj : buildPositionFromRow(r);
  r.position = toMinimalPosition(rawPosition);
  delete r.POSITION_OBJ;
  delete r.POSITION_OBJ_JSON;
  delete r.position_obj_json;
  delete r.position_obj;
  delete r.SEARCH_KEY;
  delete r.search_key;

  return r;
}

function toHex(val) {
  if (val == null) return null;
  if (val instanceof Buffer) return val.toString('hex').toUpperCase();
  if (typeof val === 'string') return val.trim();
  return null;
}

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

function parseJsonToObjectOrNull(value) {
  if (value == null) return null;
  if (typeof value === 'object' && !(value instanceof Buffer) && !(value instanceof Date)) return value;
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!s || s.toLowerCase() === 'null') return null;
  try {
    const parsed = JSON.parse(s);
    return parsed != null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (err) {
    console.warn('Failed to parse WORK_LOCATION_OBJ:', err?.message ?? String(err));
    return null;
  }
}

function dateToIso(val) {
  if (val == null) return null;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'string') return val;
  return null;
}

const EMPLOYEE_TABLE_COLUMNS = new Set([
  'EMPLOYEE_ID', 'EMPLOYEE_GUID', 'ENTERPRISE_ID',
  'FIRST_NAME_EN', 'MIDDLE_NAME_EN', 'LAST_NAME_EN',
  'FIRST_NAME_AR', 'MIDDLE_NAME_AR', 'LAST_NAME_AR', 'FAMILY_NAME_AR',
  'EMAIL', 'PHONE_NUMBER', 'MOBILE_NUMBER', 'DATE_OF_BIRTH',
  'STATUS', 'IS_ACTIVE', 'CREATED_BY', 'CREATION_DATE', 'LAST_UPDATED_BY', 'LAST_UPDATE_DATE',
  'EMPLOYEE_STATUS', 'EMPLOYEE_IS_ACTIVE'
]);

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

export function mapRowToFullDetailsShape(row) {
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

  const documentsRaw = parseJsonToArray(row.DOCUMENTS_JSON ?? row.documents_json);
  const documents = !Array.isArray(documentsRaw) || documentsRaw.length === 0
    ? []
    : documentsRaw.map((doc) => {
        const guid = doc.document_guid ?? doc.documentGuid ?? doc.DOCUMENT_GUID;
        if (guid == null) return doc;
        const guidStr = String(guid).trim();
        if (guidStr === '') return doc;
        const guidHex = guidStr.replace(/-/g, '').toLowerCase();
        if (guidHex.length !== 32) return doc;
        const url = `/documents/${guidHex}/download`;
        const needsAccess = doc.access_url == null || doc.access_url === '';
        const needsDownload = doc.download_url == null || doc.download_url === '';
        if (!needsAccess && !needsDownload) return doc;
        const d = { ...doc };
        if (needsAccess) d.access_url = url;
        if (needsDownload) d.download_url = url;
        return d;
      });
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

  const budgetedMinKd = row.BUDGETED_MIN_KD ?? row.budgeted_min_kd ?? null;
  const budgetedMaxKd = row.BUDGETED_MAX_KD ?? row.budgeted_max_kd ?? null;
  assignmentOut.budgeted_min_kd = budgetedMinKd;
  assignmentOut.budgeted_max_kd = budgetedMaxKd;

  const positionIdVal = row.POSITION_ID ?? row.position_id ?? groups.assignment.POSITION_ID ?? groups.assignment.position_id;
  const positionId = positionIdVal != null && typeof positionIdVal === 'object' && Buffer.isBuffer(positionIdVal)
    ? toHex(positionIdVal)
    : (positionIdVal != null ? positionIdVal : null);
  if (positionId != null) {
    assignmentOut.position = {
      position_id: positionId,
      position_code: row.POSITION_CODE ?? row.position_code ?? null,
      status: row.POSITION_STATUS ?? row.position_status ?? null,
      position_title_en: row.POSITION_NAME_EN ?? row.POSITION_TITLE_EN ?? row.position_name_en ?? row.position_title_en ?? null,
      budgeted_min_kd: budgetedMinKd,
      budgeted_max_kd: budgetedMaxKd
    };
  } else {
    assignmentOut.position = null;
  }

  const jobFamilyIdVal = row.JOB_FAMILY_ID ?? row.job_family_id ?? assignmentOut.job_family_id;
  const jobFamilyId = jobFamilyIdVal != null && typeof jobFamilyIdVal === 'object' && Buffer.isBuffer(jobFamilyIdVal)
    ? toHex(jobFamilyIdVal)
    : (jobFamilyIdVal != null ? jobFamilyIdVal : null);
  if (jobFamilyId != null) {
    assignmentOut.job_family = {
      job_family_id: jobFamilyId,
      job_family_code: row.JOB_FAMILY_CODE ?? row.job_family_code ?? null,
      job_family_name_en: row.JOB_FAMILY_NAME_EN ?? row.job_family_name_en ?? null,
      job_family_name_ar: row.JOB_FAMILY_NAME_AR ?? row.job_family_name_ar ?? null,
      job_family_status: row.JOB_FAMILY_STATUS ?? row.job_family_status ?? null
    };
  } else {
    assignmentOut.job_family = null;
  }

  const jobLevelIdVal = row.JOB_LEVEL_ID ?? row.job_level_id ?? assignmentOut.job_level_id;
  const jobLevelId = jobLevelIdVal != null && typeof jobLevelIdVal === 'object' && Buffer.isBuffer(jobLevelIdVal)
    ? toHex(jobLevelIdVal)
    : (jobLevelIdVal != null ? jobLevelIdVal : null);
  if (jobLevelId != null) {
    assignmentOut.job_level = {
      job_level_id: jobLevelId,
      job_level_code: row.JOB_LEVEL_CODE ?? row.job_level_code ?? null,
      job_level_name_en: row.JOB_LEVEL_NAME_EN ?? row.job_level_name_en ?? null,
      min_grade_id: row.JOB_LEVEL_MIN_GRADE_ID ?? row.job_level_min_grade_id ?? null,
      max_grade_id: row.JOB_LEVEL_MAX_GRADE_ID ?? row.job_level_max_grade_id ?? null,
      job_level_status: row.JOB_LEVEL_STATUS ?? row.job_level_status ?? null
    };
  } else {
    assignmentOut.job_level = null;
  }

  const gradeIdVal = row.GRADE_ID ?? row.grade_id ?? assignmentOut.grade_id;
  const gradeId = gradeIdVal != null && typeof gradeIdVal === 'object' && Buffer.isBuffer(gradeIdVal)
    ? toHex(gradeIdVal)
    : (gradeIdVal != null ? gradeIdVal : null);
  if (gradeId != null) {
    assignmentOut.grade = {
      grade_id: gradeId,
      grade_number: row.GRADE_NUMBER ?? row.grade_number ?? null,
      grade_category: row.GRADE_CATEGORY ?? row.grade_category ?? null,
      currency_code: row.GRADE_CURRENCY_CODE ?? row.grade_currency_code ?? null,
      step_1_salary: row.GRADE_STEP_1_SALARY ?? row.grade_step_1_salary ?? null,
      step_2_salary: row.GRADE_STEP_2_SALARY ?? row.grade_step_2_salary ?? null,
      step_3_salary: row.GRADE_STEP_3_SALARY ?? row.grade_step_3_salary ?? null,
      step_4_salary: row.GRADE_STEP_4_SALARY ?? row.grade_step_4_salary ?? null,
      step_5_salary: row.GRADE_STEP_5_SALARY ?? row.grade_step_5_salary ?? null,
      grade_status: row.GRADE_STATUS ?? row.grade_status ?? null
    };
  } else {
    assignmentOut.grade = null;
  }

  const workLocationObjRaw = row.WORK_LOCATION_OBJ ?? row.work_location_obj ?? (() => {
    const k = Object.keys(row || {}).find(key => String(key).toUpperCase() === 'WORK_LOCATION_OBJ');
    return k != null ? row[k] : undefined;
  })();
  assignmentOut.workLocationObj = parseJsonToObjectOrNull(workLocationObjRaw);

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

const buildFullDetailsSqlById = (accessOptions) => `
  SELECT v.*
  FROM EMPL.V_EMPLOYEE_FULL_DETAILS v
  ${employeeAccessJoin('v.ENTERPRISE_ID', 'v.EMPLOYEE_ID', ':user_id', accessOptions)}
  WHERE v.ENTERPRISE_ID = :enterprise_id AND v.EMPLOYEE_ID = :employee_id
`;

const buildFullDetailsSqlByGuid = (accessOptions) => `
  SELECT v.*
  FROM EMPL.V_EMPLOYEE_FULL_DETAILS v
  ${employeeAccessJoin('v.ENTERPRISE_ID', 'v.EMPLOYEE_ID', ':user_id', accessOptions)}
  WHERE v.ENTERPRISE_ID = :enterprise_id AND v.EMPLOYEE_GUID = HEXTORAW(:employee_guid_hex)
`;

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

  const actingUserId = requireActingUserId(req, res);
  if (actingUserId == null) return; // 401 already sent

  const binds = isGuid
    ? { user_id: actingUserId, enterprise_id: enterpriseId, employee_guid_hex: normalizedGuid }
    : { user_id: actingUserId, enterprise_id: enterpriseId, employee_id: parseInt(param, 10) };

  const accessOptions = employeeAccessOptionsFromReq(req);
  let connection;
  try {
    connection = await getConnection();
    const opts = { outFormat: oracledb.OUT_FORMAT_OBJECT };
    const sql = isGuid ? buildFullDetailsSqlByGuid(accessOptions) : buildFullDetailsSqlById(accessOptions);
    const result = await connection.execute(sql, binds, opts);
    const row = result.rows?.[0] ?? null;
    if (!row) return sendNotFound(res, req, 'Employee not found');

    const data = mapRowToFullDetailsShape(rowRawToHex(row));

    logSecuredAccess('GET /api/employees/:guid', {
      user_id: actingUserId,
      enterprise_id: enterpriseId,
      employee: isGuid ? normalizedGuid : param,
      allowed: 'Y'
    });

    res.json({ success: true, message: 'Employee fetched successfully', data });
  } catch (err) {
    if (IS_DEV_MODE) {
      console.error('[GET /api/employees/:guid][FNDSEC] user_id=%s enterprise_id=%s error=%s',
        actingUserId, enterpriseId, err?.message ?? String(err));
    }
    // Do not expose raw Oracle errors to frontend.
    sendServerError(res, req, 'Failed to fetch employee full details');
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

  const actingUserId = requireActingUserId(req, res);
  if (actingUserId == null) return; // 401 already sent

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
  const searchRaw = q.search != null && String(q.search).trim() !== '' ? String(q.search).trim() : null;
  const employeeStatusRaw = (q.employee_status ?? q.employeeStatus) != null && String(q.employee_status ?? q.employeeStatus).trim() !== ''
    ? String(q.employee_status ?? q.employeeStatus).trim()
    : null;
  const filters = {
    userId: actingUserId,
    enterpriseId,
    bypassEmployeeAccess: employeeAccessOptionsFromReq(req).bypass,
    org_unit_id_hex: orgUnitIdHexForJson,
    level_code: levelCodeRaw ?? null,
    positionId: positionIdBuf,
    jobFamilyId: Number.isFinite(jobFamilyId) ? jobFamilyId : null,
    jobLevelId: Number.isFinite(jobLevelId) ? jobLevelId : null,
    gradeId: Number.isFinite(gradeId) ? gradeId : null,
    offset,
    pageSize,
    search: searchRaw,
    employee_status: employeeStatusRaw
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

    logSecuredAccess('GET /api/employees', {
      user_id: actingUserId,
      enterprise_id: enterpriseId,
      returned: data.length,
      total: totalRecords
    });

    sendEmployeeList(res, req, data, {
      total: totalRecords,
      pagination: paginationMeta
    });
  } catch (err) {
    if (IS_DEV_MODE) {
      console.error('[GET /api/employees][FNDSEC] user_id=%s enterprise_id=%s error=%s',
        actingUserId, enterpriseId, err?.message ?? String(err));
    }
    // Do not expose raw Oracle errors to frontend.
    sendServerError(res, req, 'Failed to fetch employees');
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}

function getCreateEmployeeFriendlyMessage(message) {
  const m = String(message);

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

  if (m.includes('ORA-20001') && /EMAIL\s+already\s+exists\s+for\s+this\s+enterprise/i.test(m)) {
    return {
      message: 'An employee with this email already exists for this enterprise. Please use a different email.',
      status: 409
    };
  }

  if (m.includes('ORA-20001')) {
    const match = m.match(/ORA-20001:\s*([^.\n]+(?:\.|$))/g);
    const last = match ? match[match.length - 1] : null;
    const text = last ? last.replace(/^ORA-20001:\s*/i, '').trim() : m;
    return { message: text || 'Employee creation failed. Please check your data and try again.' };
  }

  return { message: m };
}

function validateEmployeeData(data, isUpdate = false) {
  const errors = [];

  const firstName = data.FIRST_NAME_EN ?? data.FIRST_NAME;
  const lastName = data.LAST_NAME_EN ?? data.LAST_NAME;

  if (!isUpdate) {
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

  if (data.STATUS !== undefined) {
    const validStatuses = ['DRAFT', 'ACTIVE', 'INACTIVE', 'TERMINATED'];
    if (!validStatuses.includes(String(data.STATUS).toUpperCase())) {
      errors.push(`STATUS must be one of: ${validStatuses.join(', ')}`);
    }
  }

  if (data.IS_ACTIVE !== undefined) {
    const validValues = ['Y', 'N', true, false, 'true', 'false'];
    const value = String(data.IS_ACTIVE).toUpperCase();
    if (!validValues.includes(value) && value !== 'TRUE' && value !== 'FALSE') {
      errors.push('IS_ACTIVE must be Y/N or true/false');
    }
  }

  return errors;
}

router.get('/', asyncHandler(getEmployees));

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

router.get('/:guid/full-details', asyncHandler(getEmployeeById));

function isHex32(v) {
  return typeof v === 'string' && /^[0-9a-fA-F]{32}$/.test(v.replace(/-/g, ''));
}

function normalizeHex32(v) {
  return typeof v === 'string' ? v.trim().replace(/-/g, '').toUpperCase() : v;
}

router.get('/:id', asyncHandler(async (req, res) => {
  try {
    const idParam = req.params.id;
    const normalizedId = normalizeHex32(idParam);

    if (isHex32(normalizedId)) {
      const employee = await EmployeeModel.findByGuidHex(normalizedId);
      sendEmployee(res, req, employee);
      return;
    }

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

async function createEmployeeAllInOneHandler(req, res) {
  const body = { ...(req.body || {}) };
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

  const docTypeRaw = raw.document_type_code ?? raw.documentTypeCode ?? raw.DOCUMENT_TYPE_CODE;
  if (docTypeRaw != null && String(docTypeRaw).trim() !== '') body.document_type_code = String(docTypeRaw).trim();
  const uploadedFile = getUploadedFile(req);
  if (!uploadedFile) {
    const docFileNameRaw = raw.doc_file_name ?? raw.docFileName ?? raw.DOC_FILE_NAME ?? raw.file_name ?? raw.fileName;
    const docUrlRaw = raw.doc_access_url ?? raw.docAccessUrl ?? raw.DOC_ACCESS_URL;
    const docMimeRaw = raw.doc_mime_type ?? raw.docMimeType ?? raw.DOC_MIME_TYPE;
    const docHashRaw = raw.doc_hash_sha256 ?? raw.docHashSha256 ?? raw.DOC_HASH_SHA256;
    if (docFileNameRaw != null && String(docFileNameRaw).trim() !== '') body.doc_file_name = String(docFileNameRaw).trim();
    if (docUrlRaw != null && String(docUrlRaw).trim() !== '') body.doc_access_url = String(docUrlRaw).trim();
    if (docMimeRaw != null && String(docMimeRaw).trim() !== '') body.doc_mime_type = String(docMimeRaw).trim();
    if (docHashRaw != null && String(docHashRaw).trim() !== '') body.doc_hash_sha256 = String(docHashRaw).trim();
  }

  const validation = validateRequired(body);
  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      message: `Missing or invalid required field(s): ${validation.missing.join(', ')}`,
      details: null
    });
  }

  const { plainPassword, passwordHash } = await generatePasswordWithHash();
  body.password_hash = passwordHash;

  let connection;
  try {
    connection = await getConnection();
    const { employeeId } = await createEmployeeAllInOne(connection, body);
    if (uploadedFile) {
      const documentTypeCode = body.document_type_code ?? raw.documentTypeCode ?? raw.document_type_code ?? 'EMPLOYEE_DOC';
      const createdBy = req.user?.username ?? 'API';
      const { documentGuid } = await insertDocument(connection, {
        employeeId,
        documentTypeCode,
        fileName: uploadedFile.originalname || 'document',
        mimeType: uploadedFile.mimetype || 'application/octet-stream',
        fileContent: uploadedFile.buffer,
        createdBy
      });
      const downloadUrl = `/documents/${documentGuid}/download`;
      await updateDocumentAccessUrl(connection, documentGuid, downloadUrl);
    }
    const data = await getEmployeeListRowByEmployeeId(employeeId);
    res.status(201).json({
      success: true,
      employee_id: employeeId,
      generated_password: plainPassword,
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

router.put('/:id', asyncHandler(async (req, res) => {
  try {
    const idParam = req.params.id;
    const normalizedId = normalizeHex32(idParam);
    
    let enterpriseId;
    let employeeId;
    let employeeGuid = null;

    if (isHex32(normalizedId)) {
      const existingEmployee = await EmployeeModel.findByGuidHex(normalizedId);
      if (!existingEmployee) {
        return sendEmployee(res, req, null);
      }
      enterpriseId = existingEmployee.enterprise_id;
      employeeId = existingEmployee.employee_id;
      employeeGuid = normalizedId;
    } else {
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

router.delete('/:id', asyncHandler(async (req, res) => {
  try {
    const idParam = req.params.id;
    const normalizedId = normalizeHex32(idParam);
    
    let enterpriseId;
    let employeeId;
    
    let employeeToDelete;

    if (isHex32(normalizedId)) {
      employeeToDelete = await EmployeeModel.findByGuidHex(normalizedId);
      if (!employeeToDelete) {
        return sendEmployee(res, req, null);
      }
      enterpriseId = employeeToDelete.enterprise_id;
      employeeId = employeeToDelete.employee_id;
    } else {
      enterpriseId = getEnterprise(req);
      if (!enterpriseId || isNaN(enterpriseId)) {
        return sendBadRequest(res, req, 'ENTERPRISE_ID is required');
      }

      employeeId = parseInt(idParam);
      
      if (isNaN(employeeId)) {
        return sendBadRequest(res, req, 'Invalid EMPLOYEE_ID format. Must be numeric ID or 32-character GUID');
      }
      employeeToDelete = await EmployeeModel.findById(enterpriseId, employeeId);
      if (!employeeToDelete) {
        return sendEmployee(res, req, null);
      }
    }

    await EmployeeModel.remove(enterpriseId, employeeId);
    sendDeleted(res, req, 'Employee deleted successfully', employeeToDelete);
  } catch (error) {
    sendServerError(res, req, 'Failed to delete employee', error);
  }
}));

function validateDocumentGuid(guid) {
  const raw = String(guid ?? '').trim().replace(/-/g, '');
  if (raw.length !== 32 || !/^[0-9a-fA-F]+$/.test(raw)) return null;
  return raw.toUpperCase();
}

const SQL_DOCUMENT_BLOB_BY_GUID = `
  SELECT FILE_NAME, MIME_TYPE, FILE_CONTENT
  FROM EMPL.DOCUMENTS
  WHERE DOCUMENT_GUID = HEXTORAW(:guid) AND IS_ACTIVE = 'Y'
`;

const documentsDownloadRouter = express.Router();
documentsDownloadRouter.get('/:documentGuid/download', asyncHandler(async (req, res) => {
  const guid = validateDocumentGuid(req.params.documentGuid);
  if (!guid) {
    return sendBadRequest(res, req, 'documentGuid must be a 32-character hex string');
  }
  let connection;
  try {
    connection = await getConnection();
    const result = await connection.execute(
      SQL_DOCUMENT_BLOB_BY_GUID,
      { guid },
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchInfo: { FILE_CONTENT: { type: oracledb.BUFFER } }
      }
    );
    const row = result.rows?.[0] ?? null;
    if (!row) {
      return sendNotFound(res, req, 'Document not found');
    }
    const fileName = row.FILE_NAME ?? row.file_name ?? 'document';
    const mimeType = row.MIME_TYPE ?? row.mime_type ?? 'application/octet-stream';
    const fileContent = row.FILE_CONTENT ?? row.file_content;
    if (fileContent == null) {
      return sendNotFound(res, req, 'Document content not found');
    }
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.send(Buffer.isBuffer(fileContent) ? fileContent : Buffer.from(fileContent));
  } catch (err) {
    sendServerError(res, req, 'Failed to download document', {
      message: err?.message ?? String(err)
    });
  } finally {
    if (connection) try { await connection.close(); } catch (_) {}
  }
}));

export default router;
export { createEmployeeRouter, documentsDownloadRouter };
