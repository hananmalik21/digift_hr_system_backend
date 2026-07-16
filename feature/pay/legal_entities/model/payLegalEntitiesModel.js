import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { normalizeApiGuidString } from '../../../../utils/guidUtils.js';
import {
  auditInBind,
  codeInBind,
  guidHexInBind,
  normalizeOutGuidHex,
  normalizeOutNumber,
  normalizeOutString,
  numberInBind,
  varcharInBind,
  ynInBind
} from '../../../../utils/oraclePackageUtils.js';
import { DatabaseError } from '../../../../utils/errors/index.js';

const PKG = 'PAY.PAY_LEGAL_ENTITIES_PKG';
const VIEW = 'PAY.V_PAY_LEGAL_ENTITIES';

const LOG_TAG = 'payLegalEntitiesModel';
export const GENERIC_ERROR_MESSAGE = 'Unable to process the legal entity request.';

const ROW_OBJECT = { outFormat: oracledb.OUT_FORMAT_OBJECT };

const VIEW_SELECT_COLUMNS = `
  v.LEGAL_ENTITY_ID,
  v.LEGAL_ENTITY_GUID,
  v.ENTERPRISE_ID,
  v.LEGAL_ENTITY_CODE,
  v.LEGAL_NAME,
  v.SHORT_NAME,
  v.DISPLAY_NAME,
  v.COUNTRY_CODE,
  v.REGISTRATION_NUMBER,
  v.TAX_REGISTRATION_NUMBER,
  v.LEGAL_EMPLOYER_FLAG,
  v.LEGAL_EMPLOYER_DISPLAY,
  v.PAYROLL_STATUTORY_UNIT_FLAG,
  v.PAYROLL_STATUTORY_UNIT_DISPLAY,
  v.DEFAULT_CURRENCY_CODE,
  v.EFFECTIVE_START_DATE,
  v.EFFECTIVE_END_DATE,
  v.STATUS,
  v.ACTIVE_FLAG,
  v.CREATED_BY,
  v.CREATION_DATE,
  v.LAST_UPDATED_BY,
  v.LAST_UPDATE_DATE
`.trim();

const CREATE_PLSQL = `
BEGIN
  ${PKG}.CREATE_LEGAL_ENTITY(
    P_ENTERPRISE_ID              => :p_enterprise_id,
    P_LEGAL_ENTITY_CODE          => :p_legal_entity_code,
    P_LEGAL_NAME                 => :p_legal_name,
    P_SHORT_NAME                 => :p_short_name,
    P_COUNTRY_CODE               => :p_country_code,
    P_REGISTRATION_NUMBER        => :p_registration_number,
    P_TAX_REGISTRATION_NUMBER    => :p_tax_registration_number,
    P_LEGAL_EMPLOYER_FLAG        => :p_legal_employer_flag,
    P_PAYROLL_STATUTORY_UNIT_FLAG => :p_payroll_statutory_unit_flag,
    P_DEFAULT_CURRENCY_CODE      => :p_default_currency_code,
    P_EFFECTIVE_START_DATE       => :p_effective_start_date,
    P_EFFECTIVE_END_DATE         => :p_effective_end_date,
    P_STATUS                     => :p_status,
    P_CREATED_BY                 => :p_created_by,
    X_LEGAL_ENTITY_ID            => :x_legal_entity_id,
    X_LEGAL_ENTITY_GUID          => :x_legal_entity_guid,
    X_SUCCESS                    => :x_success,
    X_MESSAGE                    => :x_message
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${PKG}.UPDATE_LEGAL_ENTITY(
    P_ENTERPRISE_ID              => :p_enterprise_id,
    P_LEGAL_ENTITY_GUID          => :p_legal_entity_guid,
    P_LEGAL_ENTITY_CODE          => :p_legal_entity_code,
    P_LEGAL_NAME                 => :p_legal_name,
    P_SHORT_NAME                 => :p_short_name,
    P_COUNTRY_CODE               => :p_country_code,
    P_REGISTRATION_NUMBER        => :p_registration_number,
    P_TAX_REGISTRATION_NUMBER    => :p_tax_registration_number,
    P_LEGAL_EMPLOYER_FLAG        => :p_legal_employer_flag,
    P_PAYROLL_STATUTORY_UNIT_FLAG => :p_payroll_statutory_unit_flag,
    P_DEFAULT_CURRENCY_CODE      => :p_default_currency_code,
    P_EFFECTIVE_START_DATE       => :p_effective_start_date,
    P_EFFECTIVE_END_DATE         => :p_effective_end_date,
    P_STATUS                     => :p_status,
    P_LAST_UPDATED_BY            => :p_last_updated_by,
    X_SUCCESS                    => :x_success,
    X_MESSAGE                    => :x_message
  );
END;`;

