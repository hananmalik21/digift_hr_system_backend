/**
 * Read-only access to COMP.COMP_SALARY_STRUCTURE_JSON_V (full nested JSON per row).
 * Dynamic WHERE + binds (no optional NULL binds) — avoids Oracle filtering out all rows with (:b IS NULL OR …) patterns.
 */

import oracledb from 'oracledb';
import { withCompSchemaConnection } from '../../db/withCompSchemaConnection.js';
import { escapeLikePattern } from '../../components/model/compComponentsViewModel.js';
import {
  enterpriseFilterColumnFromEnv,
  readScalarCount,
  wrapSalaryStructureViewDbError
} from '../utils/oracleListHelpers.js';

const VIEW_NAME = 'COMP.COMP_SALARY_STRUCTURE_JSON_V';
const LOG_TAG = 'compSalaryStructureJsonViewModel';

/**
 * Physical Y/N column on the view for status filter + SELECT alias.
 * If your DB uses STRUCTURE_ACTIVE_FLAG only, set env COMP_SALARY_STRUCTURE_JSON_V_ACTIVE_COL=STRUCTURE_ACTIVE_FLAG
 */
function activeFlagPhysicalColumn() {
  const c = (process.env.COMP_SALARY_STRUCTURE_JSON_V_ACTIVE_COL || 'ACTIVE_FLAG').trim().toUpperCase();
  if (c === 'STRUCTURE_ACTIVE_FLAG') return 'STRUCTURE_ACTIVE_FLAG';
  return 'ACTIVE_FLAG';
}

export function buildSalaryStructureJsonViewSelectSql() {
  const af = activeFlagPhysicalColumn();
  return `
  STRUCTURE_ID,
  ENTERPRISE_ID,
  STRUCTURE_CODE,
  STRUCTURE_NAME,
  ${af} AS ACTIVE_FLAG,
  STRUCTURE_OBJ,
  ADVANCED_SETTINGS_OBJ,
  ORG_SCOPES_JSON,
  FINANCIAL_DETAILS_JSON,
  GRADE_RANGES_JSON,
  JOB_FAMILIES_JSON,
  POSITIONS_JSON,
  COMPONENTS_JSON
`
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {{ enterprise_id: number, structure_id: number|null, search_pattern: string|null, p_status: string|null }} filters
 * @returns {{ whereSql: string, binds: object }}
 */
function buildJsonViewWhereAndBinds(filters) {
  const entCol = enterpriseFilterColumnFromEnv();
  const af = activeFlagPhysicalColumn();
  const parts = [`${entCol} = :enterprise_id`];
  const binds = {
    enterprise_id: { val: filters.enterprise_id, type: oracledb.NUMBER, dir: oracledb.BIND_IN }
  };

  if (filters.structure_id != null) {
    parts.push('STRUCTURE_ID = :structure_id');
    binds.structure_id = { val: filters.structure_id, type: oracledb.NUMBER, dir: oracledb.BIND_IN };
  }

  if (filters.search_pattern != null) {
    const searchMax = Math.min(
      32767,
      Math.max(4000, String(filters.search_pattern).length + 64)
    );
    parts.push(`(
      UPPER(STRUCTURE_CODE) LIKE UPPER(:search_pattern) ESCAPE '\\'
      OR UPPER(STRUCTURE_NAME) LIKE UPPER(:search_pattern) ESCAPE '\\'
    )`);
    binds.search_pattern = {
      val: filters.search_pattern,
      type: oracledb.STRING,
      dir: oracledb.BIND_IN,
      maxSize: searchMax
    };
  }

  if (filters.p_status === 'ACTIVE') {
    parts.push(`${af} = 'Y'`);
  } else if (filters.p_status === 'INACTIVE') {
    parts.push(`${af} = 'N'`);
  }

  return { whereSql: `WHERE ${parts.join(' AND ')}`, binds };
}

/**
 * @param {{ enterprise_id: number, structure_id: number|null, search_pattern: string|null, p_status: string|null }} filters
 * @param {{ page: number, pageSize: number }} pagination
 * @returns {Promise<{ rows: object[], total: number }>}
 */
export async function listSalaryStructuresFromJsonView(filters, pagination) {
  const { whereSql, binds: whereBinds } = buildJsonViewWhereAndBinds(filters);
  const selectSql = buildSalaryStructureJsonViewSelectSql();
  const rowOffset = (pagination.page - 1) * pagination.pageSize;
  const fetchSize = pagination.pageSize;

  const countSql = `SELECT COUNT(*) AS CNT FROM ${VIEW_NAME} ${whereSql}`;
  const dataSql = `
SELECT ${selectSql}
FROM ${VIEW_NAME}
${whereSql}
ORDER BY STRUCTURE_ID DESC
OFFSET :row_offset ROWS FETCH NEXT :fetch_size ROWS ONLY
`.trim();

  const dataBinds = {
    ...whereBinds,
    row_offset: { val: rowOffset, type: oracledb.NUMBER, dir: oracledb.BIND_IN },
    fetch_size: { val: fetchSize, type: oracledb.NUMBER, dir: oracledb.BIND_IN }
  };

  try {
    return await withCompSchemaConnection(async (connection) => {
      const countResult = await connection.execute(countSql, whereBinds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT
      });
      const total = readScalarCount(countResult);

      const dataResult = await connection.execute(dataSql, dataBinds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchArraySize: Math.min(100, Math.max(10, fetchSize))
      });
      return { rows: dataResult.rows || [], total };
    });
  } catch (err) {
    throw wrapSalaryStructureViewDbError(err, 'listSalaryStructuresFromJsonView', LOG_TAG);
  }
}

/**
 * Build filter binds for the JSON view list (search pattern with LIKE wildcards, escaped).
 * @param {{ enterprise_id: number, structure_id?: number|null, search?: string|null, status?: 'ACTIVE'|'INACTIVE'|'ALL'|null }} input
 */
export function buildJsonViewFilterBinds(input) {
  const enterprise_id = input.enterprise_id;
  let structure_id = null;
  if (input.structure_id != null && input.structure_id !== '') {
    const n = Number(input.structure_id);
    if (!Number.isFinite(n) || n < 1) {
      throw new Error('structure_id must be a valid positive integer');
    }
    structure_id = n;
  }

  let search_pattern = null;
  if (input.search != null && String(input.search).trim() !== '') {
    const esc = escapeLikePattern(String(input.search).trim());
    search_pattern = `%${esc}%`;
  }

  let p_status = null;
  if (input.status != null && String(input.status).trim() !== '') {
    const u = String(input.status).trim().toUpperCase();
    if (u !== 'ACTIVE' && u !== 'INACTIVE' && u !== 'ALL') {
      throw new Error('status must be ACTIVE, INACTIVE, or ALL');
    }
    p_status = u;
  }

  return {
    enterprise_id,
    structure_id,
    search_pattern,
    p_status
  };
}
