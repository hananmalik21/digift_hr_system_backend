import oracledb from 'oracledb';
import { parseLookupTypeGuid } from '../../../../utils/guidUtils.js';
import {
  withConnection,
  strOrNull,
  numOrNull,
  wrapOracleDbError,
  auditInBind,
  codeInBind,
  guidHexInBind,
  outGuidHexBind,
  outNumberBind,
  varcharInBind,
  activeFlagInBind
} from '../../../../utils/oraclePackageUtils.js';
import { parsePageLimit, buildListResponse, LARGE_PAGE_LIMIT_OPTS } from '../../../../utils/paginationUtils.js';
import { ValidationError, NotFoundError, ConflictError } from '../../../../utils/errors/index.js';
import { toIso, normalizeGuid, mapEnterpriseIdField, mapLookupValueScope } from '../../../../utils/rowMapperUtils.js';
import { validateActiveFlag, parseOptionalActiveFlag, validateDisplaySequence } from '../../../../utils/validationUtils.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';

const PKG = 'GRC.GRC_LOOKUPS_PKG';
const TABLE = 'GRC.GRC_LOOKUP_TYPES';

const LIST_SQL = `
  SELECT
    LOOKUP_TYPE_ID,
    RAWTOHEX(LOOKUP_TYPE_GUID) AS LOOKUP_TYPE_GUID,
    LOOKUP_TYPE_CODE,
    LOOKUP_TYPE_NAME,
    DESCRIPTION,
    ACTIVE_FLAG,
    COUNT(*) OVER() AS TOTAL_COUNT
  FROM ${TABLE}
  WHERE (:active_flag IS NULL OR ACTIVE_FLAG = :active_flag)
    AND (:lookup_type_code IS NULL OR LOOKUP_TYPE_CODE = :lookup_type_code)
  ORDER BY LOOKUP_TYPE_NAME
  OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`;

const GET_BY_GUID_SQL = `
  SELECT
    LOOKUP_TYPE_ID,
    RAWTOHEX(LOOKUP_TYPE_GUID) AS LOOKUP_TYPE_GUID,
    LOOKUP_TYPE_CODE,
    LOOKUP_TYPE_NAME,
    DESCRIPTION,
    ACTIVE_FLAG
  FROM ${TABLE}
  WHERE RAWTOHEX(LOOKUP_TYPE_GUID) = :lookup_type_guid`;

const CREATE_PLSQL = `
BEGIN
  ${PKG}.CREATE_LOOKUP_TYPE(
    p_lookup_type_code => :p_lookup_type_code,
    p_lookup_type_name => :p_lookup_type_name,
    p_description      => :p_description,
    p_created_by       => :p_created_by,
    p_lookup_type_id   => :p_lookup_type_id,
    p_lookup_type_guid => :p_lookup_type_guid
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${PKG}.UPDATE_LOOKUP_TYPE(
    p_lookup_type_guid => :p_lookup_type_guid,
    p_lookup_type_code => :p_lookup_type_code,
    p_lookup_type_name => :p_lookup_type_name,
    p_description      => :p_description,
    p_active_flag      => :p_active_flag,
    p_updated_by       => :p_updated_by
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${PKG}.DELETE_LOOKUP_TYPE(
    p_lookup_type_guid => :p_lookup_type_guid
  );
END;`;

/** @param {Record<string, unknown>} row */
function mapLookupTypeRow(row) {
  if (!row) return null;
  return {
    lookup_type_id: row.LOOKUP_TYPE_ID ?? row.lookup_type_id ?? null,
    lookup_type_guid: normalizeGuid(row.LOOKUP_TYPE_GUID ?? row.lookup_type_guid),
    lookup_type_code: row.LOOKUP_TYPE_CODE ?? row.lookup_type_code ?? null,
    lookup_type_name: row.LOOKUP_TYPE_NAME ?? row.lookup_type_name ?? null,
    description: row.DESCRIPTION ?? row.description ?? null,
    active_flag: row.ACTIVE_FLAG ?? row.active_flag ?? null
  };
}

function parseListFilters(filters = {}) {
  const activeFlag = parseOptionalActiveFlag(filters.active_flag);
  const lookupTypeCode = strOrNull(filters.lookup_type_code);
  return {
    active_flag: activeFlag,
    lookup_type_code: lookupTypeCode ? lookupTypeCode.toUpperCase() : null
  };
}

