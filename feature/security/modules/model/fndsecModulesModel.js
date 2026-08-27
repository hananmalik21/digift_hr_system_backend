import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { ValidationError } from '../../../../utils/errors/index.js';
import {
  moduleGuidFromDb,
  normalizeOutGuidHex,
  parseModuleGuidHexOrThrow
} from '../utils/moduleGuid.js';
import { fetchAllFromRefCursor } from '../utils/refCursor.js';

const PKG = 'FNDSEC.FNDSEC_MODULES_API_PKG';
const CREATE_PROC = `${PKG}.CREATE_MODULE`;
const UPDATE_PROC = `${PKG}.UPDATE_MODULE`;
const DELETE_PROC = `${PKG}.DELETE_MODULE`;
const GET_PROC = `${PKG}.GET_MODULE`;
const GET_ALL_PROC = `${PKG}.GET_MODULES`;

const LOG_TAG = 'fndsecModulesModel';
const MODULE_LIST_SEARCH_MAX_LEN = 200;
export const GENERIC_ERROR_MESSAGE = 'Unable to process module request. Please try again.';
const CURSOR_FETCH_OPTIONS = { outFormat: oracledb.OUT_FORMAT_OBJECT };

function logPackageError(operation, err) {
  const ora = err?.errorNum != null ? `ORA-${err.errorNum}` : 'UNKNOWN';
  console.error(`[${LOG_TAG}] ${operation} ${ora}`, err?.message || err);
}

function safeErrorDetails(err) {
  if (!err || typeof err !== 'object') return null;
  const details = {};
  if (err.errorNum != null) details.error_num = err.errorNum;
  if (err.code != null) details.code = err.code;
  if (err.oracleCode != null) details.oracle_code = err.oracleCode;
  // ORA-06550 is a PL/SQL compilation/execution error; the message is typically
  // safe and critical for diagnosing signature/name mismatches.
  if (typeof err.message === 'string' && err.message.trim()) {
    details.oracle_message = err.message.trim().slice(0, 500);
  }
  return Object.keys(details).length ? details : null;
}

