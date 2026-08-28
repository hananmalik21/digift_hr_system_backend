import oracledb from 'oracledb';
import { ensureHex32, normalizeHex32 } from '../../../../utils/guidUtils.js';
import { escapeLikePattern } from '../../../security/modules/utils/escapeLikePattern.js';
import {
  fetchPaginatedRows,
  isNonEmptyTrimmed,
  rethrowUnlessOperational,
  ROW_OPTS,
  withConnection
} from '../../shared/recViewModelUtils.js';
import { parseEnterpriseIdFromQuery, parseListPagination } from '../../shared/recViewQueryValidators.js';
import { paginateForExport } from '../../../../utils/excel/index.js';
import { mapCandidateListViewRow, mapCandidateViewRow } from '../utils/recCandidateViewMapper.js';
import {
  pickQueryFilterValue,
  resolveExperienceBand
} from '../utils/recCandidateListFilters.js';
import { CANDIDATE_DEMOGRAPHIC_VIEW_COLS } from '../utils/recCandidateProfileFields.js';
import { CANDIDATE_LIST_VIEW_COLUMNS } from '../utils/recCandidateViewConstants.js';

const VIEW = process.env.REC_CANDIDATES_FULL_V || 'REC.CANDIDATES_FULL_V';
const LOG_TAG = 'recCandidateViewModel';
const FETCH_ERROR_MESSAGE = 'Unable to fetch candidates. Please try again.';

const LIST_SELECT_COLS = CANDIDATE_LIST_VIEW_COLUMNS.map((c) => `v.${c}`).join(', ');

/** Export includes list scalars plus compensation/demographic/JSON columns for Excel. */
const EXPORT_EXTRA_COLS = [
  'EXPECTED_SALARY',
  'CURRENT_SALARY',
  'SALARY_CURRENCY',
  'NOTICE_PERIOD',
  'LINKEDIN_PROFILE',
  'PORTFOLIO_LINK',
  'GITHUB_LINK',
  'WILLING_TO_RELOCATE',
  ...CANDIDATE_DEMOGRAPHIC_VIEW_COLS,
  'EDUCATION_JSON',
  'EXPERIENCE_JSON',
  'SKILLS_JSON',
  'RESUMES_JSON',
  'TALENT_POOLS_JSON',
  'ASSESSMENTS_JSON',
  'CREATED_BY',
  'LAST_UPDATED_BY',
  'LAST_UPDATE_DATE'
];
const EXPORT_SELECT_COLS = [...new Set([...CANDIDATE_LIST_VIEW_COLUMNS, ...EXPORT_EXTRA_COLS])]
  .map((c) => `v.${c}`)
  .join(', ');

/**
 * @param {Record<string, unknown>} binds
 * @param {string} bindName
 * @param {string} pattern
 * @param {number} [maxSize]
 */
