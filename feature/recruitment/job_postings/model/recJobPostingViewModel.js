import oracledb from 'oracledb';
import { hexToRawBuffer } from '../../../../utils/guidUtils.js';
import { DatabaseError, NotFoundError, ValidationError } from '../../../../utils/errors/index.js';
import {
  mapResultRows,
  readTotalCount,
  rethrowUnlessOperational,
  ROW_OPTS,
  withConnection
} from '../../shared/recViewModelUtils.js';
import { parseEnterpriseIdFromQuery, parseListPagination } from '../../shared/recViewQueryValidators.js';
import {
  CANDIDATE_NOT_FOUND_MESSAGE,
  JOB_POSTING_SELECT_SQL,
  LOG_TAG,
  READ_ERROR_MESSAGE,
  REC_JOB_POSTINGS_VIEW
} from '../utils/recJobPostingConstants.js';
import {
  buildPortalListBinds,
  invalidCandidateGuidError,
  isInvalidHexOracleError,
  normalizeCandidateGuidBind,
  PORTAL_JOB_POSTINGS_COUNT_SQL,
  PORTAL_JOB_POSTINGS_SQL,
  toCandidateGuidResponse,
  VALIDATE_CANDIDATE_SQL
} from '../utils/recJobPostingPortalSql.js';
import { mapJobPostingViewRow } from '../utils/recJobPostingViewMapper.js';

/**
 * @param {import('oracledb').Connection} connection
 * @param {ReturnType<typeof buildPortalListBinds>} binds
 */
async function assertCandidateExists(connection, binds) {
  const result = await connection.execute(VALIDATE_CANDIDATE_SQL, binds, ROW_OPTS);
  if (!result.rows?.length) {
    throw new NotFoundError(CANDIDATE_NOT_FOUND_MESSAGE);
  }
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
    const binds = buildPortalListBinds(enterpriseId, candidateGuid);

    return await withConnection(async (connection) => {
      if (candidateGuid) {
        await assertCandidateExists(connection, binds);
      }

      const countResult = await connection.execute(
        PORTAL_JOB_POSTINGS_COUNT_SQL,
        { P_ENTERPRISE_ID: binds.P_ENTERPRISE_ID },
        ROW_OPTS
      );
      const total = readTotalCount(countResult);

      const offset = (page - 1) * limit;
      const dataResult = await connection.execute(
        `${PORTAL_JOB_POSTINGS_SQL}
OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
        {
          ...binds,
          offset: { val: offset, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
          limit: { val: limit, dir: oracledb.BIND_IN, type: oracledb.NUMBER }
        },
        ROW_OPTS
      );

      const rows = await mapResultRows(dataResult.rows, mapJobPostingViewRow);

      return {
        rows,
        total,
        page,
        limit,
        authenticated: Boolean(candidateGuid),
        candidate_guid: toCandidateGuidResponse(candidateGuid)
      };
    });
  } catch (err) {
    if (err instanceof ValidationError || err instanceof NotFoundError) throw err;
    if (isInvalidHexOracleError(err)) throw invalidCandidateGuidError();
    console.error(`[${LOG_TAG} listJobPostingsFromView]`, err);
    throw new DatabaseError(READ_ERROR_MESSAGE, err, READ_ERROR_MESSAGE);
  }
}

/**
 * @param {string} postingGuidHex
 * @param {number} enterpriseId
 */
export async function getJobPostingByGuidFromView(postingGuidHex, enterpriseId) {
  const guidBuf = hexToRawBuffer(postingGuidHex);
  const sql = `SELECT ${JOB_POSTING_SELECT_SQL} FROM ${REC_JOB_POSTINGS_VIEW} v
    WHERE v.ENTERPRISE_ID = :p_enterprise_id AND v.POSTING_GUID = :p_posting_guid
    FETCH FIRST 1 ROWS ONLY`;

  try {
    return await withConnection(async (connection) => {
      const r = await connection.execute(
        sql,
        {
          p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
          p_posting_guid: { val: guidBuf, dir: oracledb.BIND_IN, type: oracledb.BUFFER, maxSize: 16 }
        },
        ROW_OPTS
      );
      const row = r.rows?.[0];
      if (!row) return null;
      return mapJobPostingViewRow(row);
    });
  } catch (err) {
    rethrowUnlessOperational(err, `${LOG_TAG} getJobPostingByGuidFromView`, READ_ERROR_MESSAGE);
  }
}
