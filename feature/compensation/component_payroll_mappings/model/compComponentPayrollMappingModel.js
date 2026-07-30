/**
 * Compensation Component ↔ Payroll Element mapping.
 * Mutations: COMP.COMP_COMPONENT_PAYROLL_MAP_PKG
 * Reads: COMP.COMP_COMPONENT_PAYROLL_MAP + COMP.COMP_COMPONENTS + PAY.PAY_ELEMENTS
 */

import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import {
  auditInBind,
  guidHexInBind,
  normalizeOutGuidHex,
  normalizeOutNumber,
  numberInBind,
  outGuidHexBind,
  outNumberBind,
  varcharInBind,
  ynInBind
} from '../../../../utils/oraclePackageUtils.js';
import { DatabaseError, NotFoundError } from '../../../../utils/errors/index.js';
import {
  resolveMappingHttpStatus,
  resolveMappingUserMessage
} from '../utils/compComponentPayrollMappingOracleErrors.js';

const PKG = 'COMP.COMP_COMPONENT_PAYROLL_MAP_PKG';
const LOG_TAG = 'compComponentPayrollMappingModel';
const GENERIC_ERROR_MESSAGE = 'Unable to process component payroll mapping. Please try again.';

const CREATE_PLSQL = `
BEGIN
  ${PKG}.CREATE_MAPPING(
    P_ENTERPRISE_ID        => :p_enterprise_id,
    P_COMPONENT_ID         => :p_component_id,
    P_ELEMENT_ID           => :p_element_id,
    P_EFFECTIVE_START_DATE => CASE WHEN :p_effective_start_date IS NULL THEN NULL ELSE TO_DATE(:p_effective_start_date, 'YYYY-MM-DD') END,
    P_EFFECTIVE_END_DATE   => CASE WHEN :p_effective_end_date IS NULL THEN NULL ELSE TO_DATE(:p_effective_end_date, 'YYYY-MM-DD') END,
    P_ACTIVE_FLAG          => :p_active_flag,
    P_CREATED_BY           => :p_created_by,
    P_MAP_ID               => :p_map_id,
    P_MAP_GUID             => :p_map_guid
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${PKG}.UPDATE_MAPPING(
    P_MAP_GUID             => :p_map_guid,
    P_ENTERPRISE_ID        => :p_enterprise_id,
    P_COMPONENT_ID         => :p_component_id,
    P_ELEMENT_ID           => :p_element_id,
    P_EFFECTIVE_START_DATE => CASE WHEN :p_effective_start_date IS NULL THEN NULL ELSE TO_DATE(:p_effective_start_date, 'YYYY-MM-DD') END,
    P_EFFECTIVE_END_DATE   => CASE WHEN :p_effective_end_date IS NULL THEN NULL ELSE TO_DATE(:p_effective_end_date, 'YYYY-MM-DD') END,
    P_ACTIVE_FLAG          => :p_active_flag,
    P_LAST_UPDATED_BY      => :p_last_updated_by
  );
END;`;

const REMOVE_PLSQL = `
BEGIN
  :p_result := ${PKG}.REMOVE_MAPPING(
    P_MAP_GUID => :p_map_guid
  );
END;`;

const SET_STATUS_PLSQL = `
BEGIN
  ${PKG}.SET_ACTIVE_STATUS(
    P_MAP_GUID        => :p_map_guid,
    P_ACTIVE_FLAG     => :p_active_flag,
    P_LAST_UPDATED_BY => :p_last_updated_by
  );
END;`;

const RESOLVE_COMPONENT_SQL = `
SELECT COMPONENT_ID
  FROM COMP.COMP_COMPONENTS
 WHERE COMPONENT_GUID = HEXTORAW(REPLACE(:component_guid, '-', ''))
   AND TENANT_ID = :enterprise_id
`;

