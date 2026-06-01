import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { hexToRawBuffer } from '../../../../utils/guidUtils.js';
import { DatabaseError, ValidationError } from '../../../../utils/errors/index.js';
import { escapeLikePattern } from '../../../security/modules/utils/escapeLikePattern.js';
import { mapCandidateViewRow } from '../utils/recCandidateViewMapper.js';
import {
  pickQueryFilterValue,
  resolveExperienceBand
} from '../utils/recCandidateListFilters.js';
import {
  parseCandidateListPagination,
  parseEnterpriseIdFromQuery
} from '../utils/recCandidateViewValidators.js';

const VIEW = process.env.REC_CANDIDATES_FULL_V || 'REC.CANDIDATES_FULL_V';
const LOG_TAG = 'recCandidateViewModel';
const ROW_OPTS = { outFormat: oracledb.OUT_FORMAT_OBJECT };

function isNonEmptyTrimmed(raw) {
  return raw !== undefined && raw !== null && String(raw).trim() !== '';
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

function rethrowUnlessOperational(err, context) {
  if (err instanceof ValidationError) throw err;
  console.error(`[${LOG_TAG}] ${context}`, err?.errorNum != null ? `ORA-${err.errorNum}` : '', '[redacted]');
  throw new DatabaseError('Unable to fetch candidates. Please try again.', err);
}

/**
 * @param {Record<string, unknown>} query
 * @returns {{ whereSql: string, binds: Record<string, unknown> }}
 */
function buildListFilters(query) {
  const enterprise_id = parseEnterpriseIdFromQuery(query);
  const binds = {
    p_enterprise_id: { val: enterprise_id, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_status: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 50 },
    p_search_pat: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 4000 }
  };

  const parts = [
    'v.ENTERPRISE_ID = :p_enterprise_id',
    '(:p_status IS NULL OR v.STATUS = :p_status)',
    `(
      :p_search_pat IS NULL
      OR LOWER(v.FIRST_NAME) LIKE LOWER(:p_search_pat) ESCAPE '\\'
      OR LOWER(v.LAST_NAME) LIKE LOWER(:p_search_pat) ESCAPE '\\'
      OR LOWER(v.FULL_NAME) LIKE LOWER(:p_search_pat) ESCAPE '\\'
      OR LOWER(v.EMAIL) LIKE LOWER(:p_search_pat) ESCAPE '\\'
      OR LOWER(v.CURRENT_TITLE) LIKE LOWER(:p_search_pat) ESCAPE '\\'
      OR (
        v.EXPERIENCE_JSON IS NOT NULL
        AND LOWER(CAST(v.EXPERIENCE_JSON AS VARCHAR2(4000))) LIKE LOWER(:p_search_pat) ESCAPE '\\'
      )
      OR (
        v.EDUCATION_JSON IS NOT NULL
        AND LOWER(CAST(v.EDUCATION_JSON AS VARCHAR2(4000))) LIKE LOWER(:p_search_pat) ESCAPE '\\'
      )
    )`
  ];

  if (isNonEmptyTrimmed(query?.status)) {
    binds.p_status.val = String(query.status).trim();
  }

  if (isNonEmptyTrimmed(query?.search)) {
    binds.p_search_pat.val = `%${escapeLikePattern(String(query.search).trim())}%`;
  }

  const location = pickQueryFilterValue(query, 'location', 'current_location');
  if (location) {
    binds.p_location_pat = {
      val: `%${escapeLikePattern(location)}%`,
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 500
    };
    parts.push(`LOWER(v.CURRENT_LOCATION) LIKE LOWER(:p_location_pat) ESCAPE '\\'`);
  }

  const skillFilter = pickQueryFilterValue(query, 'skill_code', 'skill');
  if (skillFilter) {
    binds.p_skill_pat = {
      val: `%${escapeLikePattern(skillFilter)}%`,
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 500
    };
    parts.push(
      `(
        (
          v.EXPERIENCE_JSON IS NOT NULL
          AND LOWER(CAST(v.EXPERIENCE_JSON AS VARCHAR2(4000))) LIKE LOWER(:p_skill_pat) ESCAPE '\\'
        )
        OR (
          v.EDUCATION_JSON IS NOT NULL
          AND LOWER(CAST(v.EDUCATION_JSON AS VARCHAR2(4000))) LIKE LOWER(:p_skill_pat) ESCAPE '\\'
        )
      )`
    );
  }

  const experienceCode = pickQueryFilterValue(query, 'experience_code', 'experience');
  if (experienceCode) {
    const band = resolveExperienceBand(experienceCode);
    if (band) {
      if (band.min != null) {
        binds.p_exp_years_min = { val: band.min, dir: oracledb.BIND_IN, type: oracledb.NUMBER };
        parts.push('v.YEARS_EXPERIENCE >= :p_exp_years_min');
      }
      if (band.max != null) {
        binds.p_exp_years_max = { val: band.max, dir: oracledb.BIND_IN, type: oracledb.NUMBER };
        parts.push('v.YEARS_EXPERIENCE <= :p_exp_years_max');
      }
    } else {
      const n = Number(experienceCode);
      if (Number.isFinite(n)) {
        binds.p_exp_years_min = { val: n, dir: oracledb.BIND_IN, type: oracledb.NUMBER };
        parts.push('v.YEARS_EXPERIENCE >= :p_exp_years_min');
      }
    }
  }

  if (isNonEmptyTrimmed(query?.years_experience_min)) {
    const n = Number(query.years_experience_min);
    if (Number.isFinite(n)) {
      binds.p_exp_years_min = { val: n, dir: oracledb.BIND_IN, type: oracledb.NUMBER };
      parts.push('v.YEARS_EXPERIENCE >= :p_exp_years_min');
    }
  }
  if (isNonEmptyTrimmed(query?.years_experience_max)) {
    const n = Number(query.years_experience_max);
    if (Number.isFinite(n)) {
      binds.p_exp_years_max = { val: n, dir: oracledb.BIND_IN, type: oracledb.NUMBER };
      parts.push('v.YEARS_EXPERIENCE <= :p_exp_years_max');
    }
  }

  return {
    whereSql: `WHERE ${parts.join(' AND ')}`,
    binds
  };
}

