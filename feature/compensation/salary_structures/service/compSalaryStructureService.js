/**
 * Compensation salary structures — Oracle package calls (create, update, delete).
 */

import db from '../../../../config/db.js';
import oracledb from 'oracledb';

const EXECUTE_OPTS = { autoCommit: true, outFormat: oracledb.OUT_FORMAT_OBJECT };

const CREATE_SQL = `
BEGIN
  COMP.CREATE_COMP_SALARY_STRUCTURE_PKG.CREATE_SALARY_STRUCTURE(
    :p_structure_code,
    :p_structure_name,
    :p_structure_type_code,
    :p_currency_code,
    :p_country_id,
    :p_enterprise_id,
    :p_description,
    :p_status,
    :p_active_flag,
    :p_effective_from,
    :p_effective_to,
    :p_enable_payroll_integration,
    :p_auto_calc_components,
    :p_enable_version_control,
    :p_require_multi_approval,
    :p_enable_audit_logging,
    :p_allow_manual_override,
    :p_cost_center_code,
    :p_fin_effective_from,
    :p_fin_effective_to,
    :p_annual_budget_amount,
    :p_country_code,
    :p_components_json,
    :p_business_units_json,
    :p_employee_categories_json,
    :p_created_by,
    :o_structure_id,
    :o_structure_guid
  );
END;
`;

const UPDATE_SQL = `
BEGIN
  COMP.UPDATE_COMP_SALARY_STRUCTURE_PKG.UPDATE_SALARY_STRUCTURE(
    :p_structure_guid,
    :p_structure_code,
    :p_structure_name,
    :p_structure_type_code,
    :p_currency_code,
    :p_country_id,
    :p_enterprise_id,
    :p_description,
    :p_status,
    :p_active_flag,
    :p_effective_from,
    :p_effective_to,
    :p_enable_payroll_integration,
    :p_auto_calc_components,
    :p_enable_version_control,
    :p_require_multi_approval,
    :p_enable_audit_logging,
    :p_allow_manual_override,
    :p_cost_center_code,
    :p_fin_effective_from,
    :p_fin_effective_to,
    :p_annual_budget_amount,
    :p_country_code,
    :p_components_json,
    :p_business_units_json,
    :p_employee_categories_json,
    :p_updated_by
  );
END;
`;

const DELETE_SQL = `
BEGIN
  COMP.DELETE_COMP_SALARY_STRUCTURE_PKG.DELETE_SALARY_STRUCTURE(
    :p_structure_guid,
    :p_deleted_by
  );
END;
`;

export const STRUCTURE_GUID_REGEX = /^[0-9A-Fa-f]{32}$/;

