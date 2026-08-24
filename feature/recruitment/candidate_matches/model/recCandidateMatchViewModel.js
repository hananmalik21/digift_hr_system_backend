import oracledb from 'oracledb';
import { hexToRawBuffer } from '../../../../utils/guidUtils.js';
import {
  fetchPaginatedRows,
  rethrowUnlessOperational,
  ROW_OPTS,
  withConnection
} from '../../shared/recViewModelUtils.js';
import { buildCandidateMatchListFilters } from '../utils/recCandidateMatchFilters.js';
import { mapCandidateMatchRow, normalizeGuidValue, strOrNull } from '../utils/recCandidateMatchMappers.js';
import {
  INACTIVE_APPLICATION_STATUS_CODES,
  LOG_TAG,
  READ_ERROR_MESSAGE,
  REC_APPLICATIONS_VIEW,
  REC_CANDIDATE_MATCH_VIEW,
  REC_CANDIDATES_FULL_VIEW,
  REC_JOB_POSTINGS_VIEW,
  REC_REQUISITION_LIST_VIEW
} from '../utils/recCandidateMatchConstants.js';
import { parseFindCandidatesPagination } from '../utils/recCandidateMatchValidators.js';

function guidEnterpriseBinds(guidHex, enterpriseId, guidBindName) {
  return {
    p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    [guidBindName]: {
      val: hexToRawBuffer(guidHex),
      dir: oracledb.BIND_IN,
      type: oracledb.BUFFER,
      maxSize: 16
    }
  };
}

function requisitionCandidateBinds(requisitionGuidHex, candidateGuidHex, enterpriseId) {
  return {
    p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_requisition_guid: {
      val: hexToRawBuffer(requisitionGuidHex),
      dir: oracledb.BIND_IN,
      type: oracledb.BUFFER,
      maxSize: 16
    },
    p_candidate_guid: {
      val: hexToRawBuffer(candidateGuidHex),
      dir: oracledb.BIND_IN,
      type: oracledb.BUFFER,
      maxSize: 16
    }
  };
}

function inactiveStatusSql(alias = 'a') {
  const codes = INACTIVE_APPLICATION_STATUS_CODES.map((c) => `'${c}'`).join(', ');
  return `(${alias}.STATUS_CODE IS NULL OR ${alias}.STATUS_CODE NOT IN (${codes}))`;
}

const APPLIED_JOIN_SQL = `
LEFT JOIN (
  SELECT
    a.ENTERPRISE_ID,
    a.REQUISITION_GUID,
    a.CANDIDATE_GUID,
    a.APPLICATION_GUID AS APPLIED_APPLICATION_GUID,
    a.CURRENT_STAGE_CODE AS APPLIED_APPLICATION_STAGE,
    a.STATUS_CODE AS APPLIED_STATUS_CODE,
    ROW_NUMBER() OVER (
      PARTITION BY a.ENTERPRISE_ID, a.REQUISITION_GUID, a.CANDIDATE_GUID
      ORDER BY a.APPLIED_DATE DESC NULLS LAST, a.APPLICATION_ID DESC
    ) AS RN
  FROM ${REC_APPLICATIONS_VIEW} a
  WHERE a.ENTERPRISE_ID = :p_enterprise_id
    AND a.REQUISITION_GUID = :p_requisition_guid
    AND ${inactiveStatusSql('a')}
) applied
  ON applied.ENTERPRISE_ID = v.ENTERPRISE_ID
 AND applied.REQUISITION_GUID = v.REQUISITION_GUID
 AND applied.CANDIDATE_GUID = v.CANDIDATE_GUID
 AND applied.RN = 1`;

/**
 * @param {string} requisitionGuidHex
 * @param {number} enterpriseId
 */
