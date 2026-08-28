import oracledb from 'oracledb';
import {
  CANDIDATE_EDUCATION_FIELD,
  CANDIDATE_EXPERIENCE_FIELD,
  CANDIDATE_SKILLS_FIELD,
  candidateChildJsonToClobString,
  candidateSkillsToClobString,
  normalizeCandidateChildJsonRequestFields,
  normalizeSkillsFieldInBody
} from './recCandidateChildJsonUtils.js';

function childJsonClobBind(body, fieldName) {
  return {
    val: candidateChildJsonToClobString(body, fieldName),
    dir: oracledb.BIND_IN,
    type: oracledb.CLOB
  };
}

function skillsJsonClobBind(body) {
  normalizeSkillsFieldInBody(body);
  return {
    val: candidateSkillsToClobString(body),
    dir: oracledb.BIND_IN,
    type: oracledb.CLOB
  };
}

/**
 * Oracle IN binds for REC.CANDIDATE_PKG child JSON parameters.
 * Expects body fields already normalized by validateCandidateChildJsonFieldsInErrors.
 * @param {Record<string, unknown>} b
 */
export function buildCandidateChildJsonInBinds(b) {
  normalizeCandidateChildJsonRequestFields(b);

  return {
    p_education_json: childJsonClobBind(b, CANDIDATE_EDUCATION_FIELD),
    p_experience_json: childJsonClobBind(b, CANDIDATE_EXPERIENCE_FIELD),
    p_skills_json: skillsJsonClobBind(b)
  };
}
