import oracledb from 'oracledb';
import { parseLookupValueGuid } from '../../../../utils/guidUtils.js';
import {
  withConnection,
  strOrNull,
  numOrNull,
  wrapOracleDbError
} from '../../../../utils/oraclePackageUtils.js';
import { parsePageLimit, buildListResponse, LARGE_PAGE_LIMIT_OPTS } from '../../../../utils/paginationUtils.js';
import { ValidationError, NotFoundError, ConflictError } from '../../../../utils/errors/index.js';
import { toIso, normalizeGuid, mapEnterpriseIdField, mapLookupValueScope } from '../../../../utils/rowMapperUtils.js';
import { validateActiveFlag, parseOptionalActiveFlag, validateDisplaySequence } from '../../../../utils/validationUtils.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';

const PKG = 'GRC.GRC_LOOKUPS_PKG';
const VIEW = 'GRC.V_GRC_LOOKUPS';

const LIST_SQL = `
  SELECT
    ENTERPRISE_ID,
    LOOKUP_TYPE_ID,
    LOOKUP_TYPE_GUID,
    LOOKUP_TYPE_CODE,
    LOOKUP_TYPE_NAME,
    LOOKUP_VALUE_ID,
    LOOKUP_VALUE_GUID,
    LOOKUP_VALUE_CODE,
    LOOKUP_VALUE_NAME,
    DISPLAY_SEQUENCE,
    ACTIVE_FLAG,
    DESCRIPTION,
    COUNT(*) OVER() AS TOTAL_COUNT
  FROM ${VIEW}
  WHERE (ENTERPRISE_ID IS NULL OR ENTERPRISE_ID = :enterprise_id)
    AND (:lookup_type_code IS NULL OR LOOKUP_TYPE_CODE = :lookup_type_code)
    AND (:active_flag IS NULL OR ACTIVE_FLAG = :active_flag)
  ORDER BY LOOKUP_TYPE_NAME,
           DISPLAY_SEQUENCE,
           LOOKUP_VALUE_NAME
  OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`;

const GET_BY_GUID_SQL = `
  SELECT
    ENTERPRISE_ID,
    LOOKUP_TYPE_ID,
    LOOKUP_TYPE_GUID,
    LOOKUP_TYPE_CODE,
    LOOKUP_TYPE_NAME,
    LOOKUP_VALUE_ID,
    LOOKUP_VALUE_GUID,
    LOOKUP_VALUE_CODE,
    LOOKUP_VALUE_NAME,
    DISPLAY_SEQUENCE,
    ACTIVE_FLAG,
    DESCRIPTION
  FROM ${VIEW}
  WHERE UPPER(LOOKUP_VALUE_GUID) = UPPER(:lookup_value_guid)
    AND (ENTERPRISE_ID IS NULL OR ENTERPRISE_ID = :enterprise_id)`;

const VALUES_BY_TYPE_CODE_SQL = `
  SELECT
    ENTERPRISE_ID,
    LOOKUP_VALUE_GUID,
    LOOKUP_VALUE_CODE,
    LOOKUP_VALUE_NAME,
    DESCRIPTION,
    DISPLAY_SEQUENCE
  FROM ${VIEW}
  WHERE LOOKUP_TYPE_CODE = :lookup_type_code
    AND ACTIVE_FLAG = 'Y'
    AND (ENTERPRISE_ID IS NULL OR ENTERPRISE_ID = :enterprise_id)
  ORDER BY DISPLAY_SEQUENCE,
           LOOKUP_VALUE_NAME`;

const CREATE_PLSQL = `
BEGIN
  ${PKG}.CREATE_LOOKUP_VALUE(
    p_enterprise_id        => :p_enterprise_id,
    p_lookup_type_code   => :p_lookup_type_code,
    p_lookup_value_code  => :p_lookup_value_code,
    p_lookup_value_name  => :p_lookup_value_name,
    p_description        => :p_description,
    p_display_sequence   => :p_display_sequence,
    p_created_by         => :p_created_by,
    p_lookup_value_id    => :p_lookup_value_id,
    p_lookup_value_guid  => :p_lookup_value_guid
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${PKG}.UPDATE_LOOKUP_VALUE(
    p_enterprise_id        => :p_enterprise_id,
    p_lookup_value_guid  => :p_lookup_value_guid,
    p_lookup_value_code  => :p_lookup_value_code,
    p_lookup_value_name  => :p_lookup_value_name,
    p_description        => :p_description,
    p_display_sequence   => :p_display_sequence,
    p_active_flag        => :p_active_flag,
    p_updated_by         => :p_updated_by
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${PKG}.DELETE_LOOKUP_VALUE(
    p_enterprise_id       => :p_enterprise_id,
    p_lookup_value_guid => :p_lookup_value_guid
  );
END;`;

