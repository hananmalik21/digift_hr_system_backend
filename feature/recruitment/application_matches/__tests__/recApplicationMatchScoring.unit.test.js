/**
 * Deterministic application-match scoring. No live Oracle required.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateApplicationMatch,
  matchLevelFromScore,
  normalizeRequisitionSkills,
  recommendationFromScore,
  scoreAvailability,
  scoreCompensation,
  scoreExperience,
  scoreSkills,
  scoreTitle
} from '../utils/recApplicationMatchScoring.js';
import { COMPENSATION_STATUS, ELIGIBILITY_STATUS, MATCH_LEVELS } from '../utils/recApplicationMatchConstants.js';
import { jaroWinklerSimilarity, titleSimilarityScore } from '../utils/recApplicationMatchTextUtils.js';

const GEN_AI_REQ = {
  requisition_title: 'Gen-AI Engineer',
  position_name: 'Gen-AI Engineer',
  experience_required_code: 'MID_3_5',
  min_education_level_code: 'BACHELOR',
  preferred_field_of_study: 'Computer Science',
  required_certifications: 'Software Engineering Certification',
  work_mode_code: 'HYBRID',
  location_name: 'Lahore',
  currency_code: 'PKR',
  minimum_salary: 200000,
  maximum_salary: 350000,
  skills: [
    { skill_name: 'Python', required_flag: 'Y' },
    { skill_name: 'LangChain', required_flag: 'Y' },
    { skill_name: 'RAG', required_flag: 'Y' },
    { skill_name: 'FastAPI', required_flag: 'Y' },
    { skill_name: 'LangGraph', required_flag: 'Y' },
    { skill_name: 'AWS', required_flag: 'N' }
  ]
};

function candidateWithSkills(skillNames, extra = {}) {
  return {
    full_name: 'Hashim Ahmad',
    email: 'candidate@email.com',
    current_title: extra.current_title ?? 'AI Engineer',
    current_employer: 'ABC Technologies',
    years_experience: extra.years_experience ?? 4,
    current_location: extra.current_location ?? 'Lahore',
    expected_salary: extra.expected_salary ?? 280000,
    salary_currency: extra.salary_currency ?? 'PKR',
    notice_period: extra.notice_period ?? 30,
    willing_to_relocate: extra.willing_to_relocate ?? 'N',
    education: extra.education ?? [
      { degree_name: "Bachelor's", field_of_study: 'Computer Science' }
    ],
    experience: extra.experience ?? [
      {
        job_title: 'AI Engineer',
        start_date: '2022-01-01',
        current_job_flag: 'Y',
        description: 'Built RAG pipelines with Python and LangChain'
      }
    ],
    assessments: [{ skills_json: skillNames }]
  };
}

test('skills formula uses 70/30 required vs preferred split', () => {
  const reqSkills = normalizeRequisitionSkills(GEN_AI_REQ.skills);
  const result = scoreSkills(
    reqSkills,
    candidateWithSkills(['Python', 'LangChain', 'RAG', 'FastAPI', 'AWS'])
  );
  assert.equal(result.required_matched, 4);
  assert.equal(result.required_total, 5);
  assert.ok(result.matched_skills.includes('Python'));
  assert.ok(result.missing_required_skills.includes('LangGraph'));
  assert.deepEqual(result.matched_preferred_skills, ['AWS']);
  assert.equal(result.raw_score, 86);
});

test('missing candidate skill profile is unknown, not a confirmed mismatch', () => {
  const reqSkills = normalizeRequisitionSkills(GEN_AI_REQ.skills);
  const result = scoreSkills(reqSkills, {
    current_title: null,
    education: [],
    experience: [],
    assessments: []
  });
  assert.equal(result.unknown, true);
  assert.equal(result.raw_score, 50);
  assert.deepEqual(result.missing_required_skills, []);
});

test('experience within 3–5 years meets requirement; 20 years is not automatically better', () => {
  const band = { min: 3, max: 5, label: '3–5 years' };
  const mid = scoreExperience(4, null, band);
  const over = scoreExperience(20, null, band);
  assert.equal(mid.experience_status, 'MEETS_REQUIREMENT');
  assert.ok(mid.raw_score >= 90);
  assert.equal(over.experience_status, 'EXCEEDS_REQUIREMENT');
  assert.ok(over.raw_score < mid.raw_score);
});

test('past target start date does not penalize notice-period availability', () => {
  const now = new Date('2026-08-23T00:00:00Z');
  const scored = scoreAvailability(30, '2026-01-01', now);
  assert.equal(scored.raw_score, 80);
  assert.equal(scored.score, 80);
  assert.equal(scored.code, 'WITHIN_1_MONTH');
  assert.equal(scored.display, 'Available in 1 month');
  assert.equal(scored.notice_period_days, 30);
  assert.equal(scored.estimated_available_date, '2026-09-22');
});

test('availability codes follow notice-period buckets', () => {
  const now = new Date('2026-08-24T00:00:00Z');
  assert.equal(scoreAvailability(0, null, now).code, 'IMMEDIATE');
  assert.equal(scoreAvailability(14, null, now).code, 'WITHIN_2_WEEKS');
  assert.equal(scoreAvailability(null, null, now).code, 'UNKNOWN');
  assert.equal(scoreAvailability(null, null, now).display, 'Availability unknown');
});

test('compensation is NOT_COMPARABLE across currencies and does not invent a score', () => {
  const scored = scoreCompensation(
    { expected_salary: 300000, salary_currency: 'PKR' },
    { minimum_salary: 200000, maximum_salary: 400000, currency_code: 'KWD' }
  );
  assert.equal(scored.compensation_status, COMPENSATION_STATUS.NOT_COMPARABLE);
  assert.equal(scored.raw_score, 50);
});

test('title similarity is high for AI title variants and low for unrelated roles', () => {
  const ai = titleSimilarityScore('AI Engineer', 'Gen-AI Engineer');
  const ml = titleSimilarityScore('Machine Learning Engineer', 'Gen-AI Engineer');
  const finance = titleSimilarityScore('Finance Manager', 'Gen-AI Engineer');
  const design = titleSimilarityScore('UI/UX Designer', 'Gen-AI Engineer');
  assert.ok(ai >= 78, `AI Engineer score ${ai}`);
  assert.ok(ml >= 78, `ML Engineer score ${ml}`);
  assert.ok(finance <= 38, `Finance Manager score ${finance}`);
  assert.ok(design <= 38, `Designer score ${design}`);
});

test('jaro winkler is deterministic and 0–100', () => {
  assert.equal(jaroWinklerSimilarity('python', 'python'), 100);
  const a = jaroWinklerSimilarity('LangChain', 'Langchain');
  const b = jaroWinklerSimilarity('LangChain', 'Langchain');
  assert.equal(a, b);
  assert.ok(a >= 90);
});

test('match levels and shortlist recommendations follow the published bands', () => {
  assert.equal(matchLevelFromScore(90), MATCH_LEVELS.EXCEPTIONAL);
  assert.equal(matchLevelFromScore(86), MATCH_LEVELS.STRONG);
  assert.equal(matchLevelFromScore(70), MATCH_LEVELS.GOOD);
  assert.equal(recommendationFromScore(88), 'SHORTLIST');
  assert.equal(recommendationFromScore(50), 'LOW_PRIORITY');
});

test('mandatory certification failure does not zero the match score', () => {
  const result = calculateApplicationMatch({
    requisition: GEN_AI_REQ,
    candidate: candidateWithSkills(['Python', 'LangChain', 'RAG', 'FastAPI', 'AWS']),
    now: new Date('2026-08-23T00:00:00Z')
  });
  assert.ok(result.match_score > 0);
  assert.equal(result.eligibility_status, ELIGIBILITY_STATUS.MANDATORY_REQUIREMENT_FAILED);
  assert.equal(result.mandatory_failures[0].type, 'CERTIFICATION');
  assert.ok(result.match_score >= 70, `expected a strong-ish score, got ${result.match_score}`);
  assert.ok(result.concerns.some((c) => /LangGraph/i.test(c)));
});

test('missing education is INSUFFICIENT_DATA, not a confirmed education failure', () => {
  const result = calculateApplicationMatch({
    requisition: {
      ...GEN_AI_REQ,
      required_certifications: null,
      skills: [{ skill_name: 'Python', required_flag: 'Y' }]
    },
    candidate: candidateWithSkills(['Python'], { education: [] })
  });
  assert.equal(result.eligibility_status, ELIGIBILITY_STATUS.INSUFFICIENT_DATA);
  assert.ok(result.missing_data.includes('Candidate education'));
  assert.equal(result.qualification.education_requirement_met, null);
});

test('overall score uses the 100-point weighted model', () => {
  const result = calculateApplicationMatch({
    requisition: {
      requisition_title: 'Gen-AI Engineer',
      experience_required_code: 'MID_3_5',
      min_education_level_code: 'BACHELOR',
      preferred_field_of_study: 'Computer Science',
      work_mode_code: 'HYBRID',
      location_name: 'Lahore',
      currency_code: 'PKR',
      minimum_salary: 200000,
      maximum_salary: 350000,
      skills: [
        { skill_name: 'Python', required_flag: 'Y' },
        { skill_name: 'LangChain', required_flag: 'Y' }
      ]
    },
    candidate: candidateWithSkills(['Python', 'LangChain']),
    now: new Date('2026-08-23T00:00:00Z')
  });
  const fromBreakdown = result.score_breakdown.reduce((s, b) => s + b.weighted_score, 0);
  assert.equal(result.match_score, Math.round(fromBreakdown));
  assert.equal(result.score_breakdown.find((b) => b.criterion === 'SKILLS').weight, 30);
  assert.ok(!result.score_breakdown.some((b) => b.criterion === 'PROFILE_COMPLETENESS'));
  assert.ok(result.profile_completeness > 0);
});

test('title scorer returns unknown when candidate title is missing', () => {
  const scored = scoreTitle([], 'Gen-AI Engineer', null);
  assert.equal(scored.unknown, true);
  assert.equal(scored.raw_score, 50);
});