const SET_STATUS_PLSQL = `
BEGIN
  ${PKG}.SET_STATUS(
    P_ENTERPRISE_ID       => :p_enterprise_id,
    P_LEGAL_ENTITY_GUID   => :p_legal_entity_guid,
    P_STATUS              => :p_status,
    P_LAST_UPDATED_BY     => :p_last_updated_by,
    X_SUCCESS             => :x_success,
    X_MESSAGE             => :x_message
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${PKG}.DELETE_LEGAL_ENTITY(
    P_ENTERPRISE_ID       => :p_enterprise_id,
    P_LEGAL_ENTITY_GUID   => :p_legal_entity_guid,
    X_SUCCESS             => :x_success,
    X_MESSAGE             => :x_message
  );
END;`;

function successOutBinds() {
  return {
    x_success: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 20 },
    x_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
  };
}

function packageSuccessIsTrue(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase() === 'true';
}

function parseDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  const s = String(value).trim().slice(0, 10);
  const d = new Date(`${s}T00:00:00`);
  return Number.isFinite(d.getTime()) ? d : null;
}

function dateInBind(value) {
  return {
    val: parseDate(value),
    dir: oracledb.BIND_IN,
    type: oracledb.DATE
  };
}

function rowKeysUpper(row) {
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    out[String(k).toUpperCase()] = v;
  }
  return out;
}

function toNumberOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toStringOrNull(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

function toIsoDateOrNull(value) {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  return s ? s.slice(0, 10) : null;
}

function toIsoDateTimeOrNull(value) {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  const s = String(value).trim();
  return s || null;
}

function normalizeGuidFromView(value) {
  return normalizeApiGuidString(value) ?? normalizeOutGuidHex(value);
}

function readScalarCount(result) {
  const row = result?.rows?.[0];
  if (row == null || typeof row !== 'object') return 0;
  const value =
    row.TOTAL_RECORDS ??
    row.total_records ??
    row.CNT ??
    row.cnt ??
    row.COUNT ??
    row.count ??
    Object.values(row).find((v) => v != null);
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function logOracleError(err, context) {
  const code = err?.errorNum != null ? `ORA-${err.errorNum}` : 'ORA-UNKNOWN';
  console.error(`[${LOG_TAG}] ${context} ${code}`, err?.message || err);
}

export function sanitizePackageMessage(message) {
  const msg = String(message ?? '').trim();
  if (!msg) return GENERIC_ERROR_MESSAGE;
  if (/ORA-|PL\/SQL|SQL statement|constraint|PAY\.|stack trace/i.test(msg)) {
    return GENERIC_ERROR_MESSAGE;
  }
  return msg;
}

const PACKAGE_MESSAGE_MAP = [
  {
    pattern: /already\s*exists|duplicate.*code/i,
    message: 'A legal entity with this code already exists.'
  },
  {
    pattern: /not\s*found|does\s*not\s*exist/i,
    message: 'Legal entity was not found.'
  },
  {
    pattern: /being\s*used|referenced|child\s*record|integrity/i,
    message: 'This legal entity cannot be deleted because it is being used by another record.'
  }
];

export function mapPackageBusinessMessage(packageMessage) {
  const msg = String(packageMessage ?? '').trim();
  if (!msg) return GENERIC_ERROR_MESSAGE;
  for (const { pattern, message } of PACKAGE_MESSAGE_MAP) {
    if (pattern.test(msg)) return message;
  }
  return sanitizePackageMessage(msg);
}

function parsePackageOut(outBinds) {
  const ob = outBinds || {};
  const success = packageSuccessIsTrue(ob.x_success);
  const message = mapPackageBusinessMessage(normalizeOutString(ob.x_message));
  return { success, message, outBinds: ob };
}

/**
 * @param {string} plsql
 * @param {Record<string, unknown>} binds
 * @param {(parsed: { success: boolean, message: string, outBinds: Record<string, unknown> }) => Record<string, unknown>} [shapeResult]
 */
async function executePackageMutation(plsql, binds, shapeResult = null) {
  const connection = await db.getConnection();
  try {
    const result = await connection.execute(plsql, binds);
    const parsed = parsePackageOut(result?.outBinds);

    if (parsed.success) {
      await connection.commit();
    } else {
      await connection.rollback();
    }

    return shapeResult ? shapeResult(parsed) : parsed;
  } catch (err) {
    try {
      await connection.rollback();
    } catch (_) {}
    logOracleError(err, 'executePackageMutation');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, GENERIC_ERROR_MESSAGE);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

function buildLegalEntityBinds(payload) {
  return {
    p_enterprise_id: numberInBind(payload.enterprise_id),
    p_legal_entity_code: codeInBind(payload.legal_entity_code, 50),
    p_legal_name: varcharInBind(payload.legal_name, 250),
    p_short_name: varcharInBind(payload.short_name, 150),
    p_country_code: codeInBind(payload.country_code, 10),
    p_registration_number: varcharInBind(payload.registration_number, 100),
    p_tax_registration_number: varcharInBind(payload.tax_registration_number, 100),
    p_legal_employer_flag: ynInBind(payload.legal_employer_flag, 'N'),
    p_payroll_statutory_unit_flag: ynInBind(payload.payroll_statutory_unit_flag, 'N'),
    p_default_currency_code: codeInBind(payload.default_currency_code, 10),
    p_effective_start_date: dateInBind(payload.effective_start_date),
    p_effective_end_date: dateInBind(payload.effective_end_date),
    p_status: codeInBind(payload.status, 30)
  };
}

/**
 * @param {Record<string, unknown>} row
 */
export function mapLegalEntityViewRow(row) {
  const r = rowKeysUpper(row);
  const g = (key) => r[key];

  return {
    legal_entity_id: toNumberOrNull(g('LEGAL_ENTITY_ID')),
    legal_entity_guid: normalizeGuidFromView(g('LEGAL_ENTITY_GUID')),
    enterprise_id: toNumberOrNull(g('ENTERPRISE_ID')),
    legal_entity_code: toStringOrNull(g('LEGAL_ENTITY_CODE')),
    legal_name: toStringOrNull(g('LEGAL_NAME')),
    short_name: toStringOrNull(g('SHORT_NAME')),
    display_name: toStringOrNull(g('DISPLAY_NAME')),
    country_code: toStringOrNull(g('COUNTRY_CODE')),
    registration_number: toStringOrNull(g('REGISTRATION_NUMBER')),
    tax_registration_number: toStringOrNull(g('TAX_REGISTRATION_NUMBER')),
    legal_employer_flag: toStringOrNull(g('LEGAL_EMPLOYER_FLAG')),
    legal_employer_display: toStringOrNull(g('LEGAL_EMPLOYER_DISPLAY')),
    payroll_statutory_unit_flag: toStringOrNull(g('PAYROLL_STATUTORY_UNIT_FLAG')),
    payroll_statutory_unit_display: toStringOrNull(g('PAYROLL_STATUTORY_UNIT_DISPLAY')),
    default_currency_code: toStringOrNull(g('DEFAULT_CURRENCY_CODE')),
    effective_start_date: toIsoDateOrNull(g('EFFECTIVE_START_DATE')),
    effective_end_date: toIsoDateOrNull(g('EFFECTIVE_END_DATE')),
    status: toStringOrNull(g('STATUS')),
    active_flag: toStringOrNull(g('ACTIVE_FLAG')),
    created_by: toStringOrNull(g('CREATED_BY')),
    creation_date: toIsoDateTimeOrNull(g('CREATION_DATE')),
    last_updated_by: toStringOrNull(g('LAST_UPDATED_BY')),
    last_update_date: toIsoDateTimeOrNull(g('LAST_UPDATE_DATE'))
  };
}

/**
 * @param {Record<string, unknown>} row
 */
export function mapLegalEntityDropdownRow(row) {
  const mapped = mapLegalEntityViewRow(row);
  return {
    legal_entity_guid: mapped.legal_entity_guid,
    legal_entity_code: mapped.legal_entity_code,
    legal_name: mapped.legal_name,
    display_name: mapped.display_name,
    country_code: mapped.country_code
  };
}

/**
 * @param {object} filters
 */
function buildListWhereClause(filters) {
  const whereParts = ['v.ENTERPRISE_ID = :enterprise_id'];
  const binds = { enterprise_id: filters.enterprise_id };

  if (filters.status) {
    whereParts.push('v.STATUS = :status');
    binds.status = filters.status;
  }

  if (filters.country_code) {
    whereParts.push('v.COUNTRY_CODE = :country_code');
    binds.country_code = filters.country_code;
  }

  if (filters.legal_employer_flag) {
    whereParts.push('v.LEGAL_EMPLOYER_FLAG = :legal_employer_flag');
    binds.legal_employer_flag = filters.legal_employer_flag;
  }

  if (filters.payroll_statutory_unit_flag) {
    whereParts.push('v.PAYROLL_STATUTORY_UNIT_FLAG = :payroll_statutory_unit_flag');
    binds.payroll_statutory_unit_flag = filters.payroll_statutory_unit_flag;
  }

  if (filters.active_flag) {
    whereParts.push('v.ACTIVE_FLAG = :active_flag');
    binds.active_flag = filters.active_flag;
  }

  if (filters.search) {
    whereParts.push(`(
      UPPER(v.LEGAL_ENTITY_CODE) LIKE UPPER(:search_pattern)
      OR UPPER(v.LEGAL_NAME) LIKE UPPER(:search_pattern)
      OR UPPER(v.SHORT_NAME) LIKE UPPER(:search_pattern)
      OR UPPER(v.REGISTRATION_NUMBER) LIKE UPPER(:search_pattern)
      OR UPPER(v.TAX_REGISTRATION_NUMBER) LIKE UPPER(:search_pattern)
    )`);
    binds.search_pattern = `%${filters.search}%`;
  }

  return {
    whereSql: `WHERE ${whereParts.join(' AND ')}`,
    binds
  };
}

/**
 * @param {object} filters
 */
function buildDropdownWhereClause(filters) {
  const whereParts = [
    'v.ENTERPRISE_ID = :enterprise_id',
    "v.STATUS = 'ACTIVE'",
    "v.ACTIVE_FLAG = 'Y'"
  ];
  const binds = { enterprise_id: filters.enterprise_id };

  if (filters.legal_employer_flag) {
    whereParts.push('v.LEGAL_EMPLOYER_FLAG = :legal_employer_flag');
    binds.legal_employer_flag = filters.legal_employer_flag;
  }

  if (filters.payroll_statutory_unit_flag) {
    whereParts.push('v.PAYROLL_STATUTORY_UNIT_FLAG = :payroll_statutory_unit_flag');
    binds.payroll_statutory_unit_flag = filters.payroll_statutory_unit_flag;
  }

  if (filters.country_code) {
    whereParts.push('v.COUNTRY_CODE = :country_code');
    binds.country_code = filters.country_code;
  }

  return {
    whereSql: `WHERE ${whereParts.join(' AND ')}`,
    binds
  };
}

/**
 * @param {object} filters
 * @returns {Promise<{ rows: object[], total: number }>}
 */
export async function listLegalEntitiesFromView(filters) {
  const { whereSql, binds } = buildListWhereClause(filters);
  const skipRows = (filters.page - 1) * filters.limit;

  const countSql = `SELECT COUNT(*) AS TOTAL_RECORDS FROM ${VIEW} v ${whereSql}`;
  const dataSql = `
SELECT ${VIEW_SELECT_COLUMNS}
  FROM ${VIEW} v
  ${whereSql}
 ORDER BY v.LEGAL_NAME ASC,
          v.LEGAL_ENTITY_ID ASC
 OFFSET :skip_rows ROWS FETCH NEXT :fetch_next ROWS ONLY`.trim();

  const filterBinds = { ...binds };
  const dataBinds = {
    ...filterBinds,
    skip_rows: skipRows,
    fetch_next: filters.limit
  };

  let connection;
  try {
    connection = await db.getConnection();
    const [countResult, dataResult] = await Promise.all([
      connection.execute(countSql, filterBinds, ROW_OBJECT),
      connection.execute(dataSql, dataBinds, ROW_OBJECT)
    ]);

    return {
      rows: (dataResult.rows || []).map(mapLegalEntityViewRow),
      total: readScalarCount(countResult)
    };
  } catch (err) {
    logOracleError(err, 'listLegalEntitiesFromView');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, GENERIC_ERROR_MESSAGE);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}

/**
 * @param {object} filters
 * @returns {Promise<object[]>}
 */
export async function listLegalEntityDropdownFromView(filters) {
  const { whereSql, binds } = buildDropdownWhereClause(filters);
  const sql = `
SELECT ${VIEW_SELECT_COLUMNS}
  FROM ${VIEW} v
  ${whereSql}
 ORDER BY v.LEGAL_NAME ASC,
          v.LEGAL_ENTITY_ID ASC`.trim();

  let connection;
  try {
    connection = await db.getConnection();
    const result = await connection.execute(sql, binds, ROW_OBJECT);
    return (result.rows || []).map(mapLegalEntityDropdownRow);
  } catch (err) {
    logOracleError(err, 'listLegalEntityDropdownFromView');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, GENERIC_ERROR_MESSAGE);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}

/**
 * @param {string} legalEntityGuid
 * @param {number} enterpriseId
 * @returns {Promise<object|null>}
 */
export async function getLegalEntityFromViewByGuid(legalEntityGuid, enterpriseId) {
  const sql = `
SELECT ${VIEW_SELECT_COLUMNS}
  FROM ${VIEW} v
 WHERE v.LEGAL_ENTITY_GUID = :legal_entity_guid
   AND v.ENTERPRISE_ID = :enterprise_id`.trim();

  const binds = {
    legal_entity_guid: normalizeApiGuidString(legalEntityGuid),
    enterprise_id: enterpriseId
  };

  let connection;
  try {
    connection = await db.getConnection();
    const result = await connection.execute(sql, binds, ROW_OBJECT);
    const row = result.rows?.[0];
    return row ? mapLegalEntityViewRow(row) : null;
  } catch (err) {
    logOracleError(err, 'getLegalEntityFromViewByGuid');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, GENERIC_ERROR_MESSAGE);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}

/**
 * @param {Record<string, unknown>} payload
 */
export async function createLegalEntityViaPackage(payload) {
  return executePackageMutation(
    CREATE_PLSQL,
    {
      ...buildLegalEntityBinds(payload),
      p_created_by: auditInBind(payload.created_by),
      x_legal_entity_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      x_legal_entity_guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 100 },
      ...successOutBinds()
    },
    ({ success, message, outBinds }) => {
      if (!success) {
        return { success: false, message };
      }
      return {
        success: true,
        message,
        data: {
          legal_entity_id: normalizeOutNumber(outBinds.x_legal_entity_id),
          legal_entity_guid:
            normalizeGuidFromView(outBinds.x_legal_entity_guid) ??
            normalizeOutGuidHex(outBinds.x_legal_entity_guid)
        }
      };
    }
  );
}

/**
 * @param {Record<string, unknown>} payload
 */
export async function updateLegalEntityViaPackage(payload) {
  return executePackageMutation(
    UPDATE_PLSQL,
    {
      ...buildLegalEntityBinds(payload),
      p_legal_entity_guid: guidHexInBind(payload.legal_entity_guid),
      p_last_updated_by: auditInBind(payload.last_updated_by),
      ...successOutBinds()
    },
    ({ success, message }) => ({ success, message })
  );
}

/**
 * @param {Record<string, unknown>} payload
 */
export async function setLegalEntityStatusViaPackage(payload) {
  return executePackageMutation(
    SET_STATUS_PLSQL,
    {
      p_enterprise_id: numberInBind(payload.enterprise_id),
      p_legal_entity_guid: guidHexInBind(payload.legal_entity_guid),
      p_status: codeInBind(payload.status, 30),
      p_last_updated_by: auditInBind(payload.last_updated_by),
      ...successOutBinds()
    },
    ({ success, message }) => ({ success, message })
  );
}

/**
 * @param {Record<string, unknown>} payload
 */
export async function deleteLegalEntityViaPackage(payload) {
  return executePackageMutation(
    DELETE_PLSQL,
    {
      p_enterprise_id: numberInBind(payload.enterprise_id),
      p_legal_entity_guid: guidHexInBind(payload.legal_entity_guid),
      ...successOutBinds()
    },
    ({ success, message }) => ({ success, message })
  );
}
