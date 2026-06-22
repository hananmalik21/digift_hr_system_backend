import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { parseLookupTypeGuid, parseLookupValueGuid } from '../../../../utils/guidUtils.js';
import {
  auditInBind,
  codeInBind,
  guidHexInBind,
  normalizeOutGuidHex,
  outGuidHexBind,
  outNumberBind,
  numberInBind,
  strOrNull,
  varcharInBind,
  wrapOracleDbError,
  activeFlagInBind
} from '../../../../utils/oraclePackageUtils.js';
import { parsePageLimit, buildListResponse } from '../../../../utils/paginationUtils.js';
import { parseOptionalActiveFlag } from '../../../../utils/validationUtils.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';
import { toIso } from '../../../../utils/rowMapperUtils.js';

const PKG = 'PAY.PAY_LOOKUPS_PKG';
const TYPE_VIEW = 'PAY.V_PAY_LOOKUP_TYPES';
const VALUE_VIEW = 'PAY.V_PAY_LOOKUP_VALUES';

const LOG_TAG = 'payLookupsModel';

const TYPE_SORT_COLUMNS = Object.freeze({
  type_code: 'TYPE_CODE',
  type_name: 'TYPE_NAME'
});

const VALUE_VIEW_COLUMNS = `
    LOOKUP_VALUE_GUID,
    LOOKUP_TYPE_GUID,
    TYPE_CODE,
    TYPE_NAME,
    ENTERPRISE_ID,
    LOOKUP_SCOPE,
    VALUE_CODE,
    VALUE_NAME,
    DISPLAY_SEQUENCE,
    ACTIVE_FLAG,
    CREATED_BY,
    CREATION_DATE,
    LAST_UPDATED_BY,
    LAST_UPDATE_DATE`;

const CREATE_TYPE_PLSQL = `
BEGIN
  ${PKG}.CREATE_LOOKUP_TYPE(
    P_TYPE_CODE        => :type_code,
    P_TYPE_NAME        => :type_name,
    P_DESCRIPTION      => :description,
    P_CREATED_BY       => :created_by,
    P_LOOKUP_TYPE_ID   => :lookup_type_id,
    P_LOOKUP_TYPE_GUID => :lookup_type_guid
  );
END;`;

const UPDATE_TYPE_PLSQL = `
BEGIN
  ${PKG}.UPDATE_LOOKUP_TYPE(
    P_LOOKUP_TYPE_GUID => :lookup_type_guid,
    P_TYPE_CODE        => :type_code,
    P_TYPE_NAME        => :type_name,
    P_DESCRIPTION      => :description,
    P_ACTIVE_FLAG      => :active_flag,
    P_UPDATED_BY       => :updated_by
  );
END;`;

const DELETE_TYPE_PLSQL = `
BEGIN
  ${PKG}.DELETE_LOOKUP_TYPE(
    P_LOOKUP_TYPE_GUID => :lookup_type_guid
  );
END;`;

const CREATE_VALUE_PLSQL = `
BEGIN
  ${PKG}.CREATE_LOOKUP_VALUE(
    P_TYPE_CODE         => :type_code,
    P_VALUE_CODE        => :value_code,
    P_VALUE_NAME        => :value_name,
    P_ENTERPRISE_ID     => :enterprise_id,
    P_DISPLAY_SEQUENCE  => :display_sequence,
    P_CREATED_BY        => :created_by,
    P_LOOKUP_VALUE_ID   => :lookup_value_id,
    P_LOOKUP_VALUE_GUID => :lookup_value_guid
  );
END;`;

const UPDATE_VALUE_PLSQL = `
BEGIN
  ${PKG}.UPDATE_LOOKUP_VALUE(
    P_LOOKUP_VALUE_GUID => :lookup_value_guid,
    P_VALUE_CODE        => :value_code,
    P_VALUE_NAME        => :value_name,
    P_ENTERPRISE_ID     => :enterprise_id,
    P_DISPLAY_SEQUENCE  => :display_sequence,
    P_ACTIVE_FLAG       => :active_flag,
    P_UPDATED_BY        => :updated_by
  );
END;`;

const DELETE_VALUE_PLSQL = `
BEGIN
  ${PKG}.DELETE_LOOKUP_VALUE(
    P_LOOKUP_VALUE_GUID => :lookup_value_guid
  );
END;`;

const TYPE_LIST_SQL = `
  SELECT
    LOOKUP_TYPE_GUID,
    TYPE_CODE,
    TYPE_NAME,
    DESCRIPTION,
    ACTIVE_FLAG,
    CREATED_BY,
    CREATION_DATE,
    LAST_UPDATED_BY,
    LAST_UPDATE_DATE,
    COUNT(*) OVER() AS TOTAL_COUNT
  FROM ${TYPE_VIEW}
  WHERE (:active_flag IS NULL OR ACTIVE_FLAG = :active_flag)
    AND (
      :search IS NULL OR
      UPPER(TYPE_CODE) LIKE UPPER(:search) OR
      UPPER(TYPE_NAME) LIKE UPPER(:search_name)
    )
  ORDER BY __SORT_COLUMN__ __SORT_ORDER__ NULLS LAST,
           TYPE_CODE ASC
  OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`;