function bindLikeFilter(binds, bindName, pattern, maxSize = 500) {
  binds[bindName] = {
    val: pattern,
    dir: oracledb.BIND_IN,
    type: oracledb.STRING,
    maxSize
  };
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
    p_active_flag: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 1 },
    p_source: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 100 },
    p_source_from: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    p_nationality: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    p_visa_status: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 100 },
    p_search_pat: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 4000 }
  };

  const parts = [
    'v.ENTERPRISE_ID = :p_enterprise_id',
    '(:p_status IS NULL OR v.STATUS = :p_status)',
    '(:p_active_flag IS NULL OR v.ACTIVE_FLAG = :p_active_flag)',
    '(:p_source IS NULL OR v.SOURCE = :p_source)',
    '(:p_source_from IS NULL OR v.SOURCE_FROM = :p_source_from)',
    '(:p_nationality IS NULL OR v.NATIONALITY = :p_nationality)',
    '(:p_visa_status IS NULL OR v.VISA_STATUS = :p_visa_status)',
    `(
      :p_search_pat IS NULL
      OR LOWER(v.FIRST_NAME) LIKE LOWER(:p_search_pat) ESCAPE '\\'
      OR LOWER(v.MIDDLE_NAME) LIKE LOWER(:p_search_pat) ESCAPE '\\'
      OR LOWER(v.LAST_NAME) LIKE LOWER(:p_search_pat) ESCAPE '\\'
      OR LOWER(v.FULL_NAME) LIKE LOWER(:p_search_pat) ESCAPE '\\'
      OR LOWER(v.EMAIL) LIKE LOWER(:p_search_pat) ESCAPE '\\'
      OR LOWER(v.PHONE) LIKE LOWER(:p_search_pat) ESCAPE '\\'
      OR LOWER(v.CURRENT_TITLE) LIKE LOWER(:p_search_pat) ESCAPE '\\'
      OR LOWER(v.CURRENT_EMPLOYER) LIKE LOWER(:p_search_pat) ESCAPE '\\'
      OR LOWER(v.PORTFOLIO_LINK) LIKE LOWER(:p_search_pat) ESCAPE '\\'
      OR LOWER(v.GITHUB_LINK) LIKE LOWER(:p_search_pat) ESCAPE '\\'
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
  if (isNonEmptyTrimmed(query?.active_flag)) {
    binds.p_active_flag.val = String(query.active_flag).trim().toUpperCase();
  }
  if (isNonEmptyTrimmed(query?.source)) {
    binds.p_source.val = String(query.source).trim();
  }
  if (isNonEmptyTrimmed(query?.source_from)) {
    binds.p_source_from.val = String(query.source_from).trim();
  }
  if (isNonEmptyTrimmed(query?.nationality)) {
    binds.p_nationality.val = String(query.nationality).trim();
  }
  if (isNonEmptyTrimmed(query?.visa_status)) {
    binds.p_visa_status.val = String(query.visa_status).trim();
  }

  if (isNonEmptyTrimmed(query?.search)) {
    binds.p_search_pat.val = `%${escapeLikePattern(String(query.search).trim())}%`;
  }

  const location = pickQueryFilterValue(query, 'location', 'current_location');
  if (location) {
    bindLikeFilter(binds, 'p_location_pat', `%${escapeLikePattern(location)}%`);
    parts.push(`LOWER(v.CURRENT_LOCATION) LIKE LOWER(:p_location_pat) ESCAPE '\\'`);
  }

  const preferredLocation = pickQueryFilterValue(query, 'preferred_location');
  if (preferredLocation) {
    bindLikeFilter(binds, 'p_preferred_location_pat', `%${escapeLikePattern(preferredLocation)}%`);
    parts.push(`LOWER(v.PREFERRED_LOCATION) LIKE LOWER(:p_preferred_location_pat) ESCAPE '\\'`);
  }

  const currentTitle = pickQueryFilterValue(query, 'current_title', 'title');
  if (currentTitle) {
    bindLikeFilter(binds, 'p_current_title_pat', `%${escapeLikePattern(currentTitle)}%`);
    parts.push(`LOWER(v.CURRENT_TITLE) LIKE LOWER(:p_current_title_pat) ESCAPE '\\'`);
  }

  const currentEmployer = pickQueryFilterValue(query, 'current_employer', 'employer');
  if (currentEmployer) {
    bindLikeFilter(binds, 'p_current_employer_pat', `%${escapeLikePattern(currentEmployer)}%`);
    parts.push(`LOWER(v.CURRENT_EMPLOYER) LIKE LOWER(:p_current_employer_pat) ESCAPE '\\'`);
  }

  const skillFilter = pickQueryFilterValue(query, 'skill_code', 'skill');
  if (skillFilter) {
    bindLikeFilter(binds, 'p_skill_pat', `%${escapeLikePattern(skillFilter)}%`);
    parts.push(
      `(
        v.SKILLS_JSON IS NOT NULL
        AND LOWER(CAST(v.SKILLS_JSON AS VARCHAR2(4000))) LIKE LOWER(:p_skill_pat) ESCAPE '\\'
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
        mapRow: mapCandidateListViewRow
      })
    );
  } catch (err) {
    rethrowUnlessOperational(err, `${LOG_TAG} listCandidatesFromView`, FETCH_ERROR_MESSAGE);
  }
}

/**
 * Fetch all candidates matching filters for Excel export (paginates internally).
 * Uses a wider column set than list (includes compensation, demographics, JSON collections).
 * @param {Record<string, unknown>} query
 * @param {{ pageSize?: number, maxRows?: number }} [exportOptions]
 */
export async function listCandidatesForExport(query, exportOptions = {}) {
  return paginateForExport({
    exportOptions,
    fetchPage: async (page, pageSize) => {
      const { page: p, limit } = parseListPagination({ ...query, page, page_size: pageSize, limit: pageSize });
      const { whereSql, binds } = buildListFilters(query);
      const selectSql = `SELECT ${EXPORT_SELECT_COLS} FROM ${VIEW} v`;
      const orderSql = 'ORDER BY v.CREATION_DATE DESC';

      return withConnection((connection) =>
        fetchPaginatedRows(connection, {
          view: VIEW,
          selectSql,
          whereSql,
          binds,
          orderSql,
          page: p,
          limit,
          mapRow: (row) =>
            mapCandidateViewRow(row, { omitColumns: ['background_checks_json'] })
        })
      );
    }
  });
}

/**
 * @param {string} candidateGuidHex
 * @param {number} enterpriseId
 * @returns {Promise<Record<string, unknown>|null>}
 */
export async function getCandidateByGuidFromView(candidateGuidHex, enterpriseId) {
  const candidateGuid = ensureHex32(normalizeHex32(candidateGuidHex));
  const sql = `SELECT v.* FROM ${VIEW} v
    WHERE v.ENTERPRISE_ID = :p_enterprise_id
      AND UPPER(v.CANDIDATE_GUID) = :p_candidate_guid
    FETCH FIRST 1 ROWS ONLY`;

  try {
    return await withConnection(async (connection) => {
      const r = await connection.execute(
        sql,
        {
          p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
          p_candidate_guid: {
            val: candidateGuid,
            dir: oracledb.BIND_IN,
            type: oracledb.STRING,
            maxSize: 32
          }
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
