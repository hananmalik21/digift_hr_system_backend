/**
 * Portal job-postings SQL and Oracle binds.
 * Application status is computed here — not stored on REC.V_JOB_POSTINGS.
 */

import oracledb from 'oracledb';
import { isHex32 } from '../../../../utils/guidUtils.js';
import { ValidationError } from '../../../../utils/errors/index.js';
import {
  INVALID_CANDIDATE_GUID_MESSAGE,
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
 * Accepts hyphenated or continuous hex GUID strings for :P_CANDIDATE_GUID.
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
 * @param {number} enterpriseId
 * @param {string|null} candidateGuid
 * @param {{ postingGuid?: string }} [extra]
 */
export function buildPortalBinds(enterpriseId, candidateGuid, extra = {}) {
  /** @type {Record<string, import('oracledb').BindParameter>} */
  const binds = {
    P_ENTERPRISE_ID: numberBind(enterpriseId),
    P_CANDIDATE_GUID: stringBind(candidateGuid)
  };
  if (extra.postingGuid != null) {
    binds.P_POSTING_GUID = stringBind(extra.postingGuid);
  }
  return binds;
}

export const VALIDATE_CANDIDATE_SQL = `
SELECT
    c.CANDIDATE_ID,
    LOWER(RAWTOHEX(c.CANDIDATE_GUID)) AS CANDIDATE_GUID
FROM ${REC_CANDIDATES_TABLE} c
WHERE c.ENTERPRISE_ID = :P_ENTERPRISE_ID
  AND c.CANDIDATE_GUID =
      HEXTORAW(REPLACE(:P_CANDIDATE_GUID, '-', ''))
FETCH FIRST 1 ROWS ONLY`;

const CANDIDATE_APPLICATION_CTES = `
WITH CANDIDATE_CONTEXT AS (
    SELECT
        c.CANDIDATE_ID,
        c.CANDIDATE_GUID,
        c.ENTERPRISE_ID
    FROM ${REC_CANDIDATES_TABLE} c
    WHERE c.ENTERPRISE_ID = :P_ENTERPRISE_ID
      AND :P_CANDIDATE_GUID IS NOT NULL
      AND c.CANDIDATE_GUID =
          HEXTORAW(REPLACE(:P_CANDIDATE_GUID, '-', ''))
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
        WHEN :P_CANDIDATE_GUID IS NULL THEN NULL
        WHEN ca.APPLICATION_ID IS NOT NULL THEN 'APPLIED'
        ELSE 'NOT_APPLIED'
    END AS APPLICATION_STATUS,

    CASE
        WHEN :P_CANDIDATE_GUID IS NULL THEN NULL
        WHEN ca.APPLICATION_ID IS NOT NULL THEN 'Y'
        ELSE 'N'
    END AS APPLIED_FLAG,

    CASE
        WHEN :P_CANDIDATE_GUID IS NULL THEN NULL
        ELSE ca.APPLICATION_ID
    END AS APPLICATION_ID,

    CASE
        WHEN :P_CANDIDATE_GUID IS NULL THEN NULL
        WHEN ca.APPLICATION_GUID IS NOT NULL
        THEN LOWER(RAWTOHEX(ca.APPLICATION_GUID))
        ELSE NULL
    END AS APPLICATION_GUID`;

const PORTAL_FROM_JOIN = `
FROM ${REC_JOB_POSTINGS_VIEW} jp

LEFT JOIN CANDIDATE_APPLICATIONS ca
  ON ca.ENTERPRISE_ID = jp.ENTERPRISE_ID
 AND ca.POSTING_ID    = jp.POSTING_ID
 AND ca.RN            = 1`;

function portalSelectSql(whereSql, { orderBy = '', fetchFirst = false } = {}) {
  return `
${CANDIDATE_APPLICATION_CTES}
SELECT
    jp.*,
${APPLICATION_STATUS_COLUMNS}
${PORTAL_FROM_JOIN}
WHERE ${whereSql}
${orderBy}
${fetchFirst ? 'FETCH FIRST 1 ROWS ONLY' : ''}`.trim();
}

export const PORTAL_JOB_POSTINGS_SQL = portalSelectSql(
  `jp.ENTERPRISE_ID = :P_ENTERPRISE_ID
  AND jp.PORTAL_VISIBLE_FLAG = 'Y'`,
  { orderBy: 'ORDER BY jp.CREATION_DATE DESC' }
);

export const PORTAL_JOB_POSTING_DETAIL_SQL = portalSelectSql(
  `jp.ENTERPRISE_ID = :P_ENTERPRISE_ID
  AND jp.POSTING_GUID = HEXTORAW(REPLACE(:P_POSTING_GUID, '-', ''))`,
  { fetchFirst: true }
);

export const PORTAL_JOB_POSTINGS_COUNT_SQL = `
SELECT COUNT(*) AS TOTAL_COUNT
FROM ${REC_JOB_POSTINGS_VIEW} jp
WHERE jp.ENTERPRISE_ID = :P_ENTERPRISE_ID
  AND jp.PORTAL_VISIBLE_FLAG = 'Y'`;

/** @param {unknown} err */
export function isInvalidHexOracleError(err) {
  return err?.errorNum === 1465 || /ORA-01465/i.test(String(err?.message ?? ''));
}