const RESOLVE_ELEMENT_SQL = `
SELECT ELEMENT_ID
  FROM PAY.PAY_ELEMENTS
 WHERE ELEMENT_GUID = HEXTORAW(REPLACE(:element_guid, '-', ''))
   AND ENTERPRISE_ID = :enterprise_id
`;

const MAPPING_SELECT = `
SELECT
    M.MAP_ID,
    LOWER(RAWTOHEX(M.MAP_GUID)) AS MAP_GUID,
    M.ENTERPRISE_ID,
    M.COMPONENT_ID,
    LOWER(RAWTOHEX(C.COMPONENT_GUID)) AS COMPONENT_GUID,
    C.COMPONENT_CODE,
    C.COMPONENT_NAME,
    C.COMPONENT_TYPE_CODE,
    C.CALCULATION_METHOD_CODE,
    M.ELEMENT_ID,
    LOWER(RAWTOHEX(E.ELEMENT_GUID)) AS ELEMENT_GUID,
    E.ELEMENT_CODE,
    E.ELEMENT_NAME,
    E.CATEGORY_CODE,
    E.CLASSIFICATION_CODE,
    E.SECONDARY_CLASSIFICATION,
    M.EFFECTIVE_START_DATE,
    M.EFFECTIVE_END_DATE,
    M.ACTIVE_FLAG,
    M.CREATED_BY,
    M.CREATION_DATE,
    M.LAST_UPDATED_BY,
    M.LAST_UPDATE_DATE
FROM COMP.COMP_COMPONENT_PAYROLL_MAP M
JOIN COMP.COMP_COMPONENTS C
  ON C.COMPONENT_ID = M.COMPONENT_ID
 AND C.TENANT_ID = M.ENTERPRISE_ID
JOIN PAY.PAY_ELEMENTS E
  ON E.ELEMENT_ID = M.ELEMENT_ID
 AND E.ENTERPRISE_ID = M.ENTERPRISE_ID
`;

const LIST_MAPPINGS_FROM = `
FROM COMP.COMP_COMPONENT_PAYROLL_MAP M
JOIN COMP.COMP_COMPONENTS C
  ON C.COMPONENT_ID = M.COMPONENT_ID
 AND C.TENANT_ID = M.ENTERPRISE_ID
JOIN PAY.PAY_ELEMENTS E
  ON E.ELEMENT_ID = M.ELEMENT_ID
 AND E.ENTERPRISE_ID = M.ENTERPRISE_ID
WHERE M.ENTERPRISE_ID = :enterprise_id
`;

const COUNT_MAPPINGS_SQL = `
SELECT COUNT(*) AS TOTAL_RECORDS
${LIST_MAPPINGS_FROM}
`;

const LIST_MAPPINGS_SQL = `
${MAPPING_SELECT}
WHERE M.ENTERPRISE_ID = :enterprise_id
ORDER BY C.COMPONENT_NAME NULLS LAST, M.MAP_ID ASC
OFFSET :skip_rows ROWS FETCH NEXT :fetch_next ROWS ONLY
`;

const GET_MAPPING_SQL = `
${MAPPING_SELECT}
WHERE M.MAP_GUID = HEXTORAW(REPLACE(:map_guid, '-', ''))
  AND M.ENTERPRISE_ID = :enterprise_id
`;

const GET_COMPONENT_MAPPING_SQL = `
SELECT
    LOWER(RAWTOHEX(M.MAP_GUID)) AS MAP_GUID,
    LOWER(RAWTOHEX(C.COMPONENT_GUID)) AS COMPONENT_GUID,
    C.COMPONENT_NAME,
    LOWER(RAWTOHEX(E.ELEMENT_GUID)) AS ELEMENT_GUID,
    E.ELEMENT_NAME,
    M.EFFECTIVE_START_DATE,
    M.EFFECTIVE_END_DATE,
    M.ACTIVE_FLAG
FROM COMP.COMP_COMPONENT_PAYROLL_MAP M
JOIN COMP.COMP_COMPONENTS C
  ON C.COMPONENT_ID = M.COMPONENT_ID
 AND C.TENANT_ID = M.ENTERPRISE_ID
JOIN PAY.PAY_ELEMENTS E
  ON E.ELEMENT_ID = M.ELEMENT_ID
 AND E.ENTERPRISE_ID = M.ENTERPRISE_ID
WHERE C.COMPONENT_GUID = HEXTORAW(REPLACE(:component_guid, '-', ''))
  AND M.ENTERPRISE_ID = :enterprise_id
`;

