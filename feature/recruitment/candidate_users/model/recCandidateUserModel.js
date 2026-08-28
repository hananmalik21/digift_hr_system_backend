import oracledb from 'oracledb';
import {
  packageStatusIsSuccess,
  parseCandidateRegistrationOut,
  statusOutBinds,
  withConnection
} from '../../shared/oraclePackageUtils.js';
import { buildRegisterProfileInBinds } from '../utils/recCandidateRegisterBinds.js';
import { REGISTER_GENERIC_ERROR } from '../utils/recCandidatePortalConstants.js';

export { packageStatusIsSuccess };

const PKG = 'REC.CANDIDATE_USER_PKG';
const REGISTER_PROC = `${PKG}.REGISTER_CANDIDATE_USER`;

const REGISTER_PLSQL = `
BEGIN
  ${REGISTER_PROC}(
    p_enterprise_id       => :p_enterprise_id,
    p_first_name          => :p_first_name,
    p_middle_name         => :p_middle_name,
    p_last_name           => :p_last_name,
    p_email               => :p_email,
    p_phone               => :p_phone,
    p_alternate_phone     => :p_alternate_phone,
    p_alternate_email     => :p_alternate_email,
    p_password_hash       => :p_password_hash,
    p_date_of_birth       => :p_date_of_birth,
    p_gender              => :p_gender,
    p_nationality         => :p_nationality,
    p_visa_status         => :p_visa_status,
    p_current_title       => :p_current_title,
    p_current_employer    => :p_current_employer,
    p_years_experience    => :p_years_experience,
    p_current_location    => :p_current_location,
    p_preferred_location  => :p_preferred_location,
    p_source              => :p_source,
    p_source_from         => :p_source_from,
    p_current_salary      => :p_current_salary,
    p_expected_salary     => :p_expected_salary,
    p_salary_currency     => :p_salary_currency,
    p_notice_period       => :p_notice_period,
    p_linkedin_profile    => :p_linkedin_profile,
    p_portfolio_link      => :p_portfolio_link,
    p_github_link         => :p_github_link,
    p_willing_to_relocate => :p_willing_to_relocate,
    p_skills_json         => :p_skills_json,
    p_created_by          => :p_created_by,
    p_candidate_id        => :p_candidate_id,
    p_candidate_guid      => :p_candidate_guid,
    p_candidate_user_id   => :p_candidate_user_id,
    p_candidate_user_guid => :p_candidate_user_guid,
    p_status              => :p_status,
    p_message             => :p_message
  );
END;`;

/**
 * @param {Record<string, unknown>} body Must include password_hash (never plain password).
 */
export async function registerCandidateUserViaPackage(body) {
  const binds = {
    ...buildRegisterProfileInBinds(body),
    p_candidate_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    p_candidate_guid: { dir: oracledb.BIND_OUT, type: oracledb.BUFFER, maxSize: 16 },
    p_candidate_user_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    p_candidate_user_guid: { dir: oracledb.BIND_OUT, type: oracledb.BUFFER, maxSize: 16 },
    ...statusOutBinds()
  };

  try {
    const result = await withConnection((connection) =>
      connection.execute(REGISTER_PLSQL, binds, { autoCommit: true })
    );
    return parseCandidateRegistrationOut(result?.outBinds);
  } catch (err) {
    console.error(
      '[recCandidateUserModel] REGISTER_CANDIDATE_USER failed:',
      err?.errorNum ?? '',
      '[redacted]'
    );
    return {
      candidate_id: null,
      candidate_guid: null,
      candidate_user_id: null,
      candidate_user_guid: null,
      status: 'ERROR',
      message: REGISTER_GENERIC_ERROR
    };
  }
}
