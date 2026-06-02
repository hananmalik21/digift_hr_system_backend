import oracledb from 'oracledb';
import { hexToRawBuffer } from '../../../../utils/guidUtils.js';
import { escapeLikePattern } from '../../../security/modules/utils/escapeLikePattern.js';
import {
  fetchPaginatedRows,
  isNonEmptyTrimmed,
  rethrowUnlessOperational,
  ROW_OPTS,
  withConnection
} from '../../shared/recViewModelUtils.js';
import { parseEnterpriseIdFromQuery, parseListPagination } from '../../shared/recViewQueryValidators.js';
import { mapCandidateViewRow } from '../utils/recCandidateViewMapper.js';
import {
  pickQueryFilterValue,
  resolveExperienceBand
} from '../utils/recCandidateListFilters.js';

const VIEW = process.env.REC_CANDIDATES_FULL_V || 'REC.CANDIDATES_FULL_V';
const LOG_TAG = 'recCandidateViewModel';
const FETCH_ERROR_MESSAGE = 'Unable to fetch candidates. Please try again.';

/** List API omits BACKGROUND_CHECKS_JSON and ASSESSMENTS_JSON (detail-by-GUID returns them). */
const LIST_SELECT_COLS = [
  'CANDIDATE_ID',
  'CANDIDATE_GUID',
  'ENTERPRISE_ID',
  'FIRST_NAME',
  'MIDDLE_NAME',
  'LAST_NAME',
  'FULL_NAME',
  'EMAIL',
  'PHONE',
  'CURRENT_TITLE',
  'CURRENT_EMPLOYER',
  'YEARS_EXPERIENCE',
  'CURRENT_LOCATION',
  'SOURCE',
  'EXPECTED_SALARY',
  'SALARY_CURRENCY',
  'NOTICE_PERIOD',
  'LINKEDIN_PROFILE',
  'STATUS',
  'ACTIVE_FLAG',
  'EDUCATION_JSON',
  'EXPERIENCE_JSON',
  'RESUMES_JSON',
  'CREATED_BY',
  'CREATION_DATE',
  'LAST_UPDATED_BY',
  'LAST_UPDATE_DATE'
]
  .map((c) => `v.${c}`)
  .join(', ');

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
    const { page, limit } = parseListPagination(query);
    const { whereSql, binds } = buildListFilters(query);
    const selectSql = `SELECT ${LIST_SELECT_COLS} FROM ${VIEW} v`;
    const orderSql = 'ORDER BY v.CREATION_DATE DESC';

    return await withConnection((connection) =>
      fetchPaginatedRows(connection, {
        view: VIEW,
        selectSql,
        whereSql,
        binds,
        orderSql,
        page,
        limit,
        mapRow: (row) =>
          mapCandidateViewRow(row, { omitColumns: ['background_checks_json', 'assessments_json'] })
      })
    );
  } catch (err) {
    rethrowUnlessOperational(err, `${LOG_TAG} listCandidatesFromView`, FETCH_ERROR_MESSAGE);
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
    rethrowUnlessOperational(err, `${LOG_TAG} getCandidateByGuidFromView`, FETCH_ERROR_MESSAGE);
  }
}
