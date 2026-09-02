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
  TRANSFER_PROC,
  UPDATE_TRANSFER_ACTION_PROC,
  VALIDATE_PROC
} from '../utils/recCandidateConversionConstants.js';
import { booleanToYn, ynToBoolean } from '../utils/recCandidateConversionValidators.js';

const NO_AUTOCOMMIT = Object.freeze({ autoCommit: false });

function outRaw16Bind() {
  return { dir: oracledb.BIND_OUT, type: oracledb.BUFFER, maxSize: 16 };
}

function outVarcharBind(maxSize) {
  return { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize };
}

function ynCharBind(flag) {
  return {
    val: booleanToYn(Boolean(flag)),
    dir: oracledb.BIND_IN,
    type: oracledb.STRING,
    maxSize: 1
  };
}

function employeeAssignmentOutBinds() {
  return {
    employee_id: outNumberBind(),
    employee_guid: outRaw16Bind(),
    employee_number: outVarcharBind(100),
    assignment_id: outNumberBind(),
    assignment_guid: outRaw16Bind()
  };
}

function mapEmployeeAssignmentOut(out) {
  return {
    employee_id: normalizeOutNumber(out.employee_id),
    employee_guid: normalizeOutGuidHex(out.employee_guid),
    employee_number: normalizeOutString(out.employee_number),
    assignment_id: normalizeOutNumber(out.assignment_id),
    assignment_guid: normalizeOutGuidHex(out.assignment_guid)
  };
}

function col(row, key) {
  return row?.[key] ?? row?.[String(key).toLowerCase()];
}

function formatDateOnly(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : null;
  }
  const s = String(value).trim();
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
}

function formatDateTime(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime())
      ? value.toISOString().slice(0, 19).replace('T', ' ')
      : null;
  }
  return String(value).trim() || null;
}

function candidateGuidBinds(candidateGuidHex) {
  return { candidate_guid: guidHexInBind(candidateGuidHex) };
}

function acceptedOfferLookupBinds(candidateGuidHex) {
  return {
    ...candidateGuidBinds(candidateGuidHex),
    status_code: varcharInBind(ACCEPTED_OFFER_STATUS, 20)
  };
}

async function executeValidate(connection, offerGuidHex) {
  const result = await connection.execute(
    VALIDATE_PLSQL,
    {
      offer_guid: guidHexInBind(offerGuidHex),
      can_convert: outVarcharBind(10),
      message: outVarcharBind(4000)
    },
    NO_AUTOCOMMIT
  );
  const out = result?.outBinds || {};
  return {
    can_convert: ynToBoolean(normalizeOutString(out.can_convert)),
    message: normalizeOutString(out.message) ?? ''
  };
}