/** @param {Record<string, unknown>} row */
function mapLookupValueRow(row) {
  if (!row) return null;
  const enterpriseId = mapEnterpriseIdField(row);
  return {
    enterprise_id: enterpriseId,
    scope: mapLookupValueScope(enterpriseId),
    lookup_type_id: row.LOOKUP_TYPE_ID ?? row.lookup_type_id ?? null,
    lookup_type_guid: normalizeGuid(row.LOOKUP_TYPE_GUID ?? row.lookup_type_guid),
    lookup_type_code: row.LOOKUP_TYPE_CODE ?? row.lookup_type_code ?? null,
    lookup_type_name: row.LOOKUP_TYPE_NAME ?? row.lookup_type_name ?? null,
    lookup_value_id: row.LOOKUP_VALUE_ID ?? row.lookup_value_id ?? null,
    lookup_value_guid: normalizeGuid(row.LOOKUP_VALUE_GUID ?? row.lookup_value_guid),
    lookup_value_code: row.LOOKUP_VALUE_CODE ?? row.lookup_value_code ?? null,
    lookup_value_name: row.LOOKUP_VALUE_NAME ?? row.lookup_value_name ?? null,
    display_sequence: (() => {
      const seq = row.DISPLAY_SEQUENCE ?? row.display_sequence;
      return seq != null ? Number(seq) : null;
    })(),
    active_flag: row.ACTIVE_FLAG ?? row.active_flag ?? null,
    description: row.DESCRIPTION ?? row.description ?? null
  };
}

/** @param {Record<string, unknown>} row */
function mapLookupValueByTypeRow(row) {
  if (!row) return null;
  const enterpriseId = mapEnterpriseIdField(row);
  return {
    enterprise_id: enterpriseId,
    scope: mapLookupValueScope(enterpriseId),
    lookup_value_guid: normalizeGuid(row.LOOKUP_VALUE_GUID ?? row.lookup_value_guid),
    lookup_value_code: row.LOOKUP_VALUE_CODE ?? row.lookup_value_code ?? null,
    lookup_value_name: row.LOOKUP_VALUE_NAME ?? row.lookup_value_name ?? null,
    description: row.DESCRIPTION ?? row.description ?? null,
    display_sequence: (() => {
      const seq = row.DISPLAY_SEQUENCE ?? row.display_sequence;
      return seq != null ? Number(seq) : null;
    })()
  };
}

function parseListFilters(filters = {}) {
  const enterpriseId = parseEnterpriseId(filters.enterprise_id);

  const activeFlag = parseOptionalActiveFlag(filters.active_flag);

  const lookupTypeCode = strOrNull(filters.lookup_type_code);
  return {
    enterprise_id: enterpriseId,
    active_flag: activeFlag,
    lookup_type_code: lookupTypeCode ? lookupTypeCode.toUpperCase() : null
  };
}

function validateCreateInput(body) {
  if (body?.enterprise_id !== undefined && body?.enterprise_id !== null && body?.enterprise_id !== '') {
    parseEnterpriseId(body.enterprise_id);
  }
  if (!strOrNull(body?.lookup_type_code)) {
    throw new ValidationError('lookup_type_code is required.');
  }
  if (!strOrNull(body?.lookup_value_code)) {
    throw new ValidationError('lookup_value_code is required.');
  }
  if (!strOrNull(body?.lookup_value_name)) {
    throw new ValidationError('lookup_value_name is required.');
  }
  validateDisplaySequence(body?.display_sequence);
}

function validateUpdateInput(body) {
  parseEnterpriseId(body?.enterprise_id);
  if (body?.lookup_value_code !== undefined && !strOrNull(body.lookup_value_code)) {
    throw new ValidationError('lookup_value_code is required.');
  }
  if (body?.lookup_value_name !== undefined && !strOrNull(body.lookup_value_name)) {
    throw new ValidationError('lookup_value_name is required.');
  }
  validateActiveFlag(body?.active_flag);
  validateDisplaySequence(body?.display_sequence);
}

/**
 * @param {{ lookup_type_code?: string, active_flag?: string }} [filters]
 * @param {{ page?: number|string, limit?: number|string }} [pagination]
 */
export async function listLookupValues(filters = {}, pagination = {}) {
  const parsedFilters = parseListFilters(filters);
  const { page, limit, offset } = parsePageLimit(pagination, LARGE_PAGE_LIMIT_OPTS);

  const binds = {
    enterprise_id: parsedFilters.enterprise_id,
    lookup_type_code: parsedFilters.lookup_type_code,
    active_flag: parsedFilters.active_flag,
    offset,
    limit
  };

  const result = await withConnection((connection) =>
    connection.execute(LIST_SQL, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT })
  );

  return buildListResponse(result.rows ?? [], page, limit, mapLookupValueRow);
}

/**
 * @param {string} lookupValueGuidRaw
 * @param {unknown} enterpriseIdRaw
 */
