/**
 * Compensation Component Model
 * Handles database operations for compensation components via Oracle packages:
 * - COMP.COMP_COMPONENT_CREATE_PKG.CREATE_COMPONENT
 * - COMP.COMP_COMPONENT_UPDATE_PKG.UPDATE_COMPONENT
 * Pay basis and amortizable flag are passed only to those packages (COMP.COMP_COMPONENTS_ADVANCED_SETTINGS), not the header table.
 * and read operations for GET by component_guid.
 * component_guid is RAW(16) in DB; APIs use 32-character uppercase HEX string.
 */

import db from '../../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError, NotFoundError } from '../../../../utils/errors/index.js';
import { normalizeComponentForGetResponse } from '../normalizeComponentGetResponse.js';

const SCHEMA = 'COMP';

/** 32-character hexadecimal string for component_guid (RAW(16)). */
export const COMPONENT_GUID_REGEX = /^[0-9A-Fa-f]{32}$/;

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

/** Parse date for Oracle DATE bind; accepts 'YYYY-MM-DD' or Date; returns Date or null. */
function optDate(v) {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null;
  const s = String(v).trim();
  if (s === '') return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Normalize component_guid to 32-char uppercase hex (for responses and validation).
 * @param {string} guid - Hex string
 * @returns {string|null} Uppercase hex or null if invalid
 */
export function normalizeComponentGuid(guid) {
  if (guid == null || typeof guid !== 'string') return null;
  const s = String(guid).trim();
  if (s.length !== 32 || !COMPONENT_GUID_REGEX.test(s)) return null;
  return s.toUpperCase();
}

/**
 * Convert 32-char hex string to Buffer (RAW(16)) for Oracle binding.
 * @param {string} hexGuid - 32-character hex string
 * @returns {Buffer}
 */
export function guidHexToBuffer(hexGuid) {
  const normalized = normalizeComponentGuid(hexGuid);
  if (!normalized) throw new DatabaseError('Invalid component_guid: must be 32-character hexadecimal.');
  const buf = Buffer.from(normalized, 'hex');
  if (buf.length !== 16) throw new DatabaseError('Invalid component_guid: must be 32-character hexadecimal.');
  return buf;
}

/**
 * Convert RAW (Buffer) from DB to uppercase HEX string.
 * @param {Buffer|*} raw
 * @returns {string|null}
 */
function rawToHex(raw) {
  if (raw == null) return null;
  if (Buffer.isBuffer(raw)) return raw.toString('hex').toUpperCase();
  return String(raw).toUpperCase();
}

/** Normalize Y/N flag for Oracle. */
function normalizeYn(value, defaultVal = 'N') {
  if (value == null || String(value).trim() === '') return defaultVal;
  return String(value).trim().toUpperCase().slice(0, 1) === 'Y' ? 'Y' : 'N';
}

/** Map COMP.COMP_COMPONENTS_ADVANCED_SETTINGS row to API fields. */
function shapeAdvancedSettingsRow(row) {
  if (!row) {
    return { pay_basis: null, amortizable_flag: 'N' };
  }
  const pb = row.PAY_BASIS ?? row.pay_basis;
  const af = row.AMORTIZABLE_FLAG ?? row.amortizable_flag;
  return {
    pay_basis:
      pb != null && String(pb).trim() !== '' ? String(pb).trim() : null,
    amortizable_flag: normalizeYn(af != null ? String(af).trim() : null, 'N')
  };
}

/**
 * Convert to SYS.ODCIVARCHAR2LIST (array of strings).
 * @param {string[]} arr
 * @returns {string[]}
 */
function toStringList(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((s) => (s != null ? String(s).trim() : ''))
    .filter(Boolean);
}

function stringArrayToJson(arr) {
  const list = toStringList(arr);
  return list.length === 0 ? null : JSON.stringify(list);
}

/**
 * Run in transaction (COMP schema, commit on success).
 * @param {Function} fn - async (connection) => result
 * @param {string} errorContext - for error message
 * @param {{ useOriginalErrorMessage?: boolean }} [opts] - if useOriginalErrorMessage, pass through Oracle/driver message to caller
 */
async function runWithTransaction(fn, errorContext = 'operation', opts = {}) {
  const connection = await db.getConnection();
  try {
    await connection.execute(
      `ALTER SESSION SET CURRENT_SCHEMA = ${SCHEMA}`,
      [],
      { autoCommit: false }
    );
    const result = await fn(connection);
    await connection.commit();
    return result;
  } catch (err) {
    try {
      await connection.rollback();
    } catch (_) {}
    if (err instanceof DatabaseError || err instanceof NotFoundError) throw err;
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('not found') || err.errorNum === 1403) {
      throw new NotFoundError(err.message || 'Compensation component not found', err);
    }
    // Surface actual Oracle/driver error to API when requested (e.g. for create)
    if (opts.useOriginalErrorMessage) {
      throw err;
    }
    throw new DatabaseError(
      err.message || `Failed to ${errorContext}.`,
      err
    );
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

/**
 * Build binds for CREATE. Pass location_codes as JSON string for PL/SQL wrapper.
 */
function buildCreateBinds(payload) {
  const flags = payload.flags || {};
  const eligibility = payload.eligibility || {};

  const locJson = stringArrayToJson(eligibility.location_codes);

  return {
    P_TENANT_ID: optNum(payload.tenant_id),
    P_COMPONENT_CODE: optStr(payload.component_code),
    P_COMPONENT_NAME: optStr(payload.component_name),
    P_DESCRIPTION: optStr(payload.description),
    P_COMPONENT_TYPE_CODE: optStr(payload.component_type_code),
    P_CALCULATION_METHOD_CODE: optStr(payload.calculation_method_code),
    P_BASE_AMOUNT_SOURCE: optStr(payload.base_amount_source),
    P_FORMULA_NAME: optStr(payload.formula_name),
    P_MIN_VALUE: optNum(payload.min_value),
    P_MAX_VALUE: optNum(payload.max_value),
    P_CURRENCY_CODE: optStr(payload.currency_code),
    P_STATUS: optStr(payload.status),
    P_ACTIVE_FLAG: normalizeYn(payload.active_flag, 'Y'),
    P_COMP_CATEGORY_CODE: optStr(payload.comp_category_code),
    P_RECURRING_FLAG: normalizeYn(flags.recurring_flag),
    P_OPTIONAL_FLAG: normalizeYn(flags.optional_flag),
    P_PENSIONABLE_FLAG: normalizeYn(flags.pensionable_flag),
    P_STATUTORY_FLAG: normalizeYn(flags.statutory_flag),
    P_INCLUDE_IN_CTC_FLAG: normalizeYn(flags.include_in_ctc_flag),
    P_PRORATED_FLAG: normalizeYn(flags.prorated_flag),
    P_TAXABLE_FLAG: normalizeYn(flags.taxable_flag),
    P_ALL_EMPLOYEES_FLAG: normalizeYn(eligibility.all_employees_flag),
    P_LOCATION_CODES_JSON: locJson ?? '[]',
    P_EFFECTIVE_START_DATE: optDate(payload.effective_start_date),
    P_EFFECTIVE_END_DATE: optDate(payload.effective_end_date),
    P_CREATED_BY: optStr(payload.created_by),
    P_PAY_BASIS: optStr(payload.pay_basis),
    P_AMORTIZABLE_FLAG: normalizeYn(flags.amortizable_flag, 'N')
  };
}

/**
 * Build binds for UPDATE.
 */
function buildUpdateBinds(componentGuidBuffer, payload) {
  const flags = payload.flags || {};
  const eligibility = payload.eligibility || {};
  const locJson = stringArrayToJson(eligibility.location_codes);

  return {
    P_COMPONENT_GUID: componentGuidBuffer,
    P_TENANT_ID: optNum(payload.tenant_id),
    P_COMPONENT_CODE: optStr(payload.component_code),
    P_COMPONENT_NAME: optStr(payload.component_name),
    P_DESCRIPTION: optStr(payload.description),
    P_COMPONENT_TYPE_CODE: optStr(payload.component_type_code),
    P_CALCULATION_METHOD_CODE: optStr(payload.calculation_method_code),
    P_BASE_AMOUNT_SOURCE: optStr(payload.base_amount_source),
    P_FORMULA_NAME: optStr(payload.formula_name),
    P_MIN_VALUE: optNum(payload.min_value),
    P_MAX_VALUE: optNum(payload.max_value),
    P_CURRENCY_CODE: optStr(payload.currency_code),
    P_STATUS: optStr(payload.status),
    P_ACTIVE_FLAG: normalizeYn(payload.active_flag, 'Y'),
    P_COMP_CATEGORY_CODE: optStr(payload.comp_category_code),
    P_RECURRING_FLAG: normalizeYn(flags.recurring_flag),
    P_OPTIONAL_FLAG: normalizeYn(flags.optional_flag),
    P_PENSIONABLE_FLAG: normalizeYn(flags.pensionable_flag),
    P_STATUTORY_FLAG: normalizeYn(flags.statutory_flag),
    P_INCLUDE_IN_CTC_FLAG: normalizeYn(flags.include_in_ctc_flag),
    P_PRORATED_FLAG: normalizeYn(flags.prorated_flag),
    P_TAXABLE_FLAG: normalizeYn(flags.taxable_flag),
    P_ALL_EMPLOYEES_FLAG: normalizeYn(eligibility.all_employees_flag),
    P_LOCATION_CODES_JSON: locJson ?? '[]',
    P_EFFECTIVE_START_DATE: optDate(payload.effective_start_date),
    P_EFFECTIVE_END_DATE: optDate(payload.effective_end_date),
    P_UPDATED_BY: optStr(payload.updated_by),
    P_PAY_BASIS: optStr(payload.pay_basis),
    P_AMORTIZABLE_FLAG: normalizeYn(flags.amortizable_flag, 'N')
  };
}

/**
 * Create compensation component via COMP.COMP_COMPONENT_CREATE_PKG.CREATE_COMPONENT.
 * Uses a PL/SQL wrapper that parses location_codes JSON into SYS.ODCIVARCHAR2LIST.
 */
export async function createComponent(payload) {
  const binds = buildCreateBinds(payload);
  binds.P_COMPONENT_ID = { type: oracledb.NUMBER, dir: oracledb.BIND_OUT };

  const plsql = `
    DECLARE
      L_LOC   SYS.ODCIVARCHAR2LIST := SYS.ODCIVARCHAR2LIST();
      J       JSON_ARRAY_T;
      I       PLS_INTEGER;
    BEGIN
      IF :P_LOCATION_CODES_JSON IS NOT NULL THEN
        J := JSON_ARRAY_T.PARSE(:P_LOCATION_CODES_JSON);
        FOR I IN 0 .. J.GET_SIZE() - 1 LOOP
          L_LOC.EXTEND(1);
          L_LOC(L_LOC.COUNT) := J.GET_STRING(I);
        END LOOP;
      END IF;

      COMP.COMP_COMPONENT_CREATE_PKG.CREATE_COMPONENT(
        P_TENANT_ID               => :P_TENANT_ID,
        P_COMPONENT_CODE          => :P_COMPONENT_CODE,
        P_COMPONENT_NAME          => :P_COMPONENT_NAME,
        P_DESCRIPTION             => :P_DESCRIPTION,
        P_COMPONENT_TYPE_CODE     => :P_COMPONENT_TYPE_CODE,
        P_CALCULATION_METHOD_CODE => :P_CALCULATION_METHOD_CODE,
        P_BASE_AMOUNT_SOURCE      => :P_BASE_AMOUNT_SOURCE,
        P_FORMULA_NAME            => :P_FORMULA_NAME,
        P_MIN_VALUE               => :P_MIN_VALUE,
        P_MAX_VALUE               => :P_MAX_VALUE,
        P_CURRENCY_CODE           => :P_CURRENCY_CODE,
        P_STATUS                  => :P_STATUS,
        P_ACTIVE_FLAG             => :P_ACTIVE_FLAG,
        P_COMP_CATEGORY_CODE      => :P_COMP_CATEGORY_CODE,
        P_EFFECTIVE_START_DATE    => :P_EFFECTIVE_START_DATE,
        P_EFFECTIVE_END_DATE      => :P_EFFECTIVE_END_DATE,
        P_RECURRING_FLAG          => :P_RECURRING_FLAG,
        P_OPTIONAL_FLAG           => :P_OPTIONAL_FLAG,
        P_PENSIONABLE_FLAG        => :P_PENSIONABLE_FLAG,
        P_STATUTORY_FLAG          => :P_STATUTORY_FLAG,
        P_INCLUDE_IN_CTC_FLAG     => :P_INCLUDE_IN_CTC_FLAG,
        P_PRORATED_FLAG           => :P_PRORATED_FLAG,
        P_TAXABLE_FLAG            => :P_TAXABLE_FLAG,
        P_ALL_EMPLOYEES_FLAG      => :P_ALL_EMPLOYEES_FLAG,
        P_LOCATION_CODES          => L_LOC,
        P_CREATED_BY              => :P_CREATED_BY,
        P_PAY_BASIS               => :P_PAY_BASIS,
        P_AMORTIZABLE_FLAG        => :P_AMORTIZABLE_FLAG,
        P_COMPONENT_ID            => :P_COMPONENT_ID
      );
    END;
  `;

  return runWithTransaction(
    async (connection) => {
      const result = await connection.execute(plsql, binds, { autoCommit: false });
      const componentId = result.outBinds?.P_COMPONENT_ID ?? binds.P_COMPONENT_ID?.val;
      const id = componentId != null ? Number(componentId) : null;
      if (id == null) {
        throw new DatabaseError(
          'Create component did not return component_id.',
          null,
          'Create component did not return component_id.'
        );
      }
      const fetchGuidSql = `
        SELECT RAWTOHEX(COMPONENT_GUID) AS COMPONENT_GUID
        FROM COMP.COMP_COMPONENTS WHERE COMPONENT_ID = :id
      `;
      const guidResult = await connection.execute(
        fetchGuidSql,
        { id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const row = guidResult.rows?.[0];
      const componentGuid = row?.COMPONENT_GUID
        ? String(row.COMPONENT_GUID).toUpperCase()
        : null;
      return {
        component_id: id,
        component_guid: componentGuid
      };
    },
    'create compensation component',
    { useOriginalErrorMessage: true }
  );
}

/**
 * Update compensation component via COMP.COMP_COMPONENT_UPDATE_PKG.UPDATE_COMPONENT.
 * Uses a PL/SQL wrapper that parses location_codes JSON into SYS.ODCIVARCHAR2LIST.
 */
export async function updateComponent(componentGuid, payload) {
  const guidBuffer = guidHexToBuffer(componentGuid);
  const normalizedGuid = normalizeComponentGuid(componentGuid);

  const plsql = `
    DECLARE
      L_LOC   SYS.ODCIVARCHAR2LIST := SYS.ODCIVARCHAR2LIST();
      J       JSON_ARRAY_T;
      I       PLS_INTEGER;
    BEGIN
      IF :P_LOCATION_CODES_JSON IS NOT NULL THEN
        J := JSON_ARRAY_T.PARSE(:P_LOCATION_CODES_JSON);
        FOR I IN 0 .. J.GET_SIZE() - 1 LOOP
          L_LOC.EXTEND(1);
          L_LOC(L_LOC.COUNT) := J.GET_STRING(I);
        END LOOP;
      END IF;

      COMP.COMP_COMPONENT_UPDATE_PKG.UPDATE_COMPONENT(
        P_COMPONENT_GUID          => :P_COMPONENT_GUID,
        P_TENANT_ID               => :P_TENANT_ID,
        P_COMPONENT_CODE          => :P_COMPONENT_CODE,
        P_COMPONENT_NAME          => :P_COMPONENT_NAME,
        P_DESCRIPTION             => :P_DESCRIPTION,
        P_COMPONENT_TYPE_CODE     => :P_COMPONENT_TYPE_CODE,
        P_CALCULATION_METHOD_CODE => :P_CALCULATION_METHOD_CODE,
        P_BASE_AMOUNT_SOURCE      => :P_BASE_AMOUNT_SOURCE,
        P_FORMULA_NAME            => :P_FORMULA_NAME,
        P_MIN_VALUE               => :P_MIN_VALUE,
        P_MAX_VALUE               => :P_MAX_VALUE,
        P_CURRENCY_CODE           => :P_CURRENCY_CODE,
        P_STATUS                  => :P_STATUS,
        P_ACTIVE_FLAG             => :P_ACTIVE_FLAG,
        P_COMP_CATEGORY_CODE      => :P_COMP_CATEGORY_CODE,
        P_EFFECTIVE_START_DATE    => :P_EFFECTIVE_START_DATE,
        P_EFFECTIVE_END_DATE      => :P_EFFECTIVE_END_DATE,
        P_RECURRING_FLAG          => :P_RECURRING_FLAG,
        P_OPTIONAL_FLAG           => :P_OPTIONAL_FLAG,
        P_PENSIONABLE_FLAG        => :P_PENSIONABLE_FLAG,
        P_STATUTORY_FLAG          => :P_STATUTORY_FLAG,
        P_INCLUDE_IN_CTC_FLAG     => :P_INCLUDE_IN_CTC_FLAG,
        P_PRORATED_FLAG           => :P_PRORATED_FLAG,
        P_TAXABLE_FLAG            => :P_TAXABLE_FLAG,
        P_ALL_EMPLOYEES_FLAG      => :P_ALL_EMPLOYEES_FLAG,
        P_LOCATION_CODES          => L_LOC,
        P_UPDATED_BY              => :P_UPDATED_BY,
        P_PAY_BASIS               => :P_PAY_BASIS,
        P_AMORTIZABLE_FLAG        => :P_AMORTIZABLE_FLAG
      );
    END;
  `;

  return runWithTransaction(async (connection) => {
    let payloadForUpdate = payload;
    if (!Object.prototype.hasOwnProperty.call(payload, 'description')) {
      const curSql = `
        SELECT DESCRIPTION
        FROM COMP.COMP_COMPONENTS
        WHERE COMPONENT_GUID = HEXTORAW(:guid)
      `;
      const curResult = await connection.execute(
        curSql,
        { guid: normalizedGuid },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const curRow = curResult.rows?.[0];
      const existingDesc =
        curRow?.DESCRIPTION != null && String(curRow.DESCRIPTION).trim() !== ''
          ? String(curRow.DESCRIPTION).trim()
          : null;
      payloadForUpdate = { ...payload, description: existingDesc };
    }

    const needsPayBasisDefault = !Object.prototype.hasOwnProperty.call(
      payload,
      'pay_basis'
    );
    const needsAmortizableDefault = !Object.prototype.hasOwnProperty.call(
      payload.flags || {},
      'amortizable_flag'
    );
    if (needsPayBasisDefault || needsAmortizableDefault) {
      const advCurSql = `
        SELECT s.PAY_BASIS, s.AMORTIZABLE_FLAG
        FROM COMP.COMP_COMPONENTS c
        LEFT JOIN COMP.COMP_COMPONENTS_ADVANCED_SETTINGS s ON s.COMPONENT_ID = c.COMPONENT_ID
        WHERE c.COMPONENT_GUID = HEXTORAW(:guid)
      `;
      const advCur = await connection.execute(
        advCurSql,
        { guid: normalizedGuid },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const curAdv = shapeAdvancedSettingsRow(advCur.rows?.[0]);
      payloadForUpdate = {
        ...payloadForUpdate,
        ...(needsPayBasisDefault ? { pay_basis: curAdv.pay_basis } : {}),
        ...(needsAmortizableDefault
          ? {
              flags: {
                ...(payloadForUpdate.flags || {}),
                amortizable_flag: curAdv.amortizable_flag
              }
            }
          : {})
      };
    }

    const binds = buildUpdateBinds(guidBuffer, payloadForUpdate);
    await connection.execute(plsql, binds, { autoCommit: false });
    return { component_guid: normalizedGuid };
  }, 'update compensation component');
}

/**
 * Hard delete compensation component via COMP.DELETE_COMPONENT_PKG.DELETE_COMPONENT.
 * Package handles child cleanup internally.
 */
export async function deleteComponent(componentGuid, tenantId, deletedBy) {
  const guidBuffer = guidHexToBuffer(componentGuid);
  const binds = {
    P_COMPONENT_GUID: guidBuffer,
    P_TENANT_ID: optNum(tenantId),
    P_DELETED_BY: optStr(deletedBy)
  };

  const plsql = `
    BEGIN
      COMP.DELETE_COMPONENT_PKG.DELETE_COMPONENT(
        P_COMPONENT_GUID => :P_COMPONENT_GUID,
        P_TENANT_ID      => :P_TENANT_ID,
        P_DELETED_BY     => :P_DELETED_BY
      );
    END;
  `;

  return runWithTransaction(async (connection) => {
    await connection.execute(plsql, binds, { autoCommit: false });
    return true;
  }, 'delete compensation component', { useOriginalErrorMessage: true });
}

/**
 * Convert DB row to API shape (snake_case, Buffer -> hex string).
 */
function rowToComponent(row) {
  if (!row) return null;
  const toHex = (v) =>
    v instanceof Buffer ? v.toString('hex').toUpperCase() : v;
  const toSnake = (obj) => {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Buffer) return toHex(obj);
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(toSnake);
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      const key = k.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
      out[key] = v instanceof Buffer ? toHex(v) : toSnake(v);
    }
    return out;
  };
  return toSnake(row);
}

/**
 * Get component by component_guid: header + flags + eligibility.
 * component_guid is 32-char hex; converted to HEXTORAW for DB lookup.
 * Returns component_guid (hex) only; component_id not exposed.
 */
export async function getComponentByGuid(componentGuid) {
  const normalizedGuid = normalizeComponentGuid(componentGuid);
  if (!normalizedGuid) {
    throw new NotFoundError('Invalid component_guid: must be 32-character hexadecimal.');
  }

  const connection = await db.getConnection();
  try {
    await connection.execute(
      `ALTER SESSION SET CURRENT_SCHEMA = ${SCHEMA}`,
      [],
      { autoCommit: false }
    );

    const headerSql = `
      SELECT
        COMPONENT_ID,
        RAWTOHEX(COMPONENT_GUID) AS COMPONENT_GUID,
        TENANT_ID,
        COMPONENT_CODE,
        COMPONENT_NAME,
        DESCRIPTION,
        COMPONENT_TYPE_CODE,
        CALCULATION_METHOD_CODE,
        BASE_AMOUNT_SOURCE,
        FORMULA_NAME,
        MIN_VALUE,
        MAX_VALUE,
        CURRENCY_CODE,
        STATUS,
        ACTIVE_FLAG,
        COMP_CATEGORY_CODE,
        RECURRING_FLAG,
        OPTIONAL_FLAG,
        PENSIONABLE_FLAG,
        STATUTORY_FLAG,
        INCLUDE_IN_CTC_FLAG,
        PRORATED_FLAG,
        TAXABLE_FLAG,
        ALL_EMPLOYEES_FLAG,
        EFFECTIVE_START_DATE,
        EFFECTIVE_END_DATE
      FROM COMP.COMP_COMPONENTS
      WHERE COMPONENT_GUID = HEXTORAW(:guid)
    `;
    const headerResult = await connection.execute(
      headerSql,
      { guid: normalizedGuid },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const headerRow = headerResult.rows?.[0];
    if (!headerRow) {
      throw new NotFoundError(`Compensation component not found: ${componentGuid}`);
    }

    const componentId = headerRow.COMPONENT_ID;
    let locationCodes = [];
    let advanced = { pay_basis: null, amortizable_flag: 'N' };

    try {
      const advSql = `
        SELECT PAY_BASIS, AMORTIZABLE_FLAG
        FROM COMP.COMP_COMPONENTS_ADVANCED_SETTINGS
        WHERE COMPONENT_ID = :id
      `;
      const advResult = await connection.execute(
        advSql,
        { id: componentId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      advanced = shapeAdvancedSettingsRow(advResult.rows?.[0]);
    } catch (_) {}

    try {
      const locSql = `
        SELECT LOCATION_CODE FROM COMP.COMP_COMPONENT_LOCATIONS WHERE COMPONENT_ID = :id
      `;
      const locResult = await connection.execute(
        locSql,
        { id: componentId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      locationCodes = (locResult.rows || []).map((r) => r.LOCATION_CODE).filter(Boolean);
    } catch (_) {}

    const h = rowToComponent(headerRow);
    const componentGuidHex = rawToHex(headerRow.COMPONENT_GUID) ?? normalizedGuid;
    const formatDate = (d) => (d instanceof Date && Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : (d != null ? String(d).slice(0, 10) : null));
    const descCell = headerRow.DESCRIPTION ?? headerRow.description;
    return normalizeComponentForGetResponse({
      component_guid: componentGuidHex,
      tenant_id: h.tenant_id,
      component_code: h.component_code,
      component_name: h.component_name,
      description:
        descCell != null && String(descCell).trim() !== '' ? String(descCell).trim() : null,
      component_type_code: h.component_type_code,
      calculation_method_code: h.calculation_method_code,
      base_amount_source: h.base_amount_source ?? null,
      formula_name: h.formula_name ?? null,
      min_value: h.min_value,
      max_value: h.max_value,
      currency_code: h.currency_code,
      status: h.status,
      active_flag: h.active_flag,
      comp_category_code: h.comp_category_code,
      effective_start_date: formatDate(headerRow.EFFECTIVE_START_DATE) ?? h.effective_start_date ?? null,
      effective_end_date: formatDate(headerRow.EFFECTIVE_END_DATE) ?? h.effective_end_date ?? null,
      flags: {
        recurring_flag: h.recurring_flag ?? 'N',
        optional_flag: h.optional_flag ?? 'N',
        pensionable_flag: h.pensionable_flag ?? 'N',
        statutory_flag: h.statutory_flag ?? 'N',
        include_in_ctc_flag: h.include_in_ctc_flag ?? 'N',
        prorated_flag: h.prorated_flag ?? 'N',
        taxable_flag: h.taxable_flag ?? 'N',
        amortizable_flag: advanced.amortizable_flag
      },
      eligibility: {
        all_employees_flag: h.all_employees_flag ?? 'N',
        location_codes: locationCodes
      },
      pay_basis: advanced.pay_basis
    });
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    throw new DatabaseError(
      err.message || 'Failed to get compensation component.',
      err
    );
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}
