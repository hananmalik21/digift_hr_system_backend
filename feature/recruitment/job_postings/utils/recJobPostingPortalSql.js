/**
 * Portal job-postings list SQL and Oracle binds.
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
 * @param {number} enterpriseId
 * @param {string|null} candidateGuid
 */
export function buildPortalListBinds(enterpriseId, candidateGuid) {
  return {
    P_ENTERPRISE_ID: {
      val: Number(enterpriseId),
      dir: oracledb.BIND_IN,
      type: oracledb.NUMBER
    },
    P_CANDIDATE_GUID: {
      val: candidateGuid,
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 64
    }
  };
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

export const PORTAL_JOB_POSTINGS_SQL = `
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
)
SELECT
    jp.*,

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
    END AS APPLICATION_GUID

FROM ${REC_JOB_POSTINGS_VIEW} jp

LEFT JOIN CANDIDATE_APPLICATIONS ca
  ON ca.ENTERPRISE_ID = jp.ENTERPRISE_ID
 AND ca.POSTING_ID    = jp.POSTING_ID
 AND ca.RN            = 1

WHERE jp.ENTERPRISE_ID = :P_ENTERPRISE_ID
  AND jp.PORTAL_VISIBLE_FLAG = 'Y'

ORDER BY jp.CREATION_DATE DESC`;

export const PORTAL_JOB_POSTINGS_COUNT_SQL = `
SELECT COUNT(*) AS TOTAL_COUNT
FROM ${REC_JOB_POSTINGS_VIEW} jp
WHERE jp.ENTERPRISE_ID = :P_ENTERPRISE_ID
  AND jp.PORTAL_VISIBLE_FLAG = 'Y'`;

/** @param {unknown} err */
export function isInvalidHexOracleError(err) {
  return err?.errorNum === 1465 || /ORA-01465/i.test(String(err?.message ?? ''));
}
