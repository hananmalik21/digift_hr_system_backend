import oracledb from 'oracledb';
import { hexToRawBuffer, normalizeApiGuidString } from '../../../../utils/guidUtils.js';
import {
  ROW_OPTS,
  rethrowUnlessOperational,
  withConnection
} from '../../shared/recViewModelUtils.js';
import {
  LOG_TAG,
  REC_APPLICATION_MATCHES_TABLE,
  RECALCULATE_ERROR_MESSAGE
} from '../utils/recApplicationMatchConstants.js';
import { isMatchStoreUnavailableError } from '../utils/recApplicationMatchErrors.js';

function clobBind(value) {
  const text = value == null ? null : JSON.stringify(value);
  return { val: text, dir: oracledb.BIND_IN, type: oracledb.CLOB };
}

function numBind(value) {
  return { val: value == null ? null : Number(value), dir: oracledb.BIND_IN, type: oracledb.NUMBER };
}

function strBind(value, maxSize = 100) {
  return {
    val: value == null ? null : String(value),
    dir: oracledb.BIND_IN,
    type: oracledb.STRING,
    maxSize
  };
}

function guidBind(hex) {
  const normalized = hex ? normalizeApiGuidString(hex) : null;
  return {
    val: normalized ? hexToRawBuffer(normalized) : null,
    dir: oracledb.BIND_IN,
    type: oracledb.BUFFER,
    maxSize: 16
  };
}

const SCORE_COLUMNS_SET = `
  APPLICATION_GUID = :p_application_guid,
  REQUISITION_ID = :p_requisition_id,
  REQUISITION_GUID = :p_requisition_guid,
  CANDIDATE_ID = :p_candidate_id,
  CANDIDATE_GUID = :p_candidate_guid,
  ELIGIBILITY_STATUS = :p_eligibility_status,
  SKILLS_SCORE = :p_skills_score,
  EXPERIENCE_SCORE = :p_experience_score,
  QUALIFICATION_SCORE = :p_qualification_score,
  TITLE_SCORE = :p_title_score,
  JOB_FAMILY_LEVEL_SCORE = :p_job_family_level_score,
  SCREENING_SCORE = :p_screening_score,
  AVAILABILITY_SCORE = :p_availability_score,
  LOCATION_SCORE = :p_location_score,
  COMPENSATION_SCORE = :p_compensation_score,
  MATCH_SCORE = :p_match_score,
  MATCH_LEVEL = :p_match_level,
  RECOMMENDATION_CODE = :p_recommendation_code,
  COMPENSATION_STATUS = :p_compensation_status,
  PROFILE_COMPLETENESS = :p_profile_completeness,
  NOTICE_PERIOD_DAYS = :p_notice_period_days,
  ESTIMATED_AVAILABLE_DATE = TO_DATE(:p_estimated_available_date, 'YYYY-MM-DD'),
  MATCHED_SKILLS_JSON = :p_matched_skills_json,
  MISSING_SKILLS_JSON = :p_missing_skills_json,
  MATCHED_PREFERRED_SKILLS_JSON = :p_matched_preferred_skills_json,
  MATCH_REASONS_JSON = :p_match_reasons_json,
  CONCERNS_JSON = :p_concerns_json,
  MANDATORY_FAILURES_JSON = :p_mandatory_failures_json,
  MISSING_DATA_JSON = :p_missing_data_json,
  SCORE_BREAKDOWN_JSON = :p_score_breakdown_json,
  DETAIL_JSON = :p_detail_json,
  CALCULATED_AT = SYSTIMESTAMP,
  CALCULATED_BY = :p_calculated_by,
  LAST_UPDATE_DATE = SYSTIMESTAMP`;

const UPDATE_SQL = `UPDATE ${REC_APPLICATION_MATCHES_TABLE} SET ${SCORE_COLUMNS_SET}
  WHERE ENTERPRISE_ID = :p_enterprise_id AND APPLICATION_ID = :p_application_id`;

const INSERT_SQL = `INSERT INTO ${REC_APPLICATION_MATCHES_TABLE} (
  ENTERPRISE_ID, APPLICATION_ID, APPLICATION_GUID, REQUISITION_ID, REQUISITION_GUID,
  CANDIDATE_ID, CANDIDATE_GUID, ELIGIBILITY_STATUS,
  SKILLS_SCORE, EXPERIENCE_SCORE, QUALIFICATION_SCORE, TITLE_SCORE, JOB_FAMILY_LEVEL_SCORE,
  SCREENING_SCORE, AVAILABILITY_SCORE, LOCATION_SCORE, COMPENSATION_SCORE,
  MATCH_SCORE, MATCH_LEVEL, RECOMMENDATION_CODE, COMPENSATION_STATUS,
  PROFILE_COMPLETENESS, NOTICE_PERIOD_DAYS, ESTIMATED_AVAILABLE_DATE,
  MATCHED_SKILLS_JSON, MISSING_SKILLS_JSON, MATCHED_PREFERRED_SKILLS_JSON,
  MATCH_REASONS_JSON, CONCERNS_JSON, MANDATORY_FAILURES_JSON, MISSING_DATA_JSON,
  SCORE_BREAKDOWN_JSON, DETAIL_JSON, CALCULATED_AT, CALCULATED_BY
) VALUES (
  :p_enterprise_id, :p_application_id, :p_application_guid, :p_requisition_id, :p_requisition_guid,
  :p_candidate_id, :p_candidate_guid, :p_eligibility_status,
  :p_skills_score, :p_experience_score, :p_qualification_score, :p_title_score, :p_job_family_level_score,
  :p_screening_score, :p_availability_score, :p_location_score, :p_compensation_score,
  :p_match_score, :p_match_level, :p_recommendation_code, :p_compensation_status,
  :p_profile_completeness, :p_notice_period_days, TO_DATE(:p_estimated_available_date, 'YYYY-MM-DD'),
  :p_matched_skills_json, :p_missing_skills_json, :p_matched_preferred_skills_json,
  :p_match_reasons_json, :p_concerns_json, :p_mandatory_failures_json, :p_missing_data_json,
  :p_score_breakdown_json, :p_detail_json, SYSTIMESTAMP, :p_calculated_by
)`;