/**
 * @param {Record<string, unknown>} query
 * @returns {Promise<{ rows: unknown[], total: number, page: number, limit: number }>}
 */
export async function listCandidatesFromView(query) {
  try {
    const { page, limit } = parseCandidateListPagination(query);
    const { whereSql, binds } = buildListFilters(query);

    const countSql = `SELECT COUNT(*) AS TOTAL_COUNT FROM ${VIEW} v ${whereSql}`;
    const dataSql = `SELECT v.* FROM ${VIEW} v ${whereSql} ORDER BY v.CREATION_DATE DESC`;

    return await withConnection(async (connection) => {
      const countResult = await connection.execute(countSql, binds, ROW_OPTS);
      const total =
        Number(countResult.rows?.[0]?.TOTAL_COUNT ?? countResult.rows?.[0]?.total_count ?? 0) || 0;

      const offset = (page - 1) * limit;
      const dataResult = await connection.execute(
        `${dataSql} OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
        {
          ...binds,
          offset: { val: offset, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
          limit: { val: limit, dir: oracledb.BIND_IN, type: oracledb.NUMBER }
        },
        ROW_OPTS
      );

      const rows = [];
      for (const row of dataResult.rows || []) {
        rows.push(await mapCandidateViewRow(row));
      }

      return { rows, total, page, limit };
    });
  } catch (err) {
    rethrowUnlessOperational(err, 'listCandidatesFromView');
  }
}

/**
 * @param {string} candidateGuidHex
 * @param {number} enterpriseId
 * @returns {Promise<Record<string, unknown>|null>}
 */
export async function getCandidateByGuidFromView(candidateGuidHex, enterpriseId) {
  const guidBuf = hexToRawBuffer(candidateGuidHex);
  const sql = `SELECT v.* FROM ${VIEW} v
    WHERE v.ENTERPRISE_ID = :p_enterprise_id
      AND v.CANDIDATE_GUID = :p_candidate_guid
    FETCH FIRST 1 ROWS ONLY`;

  try {
    return await withConnection(async (connection) => {
      const r = await connection.execute(
        sql,
        {
          p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
          p_candidate_guid: { val: guidBuf, dir: oracledb.BIND_IN, type: oracledb.BUFFER, maxSize: 16 }
        },
        ROW_OPTS
      );
      const row = r.rows?.[0];
      if (!row) return null;
      return mapCandidateViewRow(row);
    });
  } catch (err) {
    rethrowUnlessOperational(err, 'getCandidateByGuidFromView');
  }
}
