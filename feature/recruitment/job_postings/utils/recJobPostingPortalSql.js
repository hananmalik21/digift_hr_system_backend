/**
 * Portal job-postings SQL and Oracle binds.
 * Application status is computed here — not stored on REC.V_JOB_POSTINGS.
 * List WHERE clauses come from buildJobPostingListFilters (alias `v`).
 */

import oracledb from 'oracledb';
import { isHex32 } from '../../../../utils/guidUtils.js';
import { ValidationError } from '../../../../utils/errors/index.js';
import {
  INVALID_CANDIDATE_GUID_MESSAGE,
  JOB_POSTING_SELECT_SQL,
  REC_APPLICATIONS_TABLE,
  REC_CANDIDATES_TABLE,
  REC_JOB_POSTINGS_VIEW
} from './recJobPostingConstants.js';

/** @param {unknown} val @param {number} [maxSize] */
function stringBind(val, maxSize = 64) {
  return { val, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize };
}

/** @param {unknown} val */
function numberBind(val) {
  return { val: Number(val), dir: oracledb.BIND_IN, type: oracledb.NUMBER };
}

export function invalidCandidateGuidError() {
  return new ValidationError(INVALID_CANDIDATE_GUID_MESSAGE, [INVALID_CANDIDATE_GUID_MESSAGE]);
}

/**
 * Accepts hyphenated or continuous hex GUID strings for :p_candidate_guid.
 * @param {unknown} raw
 * @returns {string|null}
 */
export function normalizeCandidateGuidBind(raw) {
  if (raw == null || raw === '') return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (!isHex32(trimmed)) throw invalidCandidateGuidError();
  return trimmed;
}

/** @param {string|null} candidateGuid */
export function toCandidateGuidResponse(candidateGuid) {
  return candidateGuid ? String(candidateGuid).replace(/-/g, '').toLowerCase() : null;
}

/**
 * Shared response fields when a candidate GUID is (or is not) in play.
 * @param {string|null} candidateGuid
 */
export function buildCandidateAuthMeta(candidateGuid) {
  const authenticated = Boolean(candidateGuid);
  return {
    authenticated,
    candidate_guid: authenticated ? toCandidateGuidResponse(candidateGuid) : null
  };
}

/**
 * Candidate bind only — enterprise comes from list filters (`p_enterprise_id`).
 * @param {string|null} candidateGuid
 * @param {{ postingGuid?: string }} [extra]
 */
export function buildCandidateBinds(candidateGuid, extra = {}) {
  /** @type {Record<string, import('oracledb').BindParameter>} */
  const binds = {
    p_candidate_guid: stringBind(candidateGuid)
  };
  if (extra.postingGuid != null) {
    binds.p_posting_guid = stringBind(extra.postingGuid);
  }
  return binds;
}

/**
 * Detail / validate binds (enterprise + optional candidate + posting).
 * @param {number} enterpriseId
 * @param {string|null} candidateGuid
 * @param {{ postingGuid?: string }} [extra]
 */
export function buildPortalBinds(enterpriseId, candidateGuid, extra = {}) {
  return {
    p_enterprise_id: numberBind(enterpriseId),
    ...buildCandidateBinds(candidateGuid, extra)
  };
}

export const VALIDATE_CANDIDATE_SQL = `
SELECT
    c.CANDIDATE_ID,
    LOWER(RAWTOHEX(c.CANDIDATE_GUID)) AS CANDIDATE_GUID
FROM ${REC_CANDIDATES_TABLE} c
WHERE c.ENTERPRISE_ID = :p_enterprise_id
  AND c.CANDIDATE_GUID =
      HEXTORAW(REPLACE(:p_candidate_guid, '-', ''))
FETCH FIRST 1 ROWS ONLY`;