async function withConnection(fn) {
  const connection = await db.getConnection();
  try {
    return await fn(connection);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

function normalizeOutString(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return normalizeOutString(v[0]);
  const s = String(v).trim();
  return s.length ? s : null;
}

function normalizeOutNumber(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return normalizeOutNumber(v[0]);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export { packageStatusIsSuccess } from '../../../../utils/oraclePackageUtils.js';

function numOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function toIso(val) {
  if (val == null) return null;
  if (val instanceof Date && Number.isFinite(val.getTime())) return val.toISOString();
  const s = String(val).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function validateYnField(fieldName, v) {
  if (v === undefined) return;
  if (v == null) return;
  const u = String(v).trim().toUpperCase();
  if (u !== 'Y' && u !== 'N') {
    throw new ValidationError('Validation failed', [`${fieldName} must be Y or N`]);
  }
}

function parseDateOrNull(fieldName, v) {
  if (v === undefined) return undefined;
  if (v == null || String(v).trim() === '') return null;
  const d = new Date(String(v));
  if (!Number.isFinite(d.getTime())) {
    throw new ValidationError('Validation failed', [`${fieldName} must be a valid ISO date`]);
  }
  return d;
}

function validateDateRange(startDate, endDate) {
  if (startDate != null && endDate != null && startDate instanceof Date && endDate instanceof Date) {
    if (endDate.getTime() < startDate.getTime()) {
      throw new ValidationError('Validation failed', ['end_date must be on or after start_date']);
    }
  }
}

function pick(obj, ...keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of keys) {
    if (obj[k] !== undefined) return obj[k];
    const upper = String(k).toUpperCase();
    if (obj[upper] !== undefined) return obj[upper];
    const lower = String(k).toLowerCase();
    if (obj[lower] !== undefined) return obj[lower];
  }
  return null;
}

/** API-facing module shape returned by list/get endpoints. */
function mapModuleForApi(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const module_guid = moduleGuidFromDb(pick(raw, 'module_guid', 'MODULE_GUID'));
  if (!module_guid) return null;
  return {
    module_id: normalizeOutNumber(pick(raw, 'module_id', 'MODULE_ID')),
    module_guid,
    module_code: pick(raw, 'module_code') ?? null,
    module_name: pick(raw, 'module_name') ?? null,
    description: pick(raw, 'description') ?? null,
    category_code: pick(raw, 'category_code') ?? null,
    status_code: pick(raw, 'status_code') ?? null,
    icon: pick(raw, 'icon') ?? null,
    color_code: pick(raw, 'color_code') ?? null,
    display_order: pick(raw, 'display_order') != null ? Number(pick(raw, 'display_order')) : null,
    active_flag: pick(raw, 'active_flag') ?? null,
    is_system_flag: pick(raw, 'is_system_flag') ?? null,
    start_date: toIso(pick(raw, 'start_date')),
    end_date: toIso(pick(raw, 'end_date')),
    created_by: pick(raw, 'created_by') ?? null,
    creation_date: toIso(pick(raw, 'creation_date')),
    last_updated_by: pick(raw, 'last_updated_by') ?? null,
    last_update_date: toIso(pick(raw, 'last_update_date'))
  };
}

function mapCursorRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(mapModuleForApi).filter(Boolean);
}

function parsePackageOut(outBinds) {
  const ob = outBinds || {};
  return {
    status: normalizeOutString(ob.p_status) ?? 'E',
    message: normalizeOutString(ob.p_message) ?? '',
    module_id: normalizeOutNumber(ob.p_module_id),
    module_guid: normalizeOutGuidHex(ob.p_module_guid)
  };
}

function packageFailure(message = GENERIC_ERROR_MESSAGE, extra = {}) {
  return {
    success: false,
    status: 'E',
    message,
    module_guid: null,
    data: null,
    ...extra
  };
}

function buildMutationResult(out, { successMessage, module_guid = null, data = null }) {
  const success = packageStatusIsSuccess(out.status);
  return {
    success,
    status: out.status,
    message: out.message || (success ? successMessage : GENERIC_ERROR_MESSAGE),
    module_id: out.module_id,
    module_guid: module_guid ?? out.module_guid ?? null,
    data
  };
}

async function executeMutation(plsql, binds, operation, buildResult) {
  try {
    const result = await withConnection((connection) =>
      connection.execute(plsql, binds, { autoCommit: true })
    );
    return buildResult(parsePackageOut(result?.outBinds));
  } catch (err) {
    logPackageError(operation, err);
    return packageFailure(GENERIC_ERROR_MESSAGE, { error_details: safeErrorDetails(err) });
  }
}

function buildSharedModuleInBinds(input) {
  return {
    p_module_code: { val: strOrNull(input.module_code), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    p_module_name: { val: strOrNull(input.module_name), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 400 },
    p_description: { val: strOrNull(input.description), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 4000 },
    p_category_code: { val: strOrNull(input.category_code), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 60 },
    p_status_code: { val: strOrNull(input.status_code), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 60 },
    p_icon: { val: strOrNull(input.icon), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 500 },
    p_color_code: { val: strOrNull(input.color_code), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 60 },
    p_display_order: { val: numOrNull(input.display_order), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_active_flag: { val: strOrNull(input.active_flag), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 1 },
    p_is_system_flag: { val: strOrNull(input.is_system_flag), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 1 }
  };
}

function validateCreateInput(input) {
  const required = [
    'module_code',
    'module_name',
    'category_code',
    'status_code',
    'active_flag',
    'is_system_flag'
  ];
  const errors = [];
  for (const k of required) {
    if (input?.[k] === undefined || input?.[k] === null || String(input[k]).trim() === '') {
      errors.push(`${k} is required`);
    }
  }
  if (errors.length > 0) throw new ValidationError('Validation failed', errors);

  validateYnField('active_flag', input.active_flag);
  validateYnField('is_system_flag', input.is_system_flag);

  const startDate = parseDateOrNull('start_date', input.start_date);
  const endDate = parseDateOrNull('end_date', input.end_date);
  validateDateRange(startDate ?? null, endDate ?? null);
}

const CREATE_PLSQL = `
BEGIN
  ${CREATE_PROC}(
    p_module_code      => :p_module_code,
    p_module_name      => :p_module_name,
    p_description      => :p_description,
    p_category_code    => :p_category_code,
    p_status_code      => :p_status_code,
    p_icon             => :p_icon,
    p_color_code       => :p_color_code,
    p_display_order    => :p_display_order,
    p_active_flag      => :p_active_flag,
    p_is_system_flag   => :p_is_system_flag,
    p_created_by       => :p_created_by,
    p_module_id        => :p_module_id,
    p_module_guid      => :p_module_guid,
    p_status           => :p_status,
    p_message          => :p_message
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${UPDATE_PROC}(
    p_module_guid      => HEXTORAW(:p_module_guid),
    p_module_code      => :p_module_code,
    p_module_name      => :p_module_name,
    p_description      => :p_description,
    p_category_code    => :p_category_code,
    p_status_code      => :p_status_code,
    p_icon             => :p_icon,
    p_color_code       => :p_color_code,
    p_display_order    => :p_display_order,
    p_active_flag      => :p_active_flag,
    p_is_system_flag   => :p_is_system_flag,
    p_updated_by       => :p_updated_by,
    p_status           => :p_status,
    p_message          => :p_message
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${DELETE_PROC}(
    p_module_guid => HEXTORAW(:p_module_guid),
    p_status      => :p_status,
    p_message     => :p_message
  );
END;`;

const GET_PLSQL = `
BEGIN
  ${GET_PROC}(
    p_module_guid => HEXTORAW(:p_module_guid),
    p_result      => :p_result
  );
END;`;

const GET_ALL_PLSQL = `
BEGIN
  ${GET_ALL_PROC}(
    p_result => :p_result
  );
END;`;

/**
 * @returns {Promise<{ success: boolean, status: string, message: string, module_id: number|null, data: object|null }>}
 */
export async function createModule(input, actor) {
  validateCreateInput(input);

  const createdBy = strOrNull(input.created_by) ?? strOrNull(actor) ?? 'SYSTEM';
  const binds = {
    ...buildSharedModuleInBinds(input),
    p_created_by: { val: createdBy, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    p_module_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    p_module_guid: { dir: oracledb.BIND_OUT, type: oracledb.BUFFER, maxSize: 16 },
    p_status: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 20 },
    p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
  };

  return executeMutation(CREATE_PLSQL, binds, 'createModule', (out) => {
    const success = packageStatusIsSuccess(out.status);
    const data =
      success && (out.module_guid || out.module_id != null)
        ? { module_id: out.module_id, module_guid: out.module_guid }
        : null;
    return buildMutationResult(out, {
      successMessage: 'Module created successfully.',
      data
    });
  });
}

/**
 * @returns {Promise<{ success: boolean, status: string, message: string, module_id: number|null, data: object|null }>}
 */
export async function updateModule(moduleGuidRaw, patch, actor) {
  const module_guid = parseModuleGuidHexOrThrow(moduleGuidRaw);

  if (patch.active_flag !== undefined) validateYnField('active_flag', patch.active_flag);
  if (patch.is_system_flag !== undefined) validateYnField('is_system_flag', patch.is_system_flag);

  const startDate = parseDateOrNull('start_date', patch.start_date);
  const endDate = parseDateOrNull('end_date', patch.end_date);
  validateDateRange(startDate ?? null, endDate ?? null);

  const updatedBy = strOrNull(patch.updated_by) ?? strOrNull(actor) ?? 'SYSTEM';
  const binds = {
    p_module_guid: { val: module_guid, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 32 },
    ...buildSharedModuleInBinds(patch),
    p_updated_by: { val: updatedBy, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    p_status: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 20 },
    p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
  };

  return executeMutation(UPDATE_PLSQL, binds, 'updateModule', (out) =>
    buildMutationResult(out, {
      successMessage: 'Module updated successfully.',
      module_guid
    })
  );
}

/**
 * Hard delete via FNDSEC.FNDSEC_MODULES_API_PKG.DELETE_MODULE.
 * @returns {Promise<{ success: boolean, status: string, message: string, module_id: number|null }>}
 */
export async function deleteModule(moduleGuidRaw) {
  const module_guid = parseModuleGuidHexOrThrow(moduleGuidRaw);
  const binds = {
    p_module_guid: { val: module_guid, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 32 },
    p_status: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 20 },
    p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
  };

  return executeMutation(DELETE_PLSQL, binds, 'deleteModule', (out) =>
    buildMutationResult(out, {
      successMessage: 'Module deleted successfully.',
      module_guid
    })
  );
}

async function fetchModulesFromPackage(plsql, binds) {
  return withConnection(async (connection) => {
    const result = await connection.execute(plsql, binds, CURSOR_FETCH_OPTIONS);
    const rows = await fetchAllFromRefCursor(result?.outBinds?.p_result);
    return mapCursorRows(rows);
  });
}

async function fetchAllModulesFromPackage() {
  const binds = {
    p_result: { dir: oracledb.BIND_OUT, type: oracledb.CURSOR }
  };
  return fetchModulesFromPackage(GET_ALL_PLSQL, binds);
}

/**
 * @returns {Promise<{ success: boolean, message: string, data: object|null }>}
 */
export async function getModuleByGuid(moduleGuidRaw) {
  const module_guid = parseModuleGuidHexOrThrow(moduleGuidRaw);
  const binds = {
    p_module_guid: { val: module_guid, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 32 },
    p_result: { dir: oracledb.BIND_OUT, type: oracledb.CURSOR }
  };

  try {
    const rows = await fetchModulesFromPackage(GET_PLSQL, binds);
    const data = rows[0] ?? null;
    if (!data) {
      return packageFailure('Module not found.');
    }
    return {
      success: true,
      status: 'S',
      message: 'Module fetched successfully.',
      data
    };
  } catch (err) {
    logPackageError('getModuleByGuid', err);
    return packageFailure(GENERIC_ERROR_MESSAGE, { error_details: safeErrorDetails(err) });
  }
}

function applyListFilters(rows, filters) {
  let result = rows;

  if (filters.search) {
    const term = String(filters.search).trim().slice(0, MODULE_LIST_SEARCH_MAX_LEN).toUpperCase();
    result = result.filter((m) => {
      const code = String(m.module_code ?? '').toUpperCase();
      const name = String(m.module_name ?? '').toUpperCase();
      return code.includes(term) || name.includes(term);
    });
  }
  if (filters.status_code) {
    const sc = String(filters.status_code).trim().toUpperCase();
    result = result.filter((m) => String(m.status_code ?? '').toUpperCase() === sc);
  }
  if (filters.category_code) {
    const cc = String(filters.category_code).trim().toUpperCase();
    result = result.filter((m) => String(m.category_code ?? '').toUpperCase() === cc);
  }
  if (filters.active_flag) {
    const af = String(filters.active_flag).trim().toUpperCase();
    result = result.filter((m) => String(m.active_flag ?? '').toUpperCase() === af);
  }

  return result;
}

/**
 * @returns {Promise<{ success: boolean, message: string, rows: object[], total: number }>}
 */
export async function listModules(filters, pagination) {
  try {
    const all = await fetchAllModulesFromPackage();
    const filtered = applyListFilters(all, filters);
    const total = filtered.length;
    const offset = (pagination.page - 1) * pagination.pageSize;
    const rows = filtered.slice(offset, offset + pagination.pageSize);
    return {
      success: true,
      message: 'Modules fetched successfully.',
      rows,
      total
    };
  } catch (err) {
    logPackageError('listModules', err);
    return {
      success: false,
      message: GENERIC_ERROR_MESSAGE,
      error_details: safeErrorDetails(err),
      rows: [],
      total: 0
    };
  }
}

export function packageFailureHttpStatus(message) {
  const msg = String(message ?? '');
  if (msg === GENERIC_ERROR_MESSAGE) return 500;
  if (/not found/i.test(msg)) return 404;
  if (/already exists|duplicate|unique/i.test(msg)) return 409;
  return 400;
}