function validateCreateInput(body) {
  if (!strOrNull(body?.lookup_type_code)) {
    throw new ValidationError('lookup_type_code is required.');
  }
  if (!strOrNull(body?.lookup_type_name)) {
    throw new ValidationError('lookup_type_name is required.');
  }
}

function validateUpdateInput(body) {
  if (body?.lookup_type_code !== undefined && !strOrNull(body.lookup_type_code)) {
    throw new ValidationError('lookup_type_code is required.');
  }
  if (body?.lookup_type_name !== undefined && !strOrNull(body.lookup_type_name)) {
    throw new ValidationError('lookup_type_name is required.');
  }
  validateActiveFlag(body?.active_flag);
}

/**
 * @param {{ active_flag?: string, lookup_type_code?: string }} [filters]
 * @param {{ page?: number|string, limit?: number|string }} [pagination]
 */
export async function listLookupTypes(filters = {}, pagination = {}) {
  const parsedFilters = parseListFilters(filters);
  const { page, limit, offset } = parsePageLimit(pagination, LARGE_PAGE_LIMIT_OPTS);

  const binds = {
    active_flag: parsedFilters.active_flag,
    lookup_type_code: parsedFilters.lookup_type_code,
    offset,
    limit
  };

  const result = await withConnection((connection) =>
    connection.execute(LIST_SQL, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT })
  );

  return buildListResponse(result.rows ?? [], page, limit, mapLookupTypeRow);
}

/**
 * @param {string} lookupTypeGuidRaw
 */
export async function getLookupTypeByGuid(lookupTypeGuidRaw) {
  const lookupTypeGuid = parseLookupTypeGuid(lookupTypeGuidRaw);

  const result = await withConnection((connection) =>
    connection.execute(GET_BY_GUID_SQL, { lookup_type_guid: lookupTypeGuid }, {
      outFormat: oracledb.OUT_FORMAT_OBJECT
    })
  );

  const row = result.rows?.[0];
  if (!row) return null;
  return mapLookupTypeRow(row);
}

/**
 * @param {Record<string, unknown>} body
 */
export async function createLookupType(body) {
  validateCreateInput(body);

  const binds = {
    p_lookup_type_code: codeInBind(body.lookup_type_code, 100),
    p_lookup_type_name: varcharInBind(body.lookup_type_name, 200),
    p_description: varcharInBind(body.description, 4000),
    p_created_by: auditInBind(body.created_by),
    p_lookup_type_id: outNumberBind(),
    p_lookup_type_guid: outGuidHexBind()
  };

  try {
    const result = await withConnection((connection) =>
      connection.execute(CREATE_PLSQL, binds, { autoCommit: true })
    );
    const out = result.outBinds ?? {};
    return {
      lookup_type_id: out.p_lookup_type_id ?? null,
      lookup_type_guid: normalizeGuid(out.p_lookup_type_guid)
    };
  } catch (err) {
    wrapOracleDbError(err);
  }
}

/**
 * @param {string} lookupTypeGuidRaw
 * @param {Record<string, unknown>} body
 */
export async function updateLookupType(lookupTypeGuidRaw, body) {
  const lookupTypeGuid = parseLookupTypeGuid(lookupTypeGuidRaw);
  validateUpdateInput(body);

  const binds = {
    p_lookup_type_guid: guidHexInBind(lookupTypeGuid),
    p_lookup_type_code: body.lookup_type_code != null ? codeInBind(body.lookup_type_code, 100) : codeInBind(null, 100),
    p_lookup_type_name: varcharInBind(body.lookup_type_name, 200),
    p_description: varcharInBind(body.description, 4000),
    p_active_flag: activeFlagInBind(body.active_flag),
    p_updated_by: auditInBind(body.updated_by)
  };

  try {
    await withConnection((connection) =>
      connection.execute(UPDATE_PLSQL, binds, { autoCommit: true })
    );
  } catch (err) {
    wrapOracleDbError(err);
  }
}

/**
 * @param {string} lookupTypeGuidRaw
 */
export async function deleteLookupType(lookupTypeGuidRaw) {
  const lookupTypeGuid = parseLookupTypeGuid(lookupTypeGuidRaw);

  const binds = {
    p_lookup_type_guid: guidHexInBind(lookupTypeGuid)
  };

  try {
    await withConnection((connection) =>
      connection.execute(DELETE_PLSQL, binds, { autoCommit: true })
    );
  } catch (err) {
    wrapOracleDbError(err);
  }
}