export async function getLookupValueByGuid(lookupValueGuidRaw, enterpriseIdRaw) {
  const lookupValueGuid = parseLookupValueGuid(lookupValueGuidRaw);
  const enterpriseId = parseEnterpriseId(enterpriseIdRaw);

  const result = await withConnection((connection) =>
    connection.execute(
      GET_BY_GUID_SQL,
      { lookup_value_guid: lookupValueGuid, enterprise_id: enterpriseId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    )
  );

  const row = result.rows?.[0];
  if (!row) return null;
  return mapLookupValueRow(row);
}

/**
 * @param {string} lookupTypeCodeRaw
 * @param {unknown} enterpriseIdRaw
 */
export async function listLookupValuesByTypeCode(lookupTypeCodeRaw, enterpriseIdRaw) {
  const lookupTypeCode = strOrNull(lookupTypeCodeRaw);
  if (!lookupTypeCode) {
    throw new ValidationError('lookup_type_code is required.');
  }
  const enterpriseId = parseEnterpriseId(enterpriseIdRaw);

  const result = await withConnection((connection) =>
    connection.execute(
      VALUES_BY_TYPE_CODE_SQL,
      { lookup_type_code: lookupTypeCode.toUpperCase(), enterprise_id: enterpriseId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    )
  );

  return (result.rows ?? []).map((row) => mapLookupValueByTypeRow(row));
}

/**
 * @param {Record<string, unknown>} body
 */
export async function createLookupValue(body) {
  validateCreateInput(body);
  const enterpriseId = parseEnterpriseId(body?.enterprise_id, { required: false });

  const binds = {
    p_enterprise_id: {
      val: enterpriseId,
      dir: oracledb.BIND_IN,
      type: oracledb.NUMBER
    },
    p_lookup_type_code: {
      val: strOrNull(body.lookup_type_code)?.toUpperCase() ?? null,
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 100
    },
    p_lookup_value_code: {
      val: strOrNull(body.lookup_value_code)?.toUpperCase() ?? null,
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 100
    },
    p_lookup_value_name: {
      val: strOrNull(body.lookup_value_name),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 200
    },
    p_description: {
      val: strOrNull(body.description),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 4000
    },
    p_display_sequence: {
      val: numOrNull(body.display_sequence),
      dir: oracledb.BIND_IN,
      type: oracledb.NUMBER
    },
    p_created_by: {
      val: strOrNull(body.created_by) ?? 'SYSTEM',
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 200
    },
    p_lookup_value_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    p_lookup_value_guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32 }
  };

  try {
    const result = await withConnection((connection) =>
      connection.execute(CREATE_PLSQL, binds, { autoCommit: true })
    );
    const out = result.outBinds ?? {};
    return {
      lookup_value_id: out.p_lookup_value_id ?? null,
      lookup_value_guid: normalizeGuid(out.p_lookup_value_guid),
      enterprise_id: enterpriseId,
      scope: mapLookupValueScope(enterpriseId)
    };
  } catch (err) {
    wrapOracleDbError(err);
  }
}

/**
 * @param {string} lookupValueGuidRaw
 * @param {Record<string, unknown>} body
 */
export async function updateLookupValue(lookupValueGuidRaw, body) {
  const lookupValueGuid = parseLookupValueGuid(lookupValueGuidRaw);
  validateUpdateInput(body);
  const enterpriseId = parseEnterpriseId(body.enterprise_id);

  const existing = await getLookupValueByGuid(lookupValueGuid, enterpriseId);
  if (!existing) {
    throw new ValidationError('Lookup value not found.');
  }

  const binds = {
    p_enterprise_id: {
      val: existing.enterprise_id,
      dir: oracledb.BIND_IN,
      type: oracledb.NUMBER
    },
    p_lookup_value_guid: {
      val: lookupValueGuid,
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 32
    },
    p_lookup_value_code: {
      val: body.lookup_value_code != null ? strOrNull(body.lookup_value_code)?.toUpperCase() : null,
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 100
    },
    p_lookup_value_name: {
      val: strOrNull(body.lookup_value_name),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 200
    },
    p_description: {
      val: strOrNull(body.description),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 4000
    },
    p_display_sequence: {
      val: numOrNull(body.display_sequence),
      dir: oracledb.BIND_IN,
      type: oracledb.NUMBER
    },
    p_active_flag: {
      val: body.active_flag != null ? String(body.active_flag).trim().toUpperCase() : null,
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 1
    },
    p_updated_by: {
      val: strOrNull(body.updated_by) ?? 'SYSTEM',
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 200
    }
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
 * @param {string} lookupValueGuidRaw
 * @param {unknown} enterpriseIdRaw
 */
export async function deleteLookupValue(lookupValueGuidRaw, enterpriseIdRaw) {
  const lookupValueGuid = parseLookupValueGuid(lookupValueGuidRaw);
  const enterpriseId = parseEnterpriseId(enterpriseIdRaw);

  const existing = await getLookupValueByGuid(lookupValueGuid, enterpriseId);
  if (!existing) {
    throw new ValidationError('Lookup value not found.');
  }

  const binds = {
    p_enterprise_id: {
      val: existing.enterprise_id,
      dir: oracledb.BIND_IN,
      type: oracledb.NUMBER
    },
    p_lookup_value_guid: {
      val: lookupValueGuid,
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 32
    }
  };

  try {
    await withConnection((connection) =>
      connection.execute(DELETE_PLSQL, binds, { autoCommit: true })
    );
  } catch (err) {
    wrapOracleDbError(err);
  }
}