export async function getRequisitionHeaderFromView(requisitionGuidHex, enterpriseId) {
  const sql = `SELECT v.REQUISITION_GUID, v.REQUISITION_NUMBER, v.REQUISITION_TITLE, v.ENTERPRISE_ID
    FROM ${REC_REQUISITION_LIST_VIEW} v
    WHERE v.ENTERPRISE_ID = :p_enterprise_id
      AND v.REQUISITION_GUID = :p_requisition_guid
    FETCH FIRST 1 ROWS ONLY`;

  try {
    return await withConnection(async (connection) => {
      const r = await connection.execute(
        sql,
        guidEnterpriseBinds(requisitionGuidHex, enterpriseId, 'p_requisition_guid'),
        ROW_OPTS
      );
      const row = r.rows?.[0];
      if (!row) return null;
      return {
        requisition_guid: normalizeGuidValue(row.REQUISITION_GUID ?? row.requisition_guid),
        requisition_number: strOrNull(row.REQUISITION_NUMBER ?? row.requisition_number),
        requisition_title: strOrNull(row.REQUISITION_TITLE ?? row.requisition_title),
        enterprise_id: Number(row.ENTERPRISE_ID ?? row.enterprise_id)
      };
    });
  } catch (err) {
    rethrowUnlessOperational(err, `${LOG_TAG} getRequisitionHeaderFromView`, READ_ERROR_MESSAGE);
  }
}

/**
 * @param {string} candidateGuidHex
 * @param {number} enterpriseId
 */
export async function candidateExistsInView(candidateGuidHex, enterpriseId) {
  const sql = `SELECT 1 AS FOUND
    FROM ${REC_CANDIDATES_FULL_VIEW} v
    WHERE v.ENTERPRISE_ID = :p_enterprise_id
      AND v.CANDIDATE_GUID = :p_candidate_guid
    FETCH FIRST 1 ROWS ONLY`;

  try {
    return await withConnection(async (connection) => {
      const r = await connection.execute(
        sql,
        guidEnterpriseBinds(candidateGuidHex, enterpriseId, 'p_candidate_guid'),
        ROW_OPTS
      );
      return Boolean(r.rows?.[0]);
    });
  } catch (err) {
    rethrowUnlessOperational(err, `${LOG_TAG} candidateExistsInView`, READ_ERROR_MESSAGE);
  }
}

/**
 * @param {string} requisitionGuidHex
 * @param {string} candidateGuidHex
 * @param {number} enterpriseId
 */
export async function findExistingApplication(requisitionGuidHex, candidateGuidHex, enterpriseId) {
  const sql = `SELECT a.APPLICATION_GUID, a.CURRENT_STAGE_CODE, a.STATUS_CODE
    FROM ${REC_APPLICATIONS_VIEW} a
    WHERE a.ENTERPRISE_ID = :p_enterprise_id
      AND a.REQUISITION_GUID = :p_requisition_guid
      AND a.CANDIDATE_GUID = :p_candidate_guid
      AND ${inactiveStatusSql('a')}
    ORDER BY a.APPLIED_DATE DESC NULLS LAST, a.APPLICATION_ID DESC
    FETCH FIRST 1 ROWS ONLY`;

  try {
    return await withConnection(async (connection) => {
      const r = await connection.execute(
        sql,
        requisitionCandidateBinds(requisitionGuidHex, candidateGuidHex, enterpriseId),
        ROW_OPTS
      );
      const row = r.rows?.[0];
      if (!row) return null;
      return {
        application_guid: normalizeGuidValue(row.APPLICATION_GUID ?? row.application_guid),
        application_stage: strOrNull(row.CURRENT_STAGE_CODE ?? row.current_stage_code),
        status_code: strOrNull(row.STATUS_CODE ?? row.status_code)
      };
    });
  } catch (err) {
    rethrowUnlessOperational(err, `${LOG_TAG} findExistingApplication`, READ_ERROR_MESSAGE);
  }
}

/**
 * Prefer an active posting for the requisition so apply_job can run.
 * @param {string} requisitionGuidHex
 * @param {number} enterpriseId
 */