const CANDIDATE_APPLICATION_CTES = `
WITH CANDIDATE_CONTEXT AS (
    SELECT
        c.CANDIDATE_ID,
        c.CANDIDATE_GUID,
        c.ENTERPRISE_ID
    FROM ${REC_CANDIDATES_TABLE} c
    WHERE c.ENTERPRISE_ID = :p_enterprise_id
      AND :p_candidate_guid IS NOT NULL
      AND c.CANDIDATE_GUID =
          HEXTORAW(REPLACE(:p_candidate_guid, '-', ''))
),
CANDIDATE_APPLICATIONS AS (
    SELECT
        ra.ENTERPRISE_ID,
        ra.POSTING_ID,
        ra.APPLICATION_ID,
        ra.APPLICATION_GUID,
        ROW_NUMBER() OVER (
            PARTITION BY ra.ENTERPRISE_ID, ra.POSTING_ID
            ORDER BY ra.APPLICATION_ID DESC
        ) AS RN
    FROM ${REC_APPLICATIONS_TABLE} ra
    JOIN CANDIDATE_CONTEXT cc
      ON cc.CANDIDATE_ID  = ra.CANDIDATE_ID
     AND cc.ENTERPRISE_ID = ra.ENTERPRISE_ID
)`;

const APPLICATION_STATUS_COLUMNS = `
    CASE
        WHEN :p_candidate_guid IS NULL THEN NULL
        WHEN ca.APPLICATION_ID IS NOT NULL THEN 'APPLIED'
        ELSE 'NOT_APPLIED'
    END AS APPLICATION_STATUS,

    CASE
        WHEN :p_candidate_guid IS NULL THEN NULL
        WHEN ca.APPLICATION_ID IS NOT NULL THEN 'Y'
        ELSE 'N'
    END AS APPLIED_FLAG,

    CASE
        WHEN :p_candidate_guid IS NULL THEN NULL
        ELSE ca.APPLICATION_ID
    END AS APPLICATION_ID,

    CASE
        WHEN :p_candidate_guid IS NULL THEN NULL
        WHEN ca.APPLICATION_GUID IS NOT NULL
        THEN LOWER(RAWTOHEX(ca.APPLICATION_GUID))
        ELSE NULL
    END AS APPLICATION_GUID`;

const PORTAL_FROM_JOIN = `
FROM ${REC_JOB_POSTINGS_VIEW} v

LEFT JOIN CANDIDATE_APPLICATIONS ca
  ON ca.ENTERPRISE_ID = v.ENTERPRISE_ID
 AND ca.POSTING_ID    = v.POSTING_ID
 AND ca.RN            = 1`;

/**
 * @param {string} whereSql  Full WHERE clause including the WHERE keyword (from list filters)
 * @param {{ orderBy?: string, fetchFirst?: boolean }} [options]
 */
export function buildPortalListSelectSql(whereSql, { orderBy = '', fetchFirst = false } = {}) {
  return `
${CANDIDATE_APPLICATION_CTES}
SELECT
    ${JOB_POSTING_SELECT_SQL},
${APPLICATION_STATUS_COLUMNS}
${PORTAL_FROM_JOIN}
${whereSql}
${orderBy}
${fetchFirst ? 'FETCH FIRST 1 ROWS ONLY' : ''}`.trim();
}

/**
 * Count with the same filter WHERE as the list (no candidate join needed).
 * @param {string} whereSql
 */
export function buildPortalListCountSql(whereSql) {
  return `SELECT COUNT(*) AS TOTAL_COUNT FROM ${REC_JOB_POSTINGS_VIEW} v ${whereSql}`;
}

/** Detail: one posting by GUID (alias `v` for consistency). */
export const PORTAL_JOB_POSTING_DETAIL_SQL = buildPortalListSelectSql(
  `WHERE v.ENTERPRISE_ID = :p_enterprise_id
  AND v.POSTING_GUID = HEXTORAW(REPLACE(:p_posting_guid, '-', ''))`,
  { fetchFirst: true }
);

export const PORTAL_JOB_POSTINGS_SQL = buildPortalListSelectSql(
  `WHERE v.ENTERPRISE_ID = :p_enterprise_id
  AND v.PORTAL_VISIBLE_FLAG = 'Y'`,
  { orderBy: 'ORDER BY v.CREATION_DATE DESC' }
);

export const PORTAL_JOB_POSTINGS_COUNT_SQL = buildPortalListCountSql(
  `WHERE v.ENTERPRISE_ID = :p_enterprise_id
  AND v.PORTAL_VISIBLE_FLAG = 'Y'`
);

/** @param {unknown} err */
export function isInvalidHexOracleError(err) {
  return err?.errorNum === 1465 || /ORA-01465/i.test(String(err?.message ?? ''));
}
