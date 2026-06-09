import oracledb from 'oracledb';
import {
  codeInBind,
  executePackagePlsql,
  guidInBind,
  jsonArrayToClobString,
  numOrNull,
  parseActionOut,
  parseCreateOut,
  statusOutBinds,
  strOrNull,
  withConnection
} from '../../shared/oraclePackageUtils.js';

export { packageStatusIsSuccess } from '../../shared/oraclePackageUtils.js';

const PKG = 'REC.REC_JOB_OFFER_PKG';
const CREATE_PROC = `${PKG}.CREATE_OFFER`;
const ACCEPT_PROC = `${PKG}.ACCEPT_OFFER`;
const DECLINE_PROC = `${PKG}.DECLINE_OFFER`;
const WITHDRAW_PROC = `${PKG}.WITHDRAW_OFFER`;

const GENERIC_ERROR_MESSAGE = 'Unable to process job offer. Please try again.';

function parseDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

function dateInBind(v) {
  return {
    val: parseDate(v),
    dir: oracledb.BIND_IN,
    type: oracledb.DATE
  };
}

function optionalGuidInBind(hex) {
  if (hex == null || hex === '') {
    return { val: null, dir: oracledb.BIND_IN, type: oracledb.BUFFER, maxSize: 16 };
  }
  return guidInBind(hex);
}

function jsonObjectToClobString(value) {
  if (value == null) return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return JSON.stringify(value);
  }
  return jsonArrayToClobString(value);
}

function packageCreateErrorResult(message = GENERIC_ERROR_MESSAGE) {
  return {
    offer_id: null,
    offer_guid: null,
    status: 'ERROR',
    message
  };
}

const CREATE_PLSQL = `
BEGIN
  ${CREATE_PROC}(
    p_enterprise_id         => :p_enterprise_id,
    p_application_guid      => :p_application_guid,
    p_candidate_guid        => :p_candidate_guid,
    p_posting_id            => :p_posting_id,
    p_job_title             => :p_job_title,
    p_position_id           => :p_position_id,
    p_department_id         => :p_department_id,
    p_location_id           => :p_location_id,
    p_work_mode_code        => :p_work_mode_code,
    p_employment_type_code  => :p_employment_type_code,
    p_grade_id              => :p_grade_id,
    p_reporting_manager_id  => :p_reporting_manager_id,
    p_start_date            => :p_start_date,
    p_comments              => :p_comments,
    p_created_by            => :p_created_by,
    p_components_json       => :p_components_json,
    p_benefits_json         => :p_benefits_json,
    p_terms_json            => :p_terms_json,
    p_offer_id              => :p_offer_id,
    p_offer_guid            => :p_offer_guid,
    p_status                => :p_status,
    p_message               => :p_message
  );
END;`;

function offerActionPlsql(procName) {
  return `
BEGIN
  ${procName}(
    p_offer_guid => :p_offer_guid,
    p_updated_by => :p_updated_by,
    p_status     => :p_status,
    p_message    => :p_message
  );
END;`;
}

const ACCEPT_PLSQL = offerActionPlsql(ACCEPT_PROC);
const DECLINE_PLSQL = offerActionPlsql(DECLINE_PROC);
const WITHDRAW_PLSQL = offerActionPlsql(WITHDRAW_PROC);

/**
 * @param {Record<string, unknown>} body
 */
function buildCreateInBinds(body) {
  const b = { ...(body || {}) };
  return {
    p_enterprise_id: { val: numOrNull(b.enterprise_id), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_application_guid: guidInBind(b.application_guid),
    p_candidate_guid: guidInBind(b.candidate_guid),
    p_posting_id: { val: numOrNull(b.posting_id), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_job_title: { val: strOrNull(b.job_title), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 500 },
    p_position_id: optionalGuidInBind(b.position_id),
    p_department_id: optionalGuidInBind(b.department_id),
    p_location_id: optionalGuidInBind(b.location_id),
    p_work_mode_code: codeInBind(b.work_mode_code),
    p_employment_type_code: codeInBind(b.employment_type_code),
    p_grade_id: { val: numOrNull(b.grade_id), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_reporting_manager_id: {
      val: numOrNull(b.reporting_manager_id),
      dir: oracledb.BIND_IN,
      type: oracledb.NUMBER
    },
    p_start_date: dateInBind(b.start_date),
    p_comments: { val: strOrNull(b.comments), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 4000 },
    p_created_by: { val: strOrNull(b.created_by), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    p_components_json: {
      val: jsonArrayToClobString(b.components, { allowEmptyArray: true }),
      dir: oracledb.BIND_IN,
      type: oracledb.CLOB
    },
    p_benefits_json: { val: jsonObjectToClobString(b.benefits), dir: oracledb.BIND_IN, type: oracledb.CLOB },
    p_terms_json: { val: jsonObjectToClobString(b.terms), dir: oracledb.BIND_IN, type: oracledb.CLOB },
    p_offer_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    p_offer_guid: { dir: oracledb.BIND_OUT, type: oracledb.BUFFER, maxSize: 16 },
    ...statusOutBinds()
  };
}

function buildOfferActionBinds(body) {
  const b = { ...(body || {}) };
  return {
    p_offer_guid: guidInBind(b.offer_guid),
    p_updated_by: { val: strOrNull(b.updated_by), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    ...statusOutBinds()
  };
}

/**
 * @param {Record<string, unknown>} body
 */
export async function createJobOfferViaPackage(body) {
  const binds = buildCreateInBinds(body);

  try {
    const result = await withConnection((connection) =>
      connection.execute(CREATE_PLSQL, binds, { autoCommit: true })
    );
    return parseCreateOut(result?.outBinds, {
      idKey: 'p_offer_id',
      guidKey: 'p_offer_guid',
      idField: 'offer_id',
      guidField: 'offer_guid'
    });
  } catch (err) {
    console.error('[recJobOffersModel] CREATE_OFFER failed:', err?.errorNum ?? '', '[redacted]');
    return packageCreateErrorResult(GENERIC_ERROR_MESSAGE);
  }
}

/**
 * @param {Record<string, unknown>} body
 */
export async function acceptOfferViaPackage(body) {
  return executePackagePlsql(
    ACCEPT_PLSQL,
    buildOfferActionBinds(body),
    parseActionOut,
    'recJobOffersModel.ACCEPT_OFFER',
    { status: 'ERROR', message: GENERIC_ERROR_MESSAGE }
  );
}

/**
 * @param {Record<string, unknown>} body
 */
export async function declineOfferViaPackage(body) {
  return executePackagePlsql(
    DECLINE_PLSQL,
    buildOfferActionBinds(body),
    parseActionOut,
    'recJobOffersModel.DECLINE_OFFER',
    { status: 'ERROR', message: GENERIC_ERROR_MESSAGE }
  );
}

/**
 * @param {Record<string, unknown>} body
 */
export async function withdrawOfferViaPackage(body) {
  return executePackagePlsql(
    WITHDRAW_PLSQL,
    buildOfferActionBinds(body),
    parseActionOut,
    'recJobOffersModel.WITHDRAW_OFFER',
    { status: 'ERROR', message: GENERIC_ERROR_MESSAGE }
  );
}
