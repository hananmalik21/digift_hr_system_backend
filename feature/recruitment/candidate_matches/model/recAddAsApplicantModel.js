import oracledb from 'oracledb';
import {
  executePackagePlsql,
  guidInBind,
  normalizeOutGuidHex,
  normalizeOutNumber,
  normalizeOutString,
  numOrNull,
  statusOutBinds,
  strOrNull
} from '../../shared/oraclePackageUtils.js';
import { ADD_AS_APPLICANT_ERROR_MESSAGE } from '../utils/recCandidateMatchConstants.js';

const PKG = 'REC.ADD_AS_APPLICANT_PKG';
const LOG = 'recAddAsApplicantModel';

/**
 * @param {Record<string, unknown>|undefined} outBinds
 */
function parseAddAsApplicantOut(outBinds) {
  const ob = outBinds || {};
  return {
    application_id: normalizeOutNumber(ob.p_application_id),
    application_guid: normalizeOutGuidHex(ob.p_application_guid),
    application_number: normalizeOutString(ob.p_application_number),
    status: normalizeOutString(ob.p_status),
    message: normalizeOutString(ob.p_message) ?? ''
  };
}

const ADD_AS_APPLICANT_PLSQL = `
BEGIN
  ${PKG}.ADD_AS_APPLICANT(
    p_enterprise_id       => :p_enterprise_id,
    p_requisition_guid    => :p_requisition_guid,
    p_candidate_guid      => :p_candidate_guid,
    p_created_by          => :p_created_by,
    p_application_id      => :p_application_id,
    p_application_guid    => :p_application_guid,
    p_application_number  => :p_application_number,
    p_status              => :p_status,
    p_message             => :p_message
  );
END;`;

/**
 * Call REC.ADD_AS_APPLICANT_PKG.ADD_AS_APPLICANT.
 * Source is always HR_SYSTEM inside the package; do not pass source_code from the client.
 *
 * @param {{
 *   enterprise_id: number,
 *   requisition_guid: string,
 *   candidate_guid: string,
 *   created_by: string
 * }} params
 */
export async function addAsApplicantViaPackage(params) {
  const p = params || {};
  const binds = {
    p_enterprise_id: { val: numOrNull(p.enterprise_id), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_requisition_guid: guidInBind(p.requisition_guid),
    p_candidate_guid: guidInBind(p.candidate_guid),
    p_created_by: {
      val: strOrNull(p.created_by),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 200
    },
    p_application_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    p_application_guid: { dir: oracledb.BIND_OUT, type: oracledb.BUFFER, maxSize: 16 },
    p_application_number: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 50 },
    ...statusOutBinds()
  };

  return executePackagePlsql(
    ADD_AS_APPLICANT_PLSQL,
    binds,
    parseAddAsApplicantOut,
    `${LOG} ADD_AS_APPLICANT`,
    {
      application_id: null,
      application_guid: null,
      application_number: null,
      status: 'ERROR',
      message: ADD_AS_APPLICANT_ERROR_MESSAGE
    }
  );
}
