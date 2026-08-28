import oracledb from 'oracledb';
import {
  numOrNull,
  passwordHashInBind,
  strLinkInBind,
  strOrNull,
  ynInBind
} from '../../shared/oraclePackageUtils.js';
import { buildCandidateDemographicInBinds } from '../../candidates/utils/recCandidateDemographicBinds.js';
import { buildCandidateChildJsonInBinds } from '../../candidates/utils/recCandidateChildJsonBinds.js';

/** REGISTER_CANDIDATE_USER exposes P_NOTICE_PERIOD as VARCHAR2. */
export function noticePeriodBind(v) {
  if (v === undefined || v === null || v === '') {
    return { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 50 };
  }
  return { val: String(v).trim(), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 50 };
}

/**
 * Profile + credential IN binds for REC.CANDIDATE_USER_PKG.REGISTER_CANDIDATE_USER.
 * Optional demographics / education / experience / skills omitted → NULL.
 * Do not use education || [] / experience || [] / skills || [].
 * @param {Record<string, unknown>} b
 */
export function buildRegisterProfileInBinds(b) {
  return {
    p_enterprise_id: { val: numOrNull(b.enterprise_id), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_first_name: { val: strOrNull(b.first_name), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    p_middle_name: { val: strOrNull(b.middle_name), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    p_last_name: { val: strOrNull(b.last_name), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    p_email: { val: strOrNull(b.email), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 320 },
    p_phone: { val: strOrNull(b.phone), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 50 },
    ...buildCandidateDemographicInBinds(b),
    p_password_hash: passwordHashInBind(b.password_hash),
    p_current_title: {
      val: strOrNull(b.current_title),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 500
    },
    p_current_employer: {
      val: strOrNull(b.current_employer),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 500
    },
    p_years_experience: { val: numOrNull(b.years_experience), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_current_location: {
      val: strOrNull(b.current_location),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 500
    },
    p_source: { val: strOrNull(b.source), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 100 },
    p_current_salary: { val: numOrNull(b.current_salary), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_expected_salary: { val: numOrNull(b.expected_salary), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_salary_currency: {
      val: strOrNull(b.salary_currency),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 10
    },
    p_notice_period: noticePeriodBind(b.notice_period),
    p_linkedin_profile: strLinkInBind(b.linkedin_profile),
    p_portfolio_link: strLinkInBind(b.portfolio_link),
    p_github_link: strLinkInBind(b.github_link),
    p_willing_to_relocate: ynInBind(b.willing_to_relocate, 'N'),
    ...buildCandidateChildJsonInBinds(b),
    p_created_by: { val: strOrNull(b.created_by), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 }
  };
}