function optNum(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function optStr(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function optDate(v) {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null;
  const s = String(v).trim();
  if (s === '') return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

function normalizeYn(value, defaultVal = 'N') {
  if (value == null || String(value).trim() === '') return defaultVal;
  return String(value).trim().toUpperCase().slice(0, 1) === 'Y' ? 'Y' : 'N';
}

export function normalizeStructureGuid(guid) {
  if (guid == null || typeof guid !== 'string') return null;
  const s = String(guid).trim();
  if (s.length !== 32 || !STRUCTURE_GUID_REGEX.test(s)) return null;
  return s.toUpperCase();
}

function invalidStructureGuidError() {
  const err = new Error('structure_guid must be a 32-character hexadecimal string');
  err.statusCode = 400;
  return err;
}

export function structureGuidToBuffer(hexGuid) {
  const normalized = normalizeStructureGuid(hexGuid);
  if (!normalized) throw invalidStructureGuidError();
  const buf = Buffer.from(normalized, 'hex');
  if (buf.length !== 16) throw invalidStructureGuidError();
  return buf;
}

export function rawGuidToHex(raw) {
  if (raw == null) return null;
  if (Buffer.isBuffer(raw)) return raw.toString('hex').toUpperCase();
  return String(raw).toUpperCase();
}

function componentsToJson(components) {
  if (components == null) return null;
  return JSON.stringify(components);
}

function stringArrayToJson(arr) {
  if (arr == null) return null;
  return JSON.stringify(arr);
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

function buildCreateBinds(payload, createdBy) {
  const adv = payload.advanced_settings || {};
  const fin = payload.financial_details || {};
  const org = payload.org_scope || {};

  return {
    p_structure_code: optStr(payload.structure_code),
    p_structure_name: optStr(payload.structure_name),
    p_structure_type_code: optStr(payload.structure_type_code),
    p_currency_code: optStr(payload.currency_code),
    p_country_id: optNum(payload.country_id),
    p_enterprise_id: optNum(payload.enterprise_id),
    p_description: optStr(payload.description),
    p_status: optStr(payload.status) ?? 'DRAFT',
    p_active_flag: normalizeYn(payload.active_flag, 'Y'),
    p_effective_from: optDate(payload.effective_from),
    p_effective_to: optDate(payload.effective_to),

    p_enable_payroll_integration: normalizeYn(adv.enable_payroll_integration, 'N'),
    p_auto_calc_components: normalizeYn(adv.auto_calc_components, 'N'),
    p_enable_version_control: normalizeYn(adv.enable_version_control, 'N'),
    p_require_multi_approval: normalizeYn(adv.require_multi_approval, 'N'),
    p_enable_audit_logging: normalizeYn(adv.enable_audit_logging, 'N'),
    p_allow_manual_override: normalizeYn(adv.allow_manual_override, 'N'),

    p_cost_center_code: optStr(fin.cost_center_code),
    p_fin_effective_from: optDate(fin.effective_from),
    p_fin_effective_to: optDate(fin.effective_to),
    p_annual_budget_amount: optNum(fin.annual_budget_amount),

    p_country_code: optStr(org.country_code),
    p_components_json: componentsToJson(payload.components),
    p_business_units_json: org.business_units != null ? stringArrayToJson(org.business_units) : null,
    p_employee_categories_json:
      org.employee_categories != null ? stringArrayToJson(org.employee_categories) : null,

    p_created_by: optStr(createdBy) ?? 'SYSTEM',

    o_structure_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    o_structure_guid: { dir: oracledb.BIND_OUT, type: oracledb.BUFFER }
  };
}

function hasKey(obj, key) {
  return obj != null && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key);
}

function optYnNested(parent, key) {
  if (!hasKey(parent, key)) return null;
  const v = parent[key];
  return v == null ? null : normalizeYn(v, 'N');
}

function pickUpdate(body) {
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  const adv = body.advanced_settings;
  const fin = body.financial_details;
  const org = body.org_scope;

  return {
    p_structure_code: has('structure_code') ? optStr(body.structure_code) : null,
    p_structure_name: has('structure_name') ? optStr(body.structure_name) : null,
    p_structure_type_code: has('structure_type_code') ? optStr(body.structure_type_code) : null,
    p_currency_code: has('currency_code') ? optStr(body.currency_code) : null,
    p_country_id: has('country_id') ? optNum(body.country_id) : null,
    p_enterprise_id: has('enterprise_id') ? optNum(body.enterprise_id) : null,
    p_description: has('description') ? optStr(body.description) : null,
    p_status: has('status') ? optStr(body.status) : null,
    p_active_flag: has('active_flag') ? (body.active_flag == null ? null : normalizeYn(body.active_flag, 'N')) : null,
    p_effective_from: has('effective_from') ? optDate(body.effective_from) : null,
    p_effective_to: has('effective_to') ? optDate(body.effective_to) : null,

    p_enable_payroll_integration: optYnNested(adv, 'enable_payroll_integration'),
    p_auto_calc_components: optYnNested(adv, 'auto_calc_components'),
    p_enable_version_control: optYnNested(adv, 'enable_version_control'),
    p_require_multi_approval: optYnNested(adv, 'require_multi_approval'),
    p_enable_audit_logging: optYnNested(adv, 'enable_audit_logging'),
    p_allow_manual_override: optYnNested(adv, 'allow_manual_override'),

    p_cost_center_code: hasKey(fin, 'cost_center_code') ? optStr(fin.cost_center_code) : null,
    p_fin_effective_from: hasKey(fin, 'effective_from') ? optDate(fin.effective_from) : null,
    p_fin_effective_to: hasKey(fin, 'effective_to') ? optDate(fin.effective_to) : null,
    p_annual_budget_amount: hasKey(fin, 'annual_budget_amount') ? optNum(fin.annual_budget_amount) : null,

    p_country_code: hasKey(org, 'country_code') ? optStr(org.country_code) : null,
    p_components_json: has('components') ? componentsToJson(body.components) : null,
    p_business_units_json: hasKey(org, 'business_units') ? stringArrayToJson(org.business_units) : null,
    p_employee_categories_json: hasKey(org, 'employee_categories') ? stringArrayToJson(org.employee_categories) : null
  };
}

/**
 * @param {object} payload - request body
 * @param {string} createdBy
 * @returns {Promise<{ structure_id: number, structure_guid: string }>}
 */
export async function createSalaryStructure(payload, createdBy) {
  const binds = buildCreateBinds(payload, createdBy);
  return withConnection(async (connection) => {
    const result = await connection.execute(CREATE_SQL, binds, EXECUTE_OPTS);
    const out = result.outBinds || {};
    const structureId = out.o_structure_id;
    const structureGuid = rawGuidToHex(out.o_structure_guid);
    return {
      structure_id: structureId != null ? Number(structureId) : null,
      structure_guid: structureGuid
    };
  });
}

/**
 * @param {string} structureGuidHex - 32-char hex
 * @param {object} body - request body (partial)
 * @param {string} updatedBy
 */
export async function updateSalaryStructure(structureGuidHex, body, updatedBy) {
  const buf = structureGuidToBuffer(structureGuidHex);
  const binds = {
    p_structure_guid: buf,
    ...pickUpdate(body),
    p_updated_by: optStr(updatedBy) ?? 'SYSTEM'
  };
  return withConnection(async (connection) => {
    await connection.execute(UPDATE_SQL, binds, EXECUTE_OPTS);
    return { updated: true };
  });
}

/**
 * @param {string} structureGuidHex - 32-char hex
 * @param {string} deletedBy
 */
export async function deleteSalaryStructure(structureGuidHex, deletedBy) {
  const binds = {
    p_structure_guid: structureGuidToBuffer(structureGuidHex),
    p_deleted_by: optStr(deletedBy) ?? 'SYSTEM'
  };
  return withConnection(async (connection) => {
    await connection.execute(DELETE_SQL, binds, EXECUTE_OPTS);
    return { deleted: true };
  });
}
