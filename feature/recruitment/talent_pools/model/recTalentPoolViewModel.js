import oracledb from 'oracledb';
import { hexToRawBuffer } from '../../../../utils/guidUtils.js';
import { escapeLikePattern } from '../../../security/modules/utils/escapeLikePattern.js';
import {
  fetchPaginatedRows,
  isNonEmptyTrimmed,
  rethrowUnlessOperational,
  withConnection
} from '../../shared/recViewModelUtils.js';
import {
  parseEnterpriseIdFromQuery,
  parseListPagination
} from '../../shared/recViewQueryValidators.js';
import {
  mapCandidateTalentPoolRow,
  mapTalentPoolListRow
} from '../utils/recTalentPoolViewMapper.js';

const POOLS_VIEW = process.env.REC_TALENT_POOLS_V || 'REC.TALENT_POOLS_V';
const CANDIDATE_POOLS_VIEW =
  process.env.REC_CANDIDATE_TALENT_POOLS_V || 'REC.CANDIDATE_TALENT_POOLS_V';
const LOG_TAG = 'recTalentPoolViewModel';
const FETCH_ERROR_MESSAGE = 'Unable to fetch talent pools. Please try again.';

/**
 * @param {Record<string, unknown>|undefined} query
 * @param {{ extraWhere?: string[], extraBinds?: Record<string, unknown> }} [options]
 */
function buildListFilters(query, options = {}) {
  const enterprise_id = parseEnterpriseIdFromQuery(query);
  const { extraWhere = [], extraBinds = {} } = options;

  const binds = {
    p_enterprise_id: {
      val: enterprise_id,
      dir: oracledb.BIND_IN,
      type: oracledb.NUMBER
    },
    p_search_pat: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 4000 },
    ...extraBinds
  };

  const parts = [
    'v.ENTERPRISE_ID = :p_enterprise_id',
    `(
      :p_search_pat IS NULL
      OR LOWER(v.POOL_NAME) LIKE LOWER(:p_search_pat) ESCAPE '\\'
    )`,
    ...extraWhere
  ];

  if (isNonEmptyTrimmed(query?.search)) {
    binds.p_search_pat.val = `%${escapeLikePattern(String(query.search).trim())}%`;
  }

  return {
    whereSql: `WHERE ${parts.join(' AND ')}`,
    binds
  };
}

/**
 * @param {Record<string, unknown>|undefined} query
 * @returns {Promise<{ rows: Record<string, unknown>[], total: number, page: number, limit: number }>}
 */
export async function listTalentPoolsFromView(query) {
  try {
    const { page, limit } = parseListPagination(query);
    const { whereSql, binds } = buildListFilters(query);
    const selectSql = `
SELECT v.POOL_GUID,
       v.POOL_NAME,
       v.CANDIDATE_COUNT
  FROM ${POOLS_VIEW} v`;
    const orderSql = 'ORDER BY v.POOL_NAME ASC NULLS LAST';

    return await withConnection((connection) =>
      fetchPaginatedRows(connection, {
        view: POOLS_VIEW,
        selectSql,
        whereSql,
        binds,
        orderSql,
        page,
        limit,
        mapRow: mapTalentPoolListRow
      })
    );
  } catch (err) {
    rethrowUnlessOperational(err, `${LOG_TAG} listTalentPoolsFromView`, FETCH_ERROR_MESSAGE);
  }
}

/**
 * @param {string} candidateGuidHex
 * @param {Record<string, unknown>|undefined} query
 * @returns {Promise<{ rows: Record<string, unknown>[], total: number, page: number, limit: number }>}
 */
export async function listCandidateTalentPoolsFromView(candidateGuidHex, query) {
  try {
    const { page, limit } = parseListPagination(query);
    const { whereSql, binds } = buildListFilters(query, {
      extraWhere: ['v.CANDIDATE_GUID = :p_candidate_guid'],
      extraBinds: {
        p_candidate_guid: {
          val: hexToRawBuffer(candidateGuidHex),
          dir: oracledb.BIND_IN,
          type: oracledb.BUFFER,
          maxSize: 16
        }
      }
    });

    const selectSql = `
SELECT v.POOL_GUID,
       v.POOL_NAME,
       v.CANDIDATE_COUNT,
       v.SELECTED_FLAG
  FROM ${CANDIDATE_POOLS_VIEW} v`;
    const orderSql = 'ORDER BY v.POOL_NAME ASC NULLS LAST';

    return await withConnection((connection) =>
      fetchPaginatedRows(connection, {
        view: CANDIDATE_POOLS_VIEW,
        selectSql,
        whereSql,
        binds,
        orderSql,
        page,
        limit,
        mapRow: mapCandidateTalentPoolRow
      })
    );
  } catch (err) {
    rethrowUnlessOperational(err, `${LOG_TAG} listCandidateTalentPoolsFromView`, FETCH_ERROR_MESSAGE);
  }
}