const TYPE_BY_GUID_SQL = `
  SELECT
    LOOKUP_TYPE_GUID,
    TYPE_CODE,
    TYPE_NAME,
    DESCRIPTION,
    ACTIVE_FLAG,
    CREATED_BY,
    CREATION_DATE,
    LAST_UPDATED_BY,
    LAST_UPDATE_DATE
  FROM ${TYPE_VIEW}
  WHERE UPPER(LOOKUP_TYPE_GUID) = UPPER(:lookup_type_guid)`;

const VALUE_LIST_SQL = `
  SELECT
    ${VALUE_VIEW_COLUMNS},
    COUNT(*) OVER() AS TOTAL_COUNT
  FROM ${VALUE_VIEW}
  WHERE (ENTERPRISE_ID = :enterprise_id OR ENTERPRISE_ID IS NULL)
    AND (:type_code IS NULL OR TYPE_CODE = :type_code)
    AND (:active_flag IS NULL OR ACTIVE_FLAG = :active_flag)
    AND (
      :search IS NULL OR
      UPPER(VALUE_CODE) LIKE UPPER(:search) OR
      UPPER(VALUE_NAME) LIKE UPPER(:search_name)
    )
  ORDER BY DISPLAY_SEQUENCE,
           VALUE_NAME
  OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`;

const VALUE_BY_GUID_SQL = `
  SELECT
    ${VALUE_VIEW_COLUMNS}
  FROM ${VALUE_VIEW}
  WHERE UPPER(LOOKUP_VALUE_GUID) = UPPER(:lookup_value_guid)
    AND (ENTERPRISE_ID = :enterprise_id OR ENTERPRISE_ID IS NULL)`;

const VALUE_BY_GUID_ONLY_SQL = `
  SELECT
    ${VALUE_VIEW_COLUMNS}
  FROM ${VALUE_VIEW}
  WHERE UPPER(LOOKUP_VALUE_GUID) = UPPER(:lookup_value_guid)`;

function logOracleError(err) {
  const code = err?.errorNum != null ? `ORA-${err.errorNum}` : 'ORA-UNKNOWN';
  console.error(`[${LOG_TAG}] ${code}`, err?.message || err);
}

/**
 * @param {string} plsql
 * @param {Record<string, unknown>} binds
 * @param {(outBinds: Record<string, unknown>|undefined) => Record<string, unknown>} [parseOut]
 */