export async function findPostingForRequisition(requisitionGuidHex, enterpriseId) {
  const sql = `SELECT v.POSTING_GUID, v.STATUS_CODE
    FROM ${REC_JOB_POSTINGS_VIEW} v
    WHERE v.ENTERPRISE_ID = :p_enterprise_id
      AND v.REQUISITION_GUID = :p_requisition_guid
    ORDER BY
      CASE
        WHEN UPPER(v.STATUS_CODE) = 'ACTIVE' THEN 0
        WHEN UPPER(v.STATUS_CODE) = 'POSTED' THEN 1
        WHEN UPPER(v.STATUS_CODE) = 'PAUSED' THEN 2
        ELSE 3
      END,
      v.POSTED_DATE DESC NULLS LAST,
      v.POSTING_ID DESC
    FETCH FIRST 1 ROWS ONLY`;

  try {
    return await withConnection(async (connection) => {
      const r = await connection.execute(
        sql,
        guidEnterpriseBinds(requisitionGuidHex, enterpriseId, 'p_requisition_guid'),
        ROW_OPTS
      );
      const row = r.rows?.[0];
      if (!row) return null;
      return {
        posting_guid: normalizeGuidValue(row.POSTING_GUID ?? row.posting_guid),
        status_code: strOrNull(row.STATUS_CODE ?? row.status_code)
      };
    });
  } catch (err) {
    rethrowUnlessOperational(err, `${LOG_TAG} findPostingForRequisition`, READ_ERROR_MESSAGE);
  }
}

/**
 * @param {string} applicationGuidHex
 * @param {number} enterpriseId
 */
export async function getApplicationStageByGuid(applicationGuidHex, enterpriseId) {
  const sql = `SELECT a.APPLICATION_GUID, a.CURRENT_STAGE_CODE, a.STATUS_CODE
    FROM ${REC_APPLICATIONS_VIEW} a
    WHERE a.ENTERPRISE_ID = :p_enterprise_id
      AND a.APPLICATION_GUID = :p_application_guid
    FETCH FIRST 1 ROWS ONLY`;

  try {
    return await withConnection(async (connection) => {
      const r = await connection.execute(
        sql,
        guidEnterpriseBinds(applicationGuidHex, enterpriseId, 'p_application_guid'),
        ROW_OPTS
      );
      const row = r.rows?.[0];
      if (!row) return null;
      return {
        application_guid: normalizeGuidValue(row.APPLICATION_GUID ?? row.application_guid),
        application_stage: strOrNull(row.CURRENT_STAGE_CODE ?? row.current_stage_code),
        status_code: strOrNull(row.STATUS_CODE ?? row.status_code)
      };
    });
  } catch (err) {
    rethrowUnlessOperational(err, `${LOG_TAG} getApplicationStageByGuid`, READ_ERROR_MESSAGE);
  }
}

/**
 * Database-level pagination/filter/sort against REC.V_REQUISITION_CANDIDATE_MATCH.
 * @param {string} requisitionGuidHex
 * @param {number} enterpriseId
 * @param {Record<string, unknown>|undefined} query
 */
export async function listCandidateMatchesFromView(requisitionGuidHex, enterpriseId, query) {
  try {
    const { page, limit } = parseFindCandidatesPagination(query);
    const { whereSql, binds, orderSql } = buildCandidateMatchListFilters(
      requisitionGuidHex,
      enterpriseId,
      query
    );
    // Prefer TO_CHAR for date-only so the calendar day is not shifted by timezone.
    const selectSql = `SELECT
  v.*,
  TO_CHAR(v.ESTIMATED_AVAILABLE_DATE, 'YYYY-MM-DD') AS ESTIMATED_AVAILABLE_DATE_ISO,
  applied.APPLIED_APPLICATION_GUID
      FROM ${REC_CANDIDATE_MATCH_VIEW} v
      ${APPLIED_JOIN_SQL}`;

    return await withConnection((connection) =>
      fetchPaginatedRows(connection, {
        view: REC_CANDIDATE_MATCH_VIEW,
        selectSql,
        whereSql,
        binds,
        orderSql,
        page,
        limit,
        mapRow: mapCandidateMatchRow
      })
    );
  } catch (err) {
    rethrowUnlessOperational(err, `${LOG_TAG} listCandidateMatchesFromView`, READ_ERROR_MESSAGE);
  }
}