const AVAILABLE_ELEMENTS_SQL = `
SELECT
    E.ELEMENT_ID,
    LOWER(RAWTOHEX(E.ELEMENT_GUID)) AS ELEMENT_GUID,
    E.ELEMENT_CODE,
    E.ELEMENT_NAME,
    E.CATEGORY_CODE,
    E.CLASSIFICATION_CODE
FROM PAY.PAY_ELEMENTS E
WHERE E.ENTERPRISE_ID = :enterprise_id
  AND (E.EFFECTIVE_START_DATE IS NULL OR E.EFFECTIVE_START_DATE <= TRUNC(SYSDATE))
  AND (E.EFFECTIVE_END_DATE IS NULL OR E.EFFECTIVE_END_DATE >= TRUNC(SYSDATE))
ORDER BY E.ELEMENT_NAME
`;

const ROW_OBJECT = { outFormat: oracledb.OUT_FORMAT_OBJECT };

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
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(value).trim();
  return s ? s.slice(0, 10) : null;
}

function toLowerGuid(value) {
  if (value == null) return null;
  const hex = normalizeOutGuidHex(value) ?? String(value).replace(/-/g, '').trim();
  return hex ? hex.toLowerCase() : null;
}

function logOracleError(err) {
  const code = err?.errorNum != null ? `ORA-${err.errorNum}` : 'ORA-UNKNOWN';
  console.error(`[${LOG_TAG}] ${code}`, err?.message || err);
}