function buildMatchPersistBinds(ctx, result, calculatedBy) {
  const detail = {
    skills_contribution: result.skills_contribution,
    experience: result.experience,
    qualification: result.qualification,
    title: result.title,
    job_family: result.job_family,
    screening: result.screening,
    availability: result.availability,
    location: result.location,
    compensation: result.compensation,
    matched_requirements: result.matched_requirements,
    missing_requirements: result.missing_requirements,
    score_breakdown: result.score_breakdown
  };

  return {
    p_enterprise_id: numBind(ctx.enterprise_id),
    p_application_id: numBind(ctx.application_id),
    p_application_guid: guidBind(ctx.application_guid),
    p_requisition_id: numBind(ctx.requisition_id),
    p_requisition_guid: guidBind(ctx.requisition_guid),
    p_candidate_id: numBind(ctx.candidate_id),
    p_candidate_guid: guidBind(ctx.candidate_guid),
    p_eligibility_status: strBind(result.eligibility_status, 50),
    p_skills_score: numBind(result.scores.skills),
    p_experience_score: numBind(result.scores.experience),
    p_qualification_score: numBind(result.scores.qualification),
    p_title_score: numBind(result.scores.title),
    p_job_family_level_score: numBind(result.scores.job_family_level),
    p_screening_score: numBind(result.scores.screening),
    p_availability_score: numBind(result.scores.availability),
    p_location_score: numBind(result.scores.location),
    p_compensation_score: numBind(result.scores.compensation),
    p_match_score: numBind(result.match_score),
    p_match_level: strBind(result.match_level, 20),
    p_recommendation_code: strBind(result.recommendation, 30),
    p_compensation_status: strBind(result.compensation?.compensation_status, 30),
    p_profile_completeness: numBind(result.profile_completeness),
    p_notice_period_days: numBind(result.availability?.notice_period_days),
    p_estimated_available_date: strBind(result.availability?.estimated_available_date, 10),
    p_matched_skills_json: clobBind(result.matched_skills),
    p_missing_skills_json: clobBind(result.missing_required_skills),
    p_matched_preferred_skills_json: clobBind(result.matched_preferred_skills),
    p_match_reasons_json: clobBind(result.match_reasons),
    p_concerns_json: clobBind(result.concerns),
    p_mandatory_failures_json: clobBind(result.mandatory_failures),
    p_missing_data_json: clobBind(result.missing_data),
    p_score_breakdown_json: clobBind(result.score_breakdown),
    p_detail_json: clobBind(detail),
    p_calculated_by: strBind(calculatedBy || 'SYSTEM', 100)
  };
}

/** @param {string} applicationGuidHex @param {number} enterpriseId */
export async function getStoredMatchScore(applicationGuidHex, enterpriseId) {
  const sql = `SELECT MATCH_SCORE
    FROM ${REC_APPLICATION_MATCHES_TABLE}
    WHERE ENTERPRISE_ID = :p_enterprise_id
      AND APPLICATION_GUID = :p_application_guid
    FETCH FIRST 1 ROWS ONLY`;
  try {
    return await withConnection(async (connection) => {
      const r = await connection.execute(
        sql,
        {
          p_enterprise_id: numBind(enterpriseId),
          p_application_guid: guidBind(applicationGuidHex)
        },
        ROW_OPTS
      );
      const row = r.rows?.[0];
      if (!row) return null;
      const n = Number(row.MATCH_SCORE ?? row.match_score);
      return Number.isFinite(n) ? n : null;
    });
  } catch (err) {
    if (isMatchStoreUnavailableError(err)) return null;
    rethrowUnlessOperational(err, `${LOG_TAG} getStoredMatchScore`, RECALCULATE_ERROR_MESSAGE);
  }
}

/** @param {object} ctx @param {object} result @param {string} calculatedBy */
export async function upsertApplicationMatch(ctx, result, calculatedBy) {
  try {
    return await withConnection(async (connection) => {
      try {
        const updated = await connection.execute(
          UPDATE_SQL,
          buildMatchPersistBinds(ctx, result, calculatedBy),
          { autoCommit: false }
        );
        if (!Number(updated.rowsAffected || 0)) {
          await connection.execute(
            INSERT_SQL,
            buildMatchPersistBinds(ctx, result, calculatedBy),
            { autoCommit: false }
          );
        }
        await connection.commit();
      } catch (inner) {
        try {
          await connection.rollback();
        } catch {
          /* ignore rollback failure */
        }
        throw inner;
      }
    });
  } catch (err) {
    rethrowUnlessOperational(err, `${LOG_TAG} upsertApplicationMatch`, RECALCULATE_ERROR_MESSAGE);
  }
}
