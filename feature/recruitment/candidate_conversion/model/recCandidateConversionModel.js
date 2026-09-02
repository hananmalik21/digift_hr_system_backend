import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import {
  guidHexInBind,
  normalizeOutGuidHex,
  normalizeOutNumber,
  normalizeOutString,
  numberInBind,
  outNumberBind,
  varcharInBind
} from '../../shared/oraclePackageUtils.js';
import { ROW_OPTS } from '../../shared/recViewModelUtils.js';
import {
  ACCEPTED_OFFER_STATUS,
  CONVERT_PROC,
  VALIDATE_PROC
} from '../utils/recCandidateConversionConstants.js';
import { ynToBoolean } from '../utils/recCandidateConversionValidators.js';

const NO_AUTOCOMMIT = Object.freeze({ autoCommit: false });

function outRaw16Bind() {
  return { dir: oracledb.BIND_OUT, type: oracledb.BUFFER, maxSize: 16 };
}

async function ignore(fn) {
  try {
    await fn();
  } catch (_) {
    /* connection already failed or closed */
  }
}

/**
 * Node.js does not duplicate conversion logic. These are the only package calls
 * for this workflow — do not call EMPL.EMPL_EMPLOYEE_CREATE_API_PKG.
 */
export const VALIDATE_PLSQL = `
BEGIN
    ${VALIDATE_PROC}(
        p_offer_guid  => HEXTORAW(:offer_guid),
        o_can_convert => :can_convert,
        o_message     => :message
    );
END;`;

export const CONVERT_PLSQL = `
BEGIN
    ${CONVERT_PROC}(
        p_offer_guid       => HEXTORAW(:offer_guid),
        p_probation_days   => :probation_days,
        p_actor            => :actor,

        o_employee_id      => :employee_id,
        o_employee_guid    => :employee_guid,
        o_employee_number  => :employee_number,

        o_assignment_id    => :assignment_id,
        o_assignment_guid  => :assignment_guid
    );
END;`;

export const CANDIDATE_EXISTS_SQL = `
SELECT 1 AS FOUND
  FROM REC.CANDIDATES c
 WHERE c.CANDIDATE_GUID = HEXTORAW(:candidate_guid)
 FETCH FIRST 1 ROWS ONLY`;

export const LATEST_ACCEPTED_OFFER_SQL = `
SELECT RAWTOHEX(o.OFFER_GUID) AS OFFER_GUID
  FROM REC.REC_JOB_OFFERS o
 WHERE o.CANDIDATE_GUID = HEXTORAW(:candidate_guid)
   AND UPPER(o.STATUS_CODE) = :status_code
 ORDER BY o.OFFER_ID DESC
 FETCH FIRST 1 ROWS ONLY`;

/**
 * @param {(connection: import('oracledb').Connection) => Promise<T>} work
 * @param {{ commitOnSuccess?: boolean }} [options]
 * @returns {Promise<T>}
 * @template T
 */
export async function withConversionConnection(work, { commitOnSuccess = false } = {}) {
  const connection = await db.getConnection();
  try {
    const result = await work(connection);
    if (commitOnSuccess) {
      await connection.commit();
    }
    return result;
  } catch (err) {
    await ignore(() => connection.rollback());
    throw err;
  } finally {
    await ignore(() => connection.close());
  }
}

/**
 * Candidate existence + latest ACCEPTED offer in one connection.
 * Lookup only — CONVERT_TO_EMPLOYEE still performs the write.
 *
 * @param {string} candidateGuidHex
 * @returns {Promise<{ candidateExists: boolean, offerGuid: string|null }>}
 */
export async function resolveAcceptedOfferForCandidate(candidateGuidHex) {
  const candidateBind = { candidate_guid: guidHexInBind(candidateGuidHex) };

  return withConversionConnection(async (connection) => {
    const existsResult = await connection.execute(CANDIDATE_EXISTS_SQL, candidateBind, ROW_OPTS);
    if (!existsResult.rows?.[0]) {
      return { candidateExists: false, offerGuid: null };
    }

    const offerResult = await connection.execute(
      LATEST_ACCEPTED_OFFER_SQL,
      {
        ...candidateBind,
        status_code: varcharInBind(ACCEPTED_OFFER_STATUS, 20)
      },
      ROW_OPTS
    );
    const row = offerResult.rows?.[0];
    const hex = row ? normalizeOutGuidHex(row.OFFER_GUID ?? row.offer_guid) : null;
    return {
      candidateExists: true,
      offerGuid: hex ? String(hex).toUpperCase() : null
    };
  });
}

/**
 * Call REC.CANDIDATE_TO_EMPLOYEE_PKG.VALIDATE_CONVERSION.
 * Read-only: no commit.
 *
 * @param {string} offerGuidHex
 * @returns {Promise<{ can_convert: boolean, message: string }>}
 */
export async function validateConversionViaPackage(offerGuidHex) {
  const binds = {
    offer_guid: guidHexInBind(offerGuidHex),
    can_convert: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 10 },
    message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
  };

  const result = await withConversionConnection(
    (connection) => connection.execute(VALIDATE_PLSQL, binds, NO_AUTOCOMMIT),
    { commitOnSuccess: false }
  );

  const out = result?.outBinds || {};
  return {
    can_convert: ynToBoolean(normalizeOutString(out.can_convert)),
    message: normalizeOutString(out.message) ?? ''
  };
}

/**
 * Call REC.CANDIDATE_TO_EMPLOYEE_PKG.CONVERT_TO_EMPLOYEE.
 * Node.js owns the transaction: commit on success, rollback on error.
 *
 * @param {{ offer_guid: string, actor: string, probation_days: number }} params
 */
export async function convertToEmployeeViaPackage(params) {
  const binds = {
    offer_guid: guidHexInBind(params.offer_guid),
    probation_days: numberInBind(params.probation_days),
    actor: varcharInBind(params.actor, 200),
    employee_id: outNumberBind(),
    employee_guid: outRaw16Bind(),
    employee_number: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 100 },
    assignment_id: outNumberBind(),
    assignment_guid: outRaw16Bind()
  };

  const result = await withConversionConnection(
    (connection) => connection.execute(CONVERT_PLSQL, binds, NO_AUTOCOMMIT),
    { commitOnSuccess: true }
  );

  const out = result?.outBinds || {};
  return {
    employee_id: normalizeOutNumber(out.employee_id),
    employee_guid: normalizeOutGuidHex(out.employee_guid),
    employee_number: normalizeOutString(out.employee_number),
    assignment_id: normalizeOutNumber(out.assignment_id),
    assignment_guid: normalizeOutGuidHex(out.assignment_guid)
  };
}