async function fetchTransferContext(connection, candidateGuidHex) {
  const result = await connection.execute(
    TRANSFER_CONTEXT_SQL,
    acceptedOfferLookupBinds(candidateGuidHex),
    ROW_OPTS
  );
  const row = result.rows?.[0];
  if (!row) {
    return { candidateExists: false, offerGuid: null, candidateName: null, offer: null };
  }

  const offerGuidRaw = normalizeOutGuidHex(col(row, 'OFFER_GUID'));
  const offerGuid = offerGuidRaw ? String(offerGuidRaw).toUpperCase() : null;
  return {
    candidateExists: true,
    offerGuid,
    candidateName: normalizeOutString(col(row, 'CANDIDATE_NAME')),
    offer: offerGuid
      ? {
          offer_id: normalizeOutNumber(col(row, 'OFFER_ID')),
          offer_number: normalizeOutString(col(row, 'OFFER_NUMBER')),
          job_title: normalizeOutString(col(row, 'JOB_TITLE')),
          start_date: formatDateOnly(col(row, 'START_DATE')),
          employment_type: normalizeOutString(col(row, 'EMPLOYMENT_TYPE'))
        }
      : null
  };
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

export const TRANSFER_PLSQL = `
BEGIN
    ${TRANSFER_PROC}(
        p_offer_guid              => HEXTORAW(:offer_guid),
        p_probation_days          => :probation_days,
        p_hr_contact_id           => :hr_contact_id,
        p_transfer_notes          => :transfer_notes,
        p_send_notification_flag  => :send_notification_flag,
        p_trigger_onboarding_flag => :trigger_onboarding_flag,
        p_actor                   => :actor,

        o_employee_id             => :employee_id,
        o_employee_guid           => :employee_guid,
        o_employee_number         => :employee_number,

        o_assignment_id           => :assignment_id,
        o_assignment_guid         => :assignment_guid,

        o_transfer_id             => :transfer_id,
        o_transfer_guid           => :transfer_guid
    );
END;`;

export const UPDATE_TRANSFER_ACTION_PLSQL = `
BEGIN
    ${UPDATE_TRANSFER_ACTION_PROC}(
        p_transfer_id          => :transfer_id,
        p_notification_status  => :notification_status,
        p_notification_message => :notification_message,
        p_onboarding_status    => :onboarding_status,
        p_onboarding_reference => :onboarding_reference,
        p_actor                => :actor
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

export const TRANSFER_CONTEXT_SQL = `
SELECT
       RAWTOHEX(c.CANDIDATE_GUID) AS CANDIDATE_GUID,
       TRIM(c.FIRST_NAME || ' ' || NVL(c.MIDDLE_NAME, '') || ' ' || c.LAST_NAME) AS CANDIDATE_NAME,
       RAWTOHEX(o.OFFER_GUID) AS OFFER_GUID,
       o.OFFER_ID,
       o.OFFER_NUMBER,
       o.JOB_TITLE,
       o.START_DATE,
       o.EMPLOYMENT_TYPE_CODE AS EMPLOYMENT_TYPE
  FROM REC.CANDIDATES c
  LEFT JOIN REC.REC_JOB_OFFERS o
    ON o.CANDIDATE_GUID = c.CANDIDATE_GUID
   AND UPPER(o.STATUS_CODE) = :status_code
 WHERE c.CANDIDATE_GUID = HEXTORAW(:candidate_guid)
 ORDER BY o.OFFER_ID DESC NULLS LAST
 FETCH FIRST 1 ROWS ONLY`;

export const TRANSFER_HISTORY_SQL = `
SELECT
       t.TRANSFER_ID,
       RAWTOHEX(t.TRANSFER_GUID) AS TRANSFER_GUID,
       t.EMPLOYEE_ID,
       e.EMPLOYEE_NUMBER,
       t.ASSIGNMENT_ID,
       t.HR_CONTACT_ID,
       t.PROBATION_DAYS,
       t.SEND_NOTIFICATION_FLAG,
       t.NOTIFICATION_STATUS,
       t.TRIGGER_ONBOARDING_FLAG,
       t.ONBOARDING_STATUS,
       t.ONBOARDING_REFERENCE,
       t.TRANSFER_STATUS,
       t.CREATED_BY AS TRANSFERRED_BY,
       t.CREATION_DATE AS TRANSFER_DATE
  FROM REC.CANDIDATE_HR_TRANSFERS t
  LEFT JOIN EMPL.EMPLOYEES e
    ON e.EMPLOYEE_ID = t.EMPLOYEE_ID
 WHERE t.CANDIDATE_GUID = HEXTORAW(:candidate_guid)
 ORDER BY t.TRANSFER_ID DESC`;

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
  return withConversionConnection(async (connection) => {
    const existsResult = await connection.execute(
      CANDIDATE_EXISTS_SQL,
      candidateGuidBinds(candidateGuidHex),
      ROW_OPTS
    );
    if (!existsResult.rows?.[0]) {
      return { candidateExists: false, offerGuid: null };
    }

    const offerResult = await connection.execute(
      LATEST_ACCEPTED_OFFER_SQL,
      acceptedOfferLookupBinds(candidateGuidHex),
      ROW_OPTS
    );
    const row = offerResult.rows?.[0];
    const hex = row ? normalizeOutGuidHex(col(row, 'OFFER_GUID')) : null;
    return {
      candidateExists: true,
      offerGuid: hex ? String(hex).toUpperCase() : null
    };
  });
}

export async function candidateExistsByGuid(candidateGuidHex) {
  return withConversionConnection(async (connection) => {
    const result = await connection.execute(
      CANDIDATE_EXISTS_SQL,
      candidateGuidBinds(candidateGuidHex),
      ROW_OPTS
    );
    return Boolean(result.rows?.[0]);
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
  return withConversionConnection(
    (connection) => executeValidate(connection, offerGuidHex),
    { commitOnSuccess: false }
  );
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
    ...employeeAssignmentOutBinds()
  };

  const result = await withConversionConnection(
    (connection) => connection.execute(CONVERT_PLSQL, binds, NO_AUTOCOMMIT),
    { commitOnSuccess: true }
  );

  return mapEmployeeAssignmentOut(result?.outBinds || {});
}

/**
 * Candidate + latest ACCEPTED offer fields for Transfer to HR.
 * Lookup only — TRANSFER_TO_HR still performs the write.
 *
 * @param {string} candidateGuidHex
 */
export async function getTransferContextForCandidate(candidateGuidHex) {
  return withConversionConnection((connection) =>
    fetchTransferContext(connection, candidateGuidHex)
  );
}

/**
 * One connection: candidate + latest ACCEPTED offer + VALIDATE_CONVERSION.
 *
 * @param {string} candidateGuidHex
 */
export async function loadTransferDetailsSource(candidateGuidHex) {
  return withConversionConnection(async (connection) => {
    const context = await fetchTransferContext(connection, candidateGuidHex);
    if (!context.candidateExists || !context.offerGuid) {
      return { ...context, validation: null };
    }
    const validation = await executeValidate(connection, context.offerGuid);
    return { ...context, validation };
  });
}

/**
 * Call REC.CANDIDATE_TO_EMPLOYEE_PKG.TRANSFER_TO_HR.
 * Commits employee + assignment + xref + transfer row atomically.
 *
 * @param {{
 *   offer_guid: string,
 *   actor: string,
 *   probation_days: number,
 *   hr_contact_id: string|null,
 *   transfer_notes: string|null,
 *   send_notification: boolean,
 *   trigger_onboarding: boolean
 * }} params
 */
export async function transferToHrViaPackage(params) {
  const binds = {
    offer_guid: guidHexInBind(params.offer_guid),
    probation_days: numberInBind(params.probation_days),
    hr_contact_id: varcharInBind(params.hr_contact_id, 200),
    transfer_notes: varcharInBind(params.transfer_notes, 4000),
    send_notification_flag: ynCharBind(params.send_notification),
    trigger_onboarding_flag: ynCharBind(params.trigger_onboarding),
    actor: varcharInBind(params.actor, 200),
    ...employeeAssignmentOutBinds(),
    transfer_id: outNumberBind(),
    transfer_guid: outRaw16Bind()
  };

  const result = await withConversionConnection(
    (connection) => connection.execute(TRANSFER_PLSQL, binds, NO_AUTOCOMMIT),
    { commitOnSuccess: true }
  );

  const out = result?.outBinds || {};
  return {
    ...mapEmployeeAssignmentOut(out),
    transfer_id: normalizeOutNumber(out.transfer_id),
    transfer_guid: normalizeOutGuidHex(out.transfer_guid)
  };
}

/**
 * Call REC.CANDIDATE_TO_EMPLOYEE_PKG.UPDATE_TRANSFER_ACTION_STATUS.
 * Separate transaction from TRANSFER_TO_HR. Never used to undo a committed transfer.
 *
 * @param {{
 *   transfer_id: number,
 *   actor: string,
 *   notification_status?: string|null,
 *   notification_message?: string|null,
 *   onboarding_status?: string|null,
 *   onboarding_reference?: string|null
 * }} params
 */
export async function updateTransferActionStatusViaPackage(params) {
  const binds = {
    transfer_id: numberInBind(params.transfer_id),
    notification_status: varcharInBind(params.notification_status ?? null, 50),
    notification_message: varcharInBind(params.notification_message ?? null, 4000),
    onboarding_status: varcharInBind(params.onboarding_status ?? null, 50),
    onboarding_reference: varcharInBind(params.onboarding_reference ?? null, 200),
    actor: varcharInBind(params.actor, 200)
  };

  await withConversionConnection(
    (connection) => connection.execute(UPDATE_TRANSFER_ACTION_PLSQL, binds, NO_AUTOCOMMIT),
    { commitOnSuccess: true }
  );
}

/**
 * Read-only transfer history from REC.CANDIDATE_HR_TRANSFERS.
 *
 * @param {string} candidateGuidHex
 */
export async function listTransferHistoryForCandidate(candidateGuidHex) {
  return withConversionConnection(async (connection) => {
    const result = await connection.execute(
      TRANSFER_HISTORY_SQL,
      candidateGuidBinds(candidateGuidHex),
      ROW_OPTS
    );
    return (result.rows || []).map((row) => ({
      transfer_id: normalizeOutNumber(col(row, 'TRANSFER_ID')),
      employee_id: normalizeOutNumber(col(row, 'EMPLOYEE_ID')),
      employee_number: normalizeOutString(col(row, 'EMPLOYEE_NUMBER')),
      assignment_id: normalizeOutNumber(col(row, 'ASSIGNMENT_ID')),
      hr_contact_id: normalizeOutString(col(row, 'HR_CONTACT_ID')),
      probation_days: normalizeOutNumber(col(row, 'PROBATION_DAYS')) ?? 0,
      send_notification: ynToBoolean(col(row, 'SEND_NOTIFICATION_FLAG')),
      notification_status: normalizeOutString(col(row, 'NOTIFICATION_STATUS')),
      trigger_onboarding: ynToBoolean(col(row, 'TRIGGER_ONBOARDING_FLAG')),
      onboarding_status: normalizeOutString(col(row, 'ONBOARDING_STATUS')),
      transfer_status: normalizeOutString(col(row, 'TRANSFER_STATUS')),
      transferred_by: normalizeOutString(col(row, 'TRANSFERRED_BY')),
      transfer_date: formatDateTime(col(row, 'TRANSFER_DATE'))
    }));
  });
}