function wrapOracleError(err) {
  const userMessage = resolveMappingUserMessage(err, GENERIC_ERROR_MESSAGE);
  const dbError = new DatabaseError(GENERIC_ERROR_MESSAGE, err, userMessage);
  dbError.statusCode = resolveMappingHttpStatus(err, userMessage);
  return dbError;
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
    throw wrapOracleError(err);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

/**
 * Resolve compensation component GUID → COMPONENT_ID for the enterprise (TENANT_ID).
 * @param {import('oracledb').Connection} connection
 * @param {string} componentGuid
 * @param {number} enterpriseId
 * @returns {Promise<number>}
 */
async function resolveComponentId(connection, componentGuid, enterpriseId) {
  const result = await connection.execute(
    RESOLVE_COMPONENT_SQL,
    {
      component_guid: varcharInBind(componentGuid, 36),
      enterprise_id: numberInBind(enterpriseId)
    },
    ROW_OBJECT
  );
  const row = result?.rows?.[0];
  const id = toNumberOrNull(row?.COMPONENT_ID ?? row?.component_id);
  if (id == null) {
    throw new NotFoundError('Compensation component not found for this enterprise.');
  }
  return id;
}

/**
 * Resolve payroll element GUID → ELEMENT_ID for the enterprise.
 * @param {import('oracledb').Connection} connection
 * @param {string} elementGuid
 * @param {number} enterpriseId
 * @returns {Promise<number>}
 */
async function resolveElementId(connection, elementGuid, enterpriseId) {
  const result = await connection.execute(
    RESOLVE_ELEMENT_SQL,
    {
      element_guid: varcharInBind(elementGuid, 36),
      enterprise_id: numberInBind(enterpriseId)
    },
    ROW_OBJECT
  );
  const row = result?.rows?.[0];
  const id = toNumberOrNull(row?.ELEMENT_ID ?? row?.element_id);
  if (id == null) {
    throw new NotFoundError('Payroll element not found for this enterprise.');
  }
  return id;
}

/**
 * Resolve GUIDs then run a package mutation on the same connection (commit once).
 * @param {{
 *   componentGuid: string,
 *   elementGuid: string,
 *   enterpriseId: number,
 *   plsql: string,
 *   buildBinds: (componentId: number, elementId: number) => Record<string, unknown>,
 *   parseOut?: (outBinds: Record<string, unknown>|undefined) => Record<string, unknown>
 * }} opts
 */
async function resolveAndMutate({
  componentGuid,
  elementGuid,
  enterpriseId,
  plsql,
  buildBinds,
  parseOut
}) {
  const connection = await db.getConnection();
  try {
    const componentId = await resolveComponentId(connection, componentGuid, enterpriseId);
    const elementId = await resolveElementId(connection, elementGuid, enterpriseId);
    const binds = buildBinds(componentId, elementId);
    const result = await connection.execute(plsql, binds);
    await connection.commit();
    return parseOut ? parseOut(result?.outBinds) : {};
  } catch (err) {
    try {
      await connection.rollback();
    } catch (_) {}
    if (err instanceof NotFoundError || err instanceof DatabaseError) {
      throw err;
    }
    logOracleError(err);
    throw wrapOracleError(err);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

function mapMappingRow(row) {
  const r = rowKeysUpper(row);
  return {
    map_id: toNumberOrNull(r.MAP_ID),
    map_guid: toLowerGuid(r.MAP_GUID),
    enterprise_id: toNumberOrNull(r.ENTERPRISE_ID),
    component: {
      component_id: toNumberOrNull(r.COMPONENT_ID),
      component_guid: toLowerGuid(r.COMPONENT_GUID),
      component_code: toStringOrNull(r.COMPONENT_CODE),
      component_name: toStringOrNull(r.COMPONENT_NAME),
      component_type_code: toStringOrNull(r.COMPONENT_TYPE_CODE),
      calculation_method_code: toStringOrNull(r.CALCULATION_METHOD_CODE)
    },
    payroll_element: {
      element_id: toNumberOrNull(r.ELEMENT_ID),
      element_guid: toLowerGuid(r.ELEMENT_GUID),
      element_code: toStringOrNull(r.ELEMENT_CODE),
      element_name: toStringOrNull(r.ELEMENT_NAME),
      category_code: toStringOrNull(r.CATEGORY_CODE),
      classification_code: toStringOrNull(r.CLASSIFICATION_CODE),
      secondary_classification: toStringOrNull(r.SECONDARY_CLASSIFICATION)
    },
    effective_start_date: toIsoDateOrNull(r.EFFECTIVE_START_DATE),
    effective_end_date: toIsoDateOrNull(r.EFFECTIVE_END_DATE),
    active_flag: toStringOrNull(r.ACTIVE_FLAG),
    created_by: toStringOrNull(r.CREATED_BY),
    creation_date: r.CREATION_DATE instanceof Date ? r.CREATION_DATE.toISOString() : toStringOrNull(r.CREATION_DATE),
    last_updated_by: toStringOrNull(r.LAST_UPDATED_BY),
    last_update_date:
      r.LAST_UPDATE_DATE instanceof Date
        ? r.LAST_UPDATE_DATE.toISOString()
        : toStringOrNull(r.LAST_UPDATE_DATE)
  };
}

/**
 * @param {Record<string, unknown>} payload
 * @param {string} createdBy
 */
export async function createMapping(payload, createdBy) {
  const enterpriseId = Number(payload.enterprise_id);
  const componentGuid = String(payload.component_guid);
  const elementGuid = String(payload.element_guid);

  return resolveAndMutate({
    componentGuid,
    elementGuid,
    enterpriseId,
    plsql: CREATE_PLSQL,
    buildBinds: (componentId, elementId) => ({
      p_enterprise_id: numberInBind(enterpriseId),
      p_component_id: numberInBind(componentId),
      p_element_id: numberInBind(elementId),
      p_effective_start_date: varcharInBind(payload.effective_start_date, 10),
      p_effective_end_date: varcharInBind(payload.effective_end_date, 10),
      p_active_flag: ynInBind(payload.active_flag, 'Y'),
      p_created_by: auditInBind(createdBy),
      p_map_id: outNumberBind(),
      p_map_guid: outGuidHexBind()
    }),
    parseOut: (outBinds) => ({
      map_id: normalizeOutNumber(outBinds?.p_map_id),
      map_guid: toLowerGuid(outBinds?.p_map_guid),
      enterprise_id: enterpriseId,
      component_guid: componentGuid.toLowerCase(),
      element_guid: elementGuid.toLowerCase()
    })
  });
}

/**
 * @param {string} mapGuid
 * @param {Record<string, unknown>} payload
 * @param {string} lastUpdatedBy
 */
export async function updateMapping(mapGuid, payload, lastUpdatedBy) {
  const enterpriseId = Number(payload.enterprise_id);
  const componentGuid = String(payload.component_guid);
  const elementGuid = String(payload.element_guid);

  await resolveAndMutate({
    componentGuid,
    elementGuid,
    enterpriseId,
    plsql: UPDATE_PLSQL,
    buildBinds: (componentId, elementId) => ({
      p_map_guid: guidHexInBind(mapGuid),
      p_enterprise_id: numberInBind(enterpriseId),
      p_component_id: numberInBind(componentId),
      p_element_id: numberInBind(elementId),
      p_effective_start_date: varcharInBind(payload.effective_start_date, 10),
      p_effective_end_date: varcharInBind(payload.effective_end_date, 10),
      p_active_flag: ynInBind(payload.active_flag, 'Y'),
      p_last_updated_by: auditInBind(lastUpdatedBy)
    })
  });
}

/**
 * Soft/logical remove via package function REMOVE_MAPPING.
 * @param {string} mapGuid
 */
export async function removeMapping(mapGuid) {
  const connection = await db.getConnection();
  try {
    const result = await connection.execute(REMOVE_PLSQL, {
      p_map_guid: guidHexInBind(mapGuid),
      p_result: outNumberBind()
    });
    const code = normalizeOutNumber(result?.outBinds?.p_result);
    if (code !== 1) {
      await connection.rollback();
      throw new DatabaseError(
        GENERIC_ERROR_MESSAGE,
        null,
        'Component payroll mapping could not be removed.'
      );
    }
    await connection.commit();
    return { result: code };
  } catch (err) {
    try {
      await connection.rollback();
    } catch (_) {}
    if (err instanceof DatabaseError) throw err;
    logOracleError(err);
    throw wrapOracleError(err);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

/**
 * @param {string} mapGuid
 * @param {string} activeFlag
 * @param {string} lastUpdatedBy
 */
export async function setMappingActiveStatus(mapGuid, activeFlag, lastUpdatedBy) {
  await executePackageMutation(SET_STATUS_PLSQL, {
    p_map_guid: guidHexInBind(mapGuid),
    p_active_flag: ynInBind(activeFlag),
    p_last_updated_by: auditInBind(lastUpdatedBy)
  });
  return {
    map_guid: mapGuid.toLowerCase(),
    active_flag: String(activeFlag).toUpperCase()
  };
}

function readScalarCount(countResult) {
  const row = countResult?.rows?.[0];
  if (!row) return 0;
  const value =
    row.TOTAL_RECORDS ??
    row.total_records ??
    Object.values(row).find((v) => v != null);
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {{ enterprise_id: number, page: number, limit: number }} filters
 * @returns {Promise<{ rows: object[], total: number }>}
 */
export async function listMappings(filters) {
  const enterpriseId = Number(filters.enterprise_id);
  const page = Number(filters.page) || 1;
  const limit = Number(filters.limit) || 20;
  const skipRows = (page - 1) * limit;

  const filterBinds = { enterprise_id: numberInBind(enterpriseId) };
  const dataBinds = {
    ...filterBinds,
    skip_rows: skipRows,
    fetch_next: limit
  };

  const connection = await db.getConnection();
  try {
    const [countResult, dataResult] = await Promise.all([
      connection.execute(COUNT_MAPPINGS_SQL, filterBinds, ROW_OBJECT),
      connection.execute(LIST_MAPPINGS_SQL, dataBinds, ROW_OBJECT)
    ]);

    return {
      rows: (dataResult?.rows || []).map(mapMappingRow),
      total: readScalarCount(countResult)
    };
  } catch (err) {
    logOracleError(err);
    throw wrapOracleError(err);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

/**
 * @param {string} mapGuid
 * @param {number} enterpriseId
 */
export async function getMappingByGuid(mapGuid, enterpriseId) {
  const connection = await db.getConnection();
  try {
    const result = await connection.execute(
      GET_MAPPING_SQL,
      {
        map_guid: varcharInBind(mapGuid, 36),
        enterprise_id: numberInBind(enterpriseId)
      },
      ROW_OBJECT
    );
    const row = result?.rows?.[0];
    if (!row) {
      throw new NotFoundError('Component payroll mapping not found.');
    }
    return mapMappingRow(row);
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    logOracleError(err);
    throw wrapOracleError(err);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

/**
 * @param {string} componentGuid
 * @param {number} enterpriseId
 * @returns {Promise<{ mapped: boolean, data: object|null }>}
 */
export async function getMappingByComponentGuid(componentGuid, enterpriseId) {
  const connection = await db.getConnection();
  try {
    const result = await connection.execute(
      GET_COMPONENT_MAPPING_SQL,
      {
        component_guid: varcharInBind(componentGuid, 36),
        enterprise_id: numberInBind(enterpriseId)
      },
      ROW_OBJECT
    );
    const row = result?.rows?.[0];
    if (!row) {
      return { mapped: false, data: null };
    }
    const r = rowKeysUpper(row);
    return {
      mapped: true,
      data: {
        map_guid: toLowerGuid(r.MAP_GUID),
        component_guid: toLowerGuid(r.COMPONENT_GUID),
        component_name: toStringOrNull(r.COMPONENT_NAME),
        element_guid: toLowerGuid(r.ELEMENT_GUID),
        element_name: toStringOrNull(r.ELEMENT_NAME),
        effective_start_date: toIsoDateOrNull(r.EFFECTIVE_START_DATE),
        effective_end_date: toIsoDateOrNull(r.EFFECTIVE_END_DATE),
        active_flag: toStringOrNull(r.ACTIVE_FLAG)
      }
    };
  } catch (err) {
    logOracleError(err);
    throw wrapOracleError(err);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

/**
 * Active/effective payroll elements for dropdown (no input values).
 * @param {number} enterpriseId
 */
export async function listAvailablePayrollElements(enterpriseId) {
  const connection = await db.getConnection();
  try {
    const result = await connection.execute(
      AVAILABLE_ELEMENTS_SQL,
      { enterprise_id: numberInBind(enterpriseId) },
      ROW_OBJECT
    );
    return (result?.rows || []).map((row) => {
      const r = rowKeysUpper(row);
      return {
        element_id: toNumberOrNull(r.ELEMENT_ID),
        element_guid: toLowerGuid(r.ELEMENT_GUID),
        element_code: toStringOrNull(r.ELEMENT_CODE),
        element_name: toStringOrNull(r.ELEMENT_NAME),
        category_code: toStringOrNull(r.CATEGORY_CODE),
        classification_code: toStringOrNull(r.CLASSIFICATION_CODE)
      };
    });
  } catch (err) {
    logOracleError(err);
    throw wrapOracleError(err);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}