async function executePackageMutation(plsql, binds, parseOut) {
  const connection = await db.getConnection();
  try {
    const result = await connection.execute(plsql, binds);
    await connection.commit();
    return parseOut ? parseOut(result?.outBinds) : {};
  } catch (err) {
    try {
      await connection.rollback();
    } catch (_) {}
    logOracleError(err);
    wrapOracleDbError(err);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

/**
 * @param {string} sql
 * @param {Record<string, unknown>} binds
 */
async function executeRead(sql, binds) {
  const connection = await db.getConnection();
  try {
    return await connection.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

function parseSortOrder(raw, defaultOrder = 'ASC') {
  const order = String(raw ?? defaultOrder).trim().toUpperCase();
  return order === 'DESC' ? 'DESC' : 'ASC';
}

function resolveSortColumn(raw, allowlist, fallback) {
  const key = String(raw ?? fallback).trim().toLowerCase();
  return allowlist[key] ?? allowlist[fallback];
}

function buildTypeListSql(sortColumn, sortOrder) {
  return TYPE_LIST_SQL
    .replace('__SORT_COLUMN__', sortColumn)
    .replace('__SORT_ORDER__', sortOrder);
}

function nullableEnterpriseIdBind(enterpriseId) {
  return numberInBind(enterpriseId);
}

function searchBinds(searchRaw) {
  const search = strOrNull(searchRaw);
  if (!search) {
    return { search: null, search_name: null };
  }
  const pattern = `%${search}%`;
  return { search: pattern, search_name: pattern };
}

/** @param {Record<string, unknown>} row */
function mapLookupTypeRow(row) {
  if (!row) return null;
  return {
    lookup_type_guid: normalizeOutGuidHex(row.LOOKUP_TYPE_GUID ?? row.lookup_type_guid),
    type_code: row.TYPE_CODE ?? row.type_code ?? null,
    type_name: row.TYPE_NAME ?? row.type_name ?? null,
    description: row.DESCRIPTION ?? row.description ?? null,
    active_flag: row.ACTIVE_FLAG ?? row.active_flag ?? null,
    created_by: row.CREATED_BY ?? row.created_by ?? null,
    creation_date: toIso(row.CREATION_DATE ?? row.creation_date),
    last_updated_by: row.LAST_UPDATED_BY ?? row.last_updated_by ?? null,
    last_update_date: toIso(row.LAST_UPDATE_DATE ?? row.last_update_date)
  };
}

/** @param {Record<string, unknown>} row */
function mapLookupValueRow(row) {
  if (!row) return null;
  const enterpriseId = row.ENTERPRISE_ID ?? row.enterprise_id ?? null;
  return {
    lookup_value_guid: normalizeOutGuidHex(row.LOOKUP_VALUE_GUID ?? row.lookup_value_guid),
    lookup_type_guid: normalizeOutGuidHex(row.LOOKUP_TYPE_GUID ?? row.lookup_type_guid),
    type_code: row.TYPE_CODE ?? row.type_code ?? null,
    type_name: row.TYPE_NAME ?? row.type_name ?? null,
    enterprise_id: enterpriseId != null ? Number(enterpriseId) : null,
    lookup_scope: row.LOOKUP_SCOPE ?? row.lookup_scope ?? null,
    value_code: row.VALUE_CODE ?? row.value_code ?? null,
    value_name: row.VALUE_NAME ?? row.value_name ?? null,
    display_sequence: (() => {
      const seq = row.DISPLAY_SEQUENCE ?? row.display_sequence;
      return seq != null ? Number(seq) : null;
    })(),
    active_flag: row.ACTIVE_FLAG ?? row.active_flag ?? null,
    created_by: row.CREATED_BY ?? row.created_by ?? null,
    creation_date: toIso(row.CREATION_DATE ?? row.creation_date),
    last_updated_by: row.LAST_UPDATED_BY ?? row.last_updated_by ?? null,
    last_update_date: toIso(row.LAST_UPDATE_DATE ?? row.last_update_date)
  };
}

/**
 * @param {Record<string, unknown>} filters
 * @param {Record<string, unknown>} pagination
 */
export async function listLookupTypes(filters = {}, pagination = {}) {
  const sortColumn = resolveSortColumn(filters.sort_by, TYPE_SORT_COLUMNS, 'type_code');
  const sortOrder = parseSortOrder(filters.sort_order, 'ASC');
  const { page, limit, offset } = parsePageLimit(pagination);

  const activeFlag = parseOptionalActiveFlag(filters.active_flag);
  const { search, search_name } = searchBinds(filters.search);

  const sql = buildTypeListSql(sortColumn, sortOrder);

  const result = await executeRead(sql, {
    active_flag: activeFlag,
    search,
    search_name,
    offset,
    limit
  });

  return await buildListResponse(result.rows ?? [], page, limit, mapLookupTypeRow);
}

/**
 * @param {string} lookupTypeGuidRaw
 */
export async function getLookupTypeByGuid(lookupTypeGuidRaw) {
  const lookupTypeGuid = parseLookupTypeGuid(lookupTypeGuidRaw);
  const result = await executeRead(TYPE_BY_GUID_SQL, { lookup_type_guid: lookupTypeGuid });
  const row = result.rows?.[0];
  return row ? mapLookupTypeRow(row) : null;
}

/**
 * @param {Record<string, unknown>} filters
 * @param {Record<string, unknown>} pagination
 */
export async function listLookupValues(filters = {}, pagination = {}) {
  const enterpriseId = parseEnterpriseId(filters.enterprise_id);
  const { page, limit, offset } = parsePageLimit(pagination);

  const typeCode = strOrNull(filters.type_code);
  const activeFlag = parseOptionalActiveFlag(filters.active_flag);
  const { search, search_name } = searchBinds(filters.search);

  const result = await executeRead(VALUE_LIST_SQL, {
    enterprise_id: enterpriseId,
    type_code: typeCode ? typeCode.toUpperCase() : null,
    active_flag: activeFlag,
    search,
    search_name,
    offset,
    limit
  });

  return await buildListResponse(result.rows ?? [], page, limit, mapLookupValueRow);
}

/**
 * @param {string} lookupValueGuidRaw
 * @param {unknown} enterpriseIdRaw
 */
export async function getLookupValueByGuidForEnterprise(lookupValueGuidRaw, enterpriseIdRaw) {
  const lookupValueGuid = parseLookupValueGuid(lookupValueGuidRaw);
  const enterpriseId = parseEnterpriseId(enterpriseIdRaw);

  const result = await executeRead(VALUE_BY_GUID_SQL, {
    lookup_value_guid: lookupValueGuid,
    enterprise_id: enterpriseId
  });

  const row = result.rows?.[0];
  return row ? mapLookupValueRow(row) : null;
}

/**
 * @param {string} lookupValueGuidRaw
 */
export async function getLookupValueByGuid(lookupValueGuidRaw) {
  const lookupValueGuid = parseLookupValueGuid(lookupValueGuidRaw);
  const result = await executeRead(VALUE_BY_GUID_ONLY_SQL, { lookup_value_guid: lookupValueGuid });
  const row = result.rows?.[0];
  return row ? mapLookupValueRow(row) : null;
}

/**
 * @param {Record<string, unknown>} payload
 * @param {string} createdBy
 */
export async function createLookupTypeViaPackage(payload, createdBy) {
  const binds = {
    type_code: codeInBind(payload.type_code, 100),
    type_name: varcharInBind(payload.type_name, 200),
    description: varcharInBind(payload.description, 4000),
    created_by: auditInBind(createdBy),
    lookup_type_id: outNumberBind(),
    lookup_type_guid: outGuidHexBind()
  };

  const out = await executePackageMutation(CREATE_TYPE_PLSQL, binds, (outBinds) => ({
    lookup_type_guid: normalizeOutGuidHex(outBinds?.lookup_type_guid)
  }));

  return out;
}

/**
 * @param {string} lookupTypeGuidRaw
 * @param {Record<string, unknown>} payload
 * @param {string} updatedBy
 */
export async function updateLookupTypeViaPackage(lookupTypeGuidRaw, payload, updatedBy) {
  const lookupTypeGuid = parseLookupTypeGuid(lookupTypeGuidRaw);
  const binds = {
    lookup_type_guid: guidHexInBind(lookupTypeGuid),
    type_code: payload.type_code != null ? codeInBind(payload.type_code, 100) : codeInBind(null, 100),
    type_name: varcharInBind(payload.type_name, 200),
    description: varcharInBind(payload.description, 4000),
    active_flag: activeFlagInBind(payload.active_flag),
    updated_by: auditInBind(updatedBy)
  };

  await executePackageMutation(UPDATE_TYPE_PLSQL, binds);
}

/**
 * @param {string} lookupTypeGuidRaw
 */
export async function deleteLookupTypeViaPackage(lookupTypeGuidRaw) {
  const lookupTypeGuid = parseLookupTypeGuid(lookupTypeGuidRaw);
  await executePackageMutation(DELETE_TYPE_PLSQL, {
    lookup_type_guid: guidHexInBind(lookupTypeGuid)
  });
}

/**
 * @param {Record<string, unknown>} payload
 * @param {string} createdBy
 */
export async function createLookupValueViaPackage(payload, createdBy) {
  const enterpriseId = parseEnterpriseId(payload.enterprise_id, { required: false });

  const binds = {
    type_code: codeInBind(payload.type_code, 100),
    value_code: codeInBind(payload.value_code, 100),
    value_name: varcharInBind(payload.value_name, 200),
    enterprise_id: nullableEnterpriseIdBind(enterpriseId),
    display_sequence: numberInBind(payload.display_sequence),
    created_by: auditInBind(createdBy),
    lookup_value_id: outNumberBind(),
    lookup_value_guid: outGuidHexBind()
  };

  const out = await executePackageMutation(CREATE_VALUE_PLSQL, binds, (outBinds) => ({
    lookup_value_guid: normalizeOutGuidHex(outBinds?.lookup_value_guid)
  }));

  return out;
}

/**
 * @param {string} lookupValueGuidRaw
 * @param {Record<string, unknown>} payload
 * @param {string} updatedBy
 */
export async function updateLookupValueViaPackage(lookupValueGuidRaw, payload, updatedBy) {
  const lookupValueGuid = parseLookupValueGuid(lookupValueGuidRaw);
  const enterpriseId = parseEnterpriseId(payload.enterprise_id, { required: false });

  const binds = {
    lookup_value_guid: guidHexInBind(lookupValueGuid),
    value_code: payload.value_code != null ? codeInBind(payload.value_code, 100) : codeInBind(null, 100),
    value_name: varcharInBind(payload.value_name, 200),
    enterprise_id: nullableEnterpriseIdBind(enterpriseId),
    display_sequence: numberInBind(payload.display_sequence),
    active_flag: activeFlagInBind(payload.active_flag),
    updated_by: auditInBind(updatedBy)
  };

  await executePackageMutation(UPDATE_VALUE_PLSQL, binds);
}

/**
 * @param {string} lookupValueGuidRaw
 */
export async function deleteLookupValueViaPackage(lookupValueGuidRaw) {
  const lookupValueGuid = parseLookupValueGuid(lookupValueGuidRaw);
  await executePackageMutation(DELETE_VALUE_PLSQL, {
    lookup_value_guid: guidHexInBind(lookupValueGuid)
  });
}
