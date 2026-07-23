import oracledb from 'oracledb';
import { DatabaseError, NotFoundError, ValidationError } from '../../../../utils/errors/index.js';
import { pruneBindsForSql } from '../../shared/recViewListSql.js';
import {
  mapResultRows,
  readTotalCount,
  ROW_OPTS,
  withConnection
} from '../../shared/recViewModelUtils.js';
import { parseEnterpriseIdFromQuery, parseListPagination } from '../../shared/recViewQueryValidators.js';
import {
  CANDIDATE_NOT_FOUND_MESSAGE,
  LOG_TAG,
  READ_ERROR_MESSAGE
} from '../utils/recJobPostingConstants.js';
import {
  buildCandidateAuthMeta,
  buildPortalBinds,
  invalidCandidateGuidError,
  isInvalidHexOracleError,
  normalizeCandidateGuidBind,
  PORTAL_JOB_POSTING_DETAIL_SQL,
  PORTAL_JOB_POSTINGS_COUNT_SQL,
  PORTAL_JOB_POSTINGS_SQL,
  VALIDATE_CANDIDATE_SQL
} from '../utils/recJobPostingPortalSql.js';
import { mapJobPostingViewRow } from '../utils/recJobPostingViewMapper.js';

/**
 * @param {import('oracledb').Connection} connection
 * @param {string} sql
 * @param {Record<string, import('oracledb').BindParameter>} binds
 */
async function executePortalSql(connection, sql, binds) {
  return connection.execute(sql, pruneBindsForSql(sql, binds), ROW_OPTS);
}

/**
 * @param {import('oracledb').Connection} connection
 * @param {Record<string, import('oracledb').BindParameter>} binds
 */
async function assertCandidateExists(connection, binds) {
  const result = await executePortalSql(connection, VALIDATE_CANDIDATE_SQL, binds);
  if (!result.rows?.length) {
    throw new NotFoundError(CANDIDATE_NOT_FOUND_MESSAGE);
  }
}

/**
 * @param {import('oracledb').Connection} connection
 * @param {string|null} candidateGuid
 * @param {Record<string, import('oracledb').BindParameter>} binds
 */
async function prepareCandidateContext(connection, candidateGuid, binds) {
  if (candidateGuid) {
    await assertCandidateExists(connection, binds);
  }
}

/**
 * @param {unknown} err
 * @param {string} context
 */
function rethrowPortalReadError(err, context) {
  if (err instanceof ValidationError || err instanceof NotFoundError) throw err;
  if (isInvalidHexOracleError(err)) throw invalidCandidateGuidError();
  console.error(`[${LOG_TAG} ${context}]`, err);
  throw new DatabaseError(READ_ERROR_MESSAGE, err, READ_ERROR_MESSAGE);
}

/**
 * Portal-visible job postings with optional per-candidate application status.
 * @param {Record<string, unknown>|undefined} query
 * @param {{ candidateGuid?: string|null }} [options]
 */
export async function listJobPostingsFromView(query, options = {}) {
  try {
    const enterpriseId = parseEnterpriseIdFromQuery(query);
    const { page, limit } = parseListPagination(query);
    const candidateGuid = normalizeCandidateGuidBind(options.candidateGuid ?? null);
    const binds = buildPortalBinds(enterpriseId, candidateGuid);

    return await withConnection(async (connection) => {
      await prepareCandidateContext(connection, candidateGuid, binds);

      const countResult = await executePortalSql(connection, PORTAL_JOB_POSTINGS_COUNT_SQL, binds);
      const total = readTotalCount(countResult);

      const offset = (page - 1) * limit;
      const dataSql = `${PORTAL_JOB_POSTINGS_SQL}
OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`;
      const dataResult = await executePortalSql(connection, dataSql, {
        ...binds,
        offset: { val: offset, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
        limit: { val: limit, dir: oracledb.BIND_IN, type: oracledb.NUMBER }
      });

      return {
        rows: await mapResultRows(dataResult.rows, mapJobPostingViewRow),
        total,
        page,
        limit,
        ...buildCandidateAuthMeta(candidateGuid)
      };
    });
  } catch (err) {
    rethrowPortalReadError(err, 'listJobPostingsFromView');
  }
}

/**
 * Job posting detail with optional per-candidate application status.
 * @param {string} postingGuidHex
 * @param {number} enterpriseId
 * @param {{ candidateGuid?: string|null }} [options]
 */
export async function getJobPostingByGuidFromView(postingGuidHex, enterpriseId, options = {}) {
  try {
    const candidateGuid = normalizeCandidateGuidBind(options.candidateGuid ?? null);
    const binds = buildPortalBinds(enterpriseId, candidateGuid, { postingGuid: postingGuidHex });

    return await withConnection(async (connection) => {
      await prepareCandidateContext(connection, candidateGuid, binds);

      const result = await executePortalSql(connection, PORTAL_JOB_POSTING_DETAIL_SQL, binds);
      const row = result.rows?.[0];
      if (!row) return null;

      return {
        detail: await mapJobPostingViewRow(row),
        ...buildCandidateAuthMeta(candidateGuid)
      };
    });
  } catch (err) {
    rethrowPortalReadError(err, 'getJobPostingByGuidFromView');
  }
}
