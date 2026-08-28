/**
 * Unit tests for Career Portal REGISTER_CANDIDATE_USER demographics +
 * education / experience / skills alignment.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ValidationError } from '../../../../utils/errors/index.js';
import { buildRegisterProfileInBinds } from '../utils/recCandidateRegisterBinds.js';
import { applyRegisterPortalDefaults } from '../utils/recCandidateRegisterDefaults.js';
import { buildRegisterBodyFromRequest } from '../utils/recCandidateRegisterMultipart.js';
import { validateRegisterCandidateUserBody } from '../utils/recCandidateRegisterValidators.js';

const BASE_BODY = {
  enterprise_id: 1,
  first_name: 'John',
  last_name: 'Smith',
  email: 'john.smith@example.com',
  phone: '+96550000000',
  password: 'UserSuppliedPassword'
};

const SAMPLE_EDUCATION = [
  {
    degree_name: 'MBA',
    institution_name: 'Example University',
    field_of_study: 'Business Administration',
    start_date: '2020-09-01',
    end_date: '2021-08-31',
    grade: null,
    description: null
  }
];

const SAMPLE_EXPERIENCE = [
  {
    company_name: 'ABC Company',
    job_title: 'Software Engineer',
    location: 'Kuwait',
    start_date: '2021-01-01',
    end_date: null,
    current_job_flag: 'Y',
    description: 'Software engineering work'
  }
];

const SAMPLE_SKILLS = [
  { skill_name: 'Oracle PL/SQL' },
  { skill_name: 'Flutter' },
  { skill_name: 'Python' }
];

describe('register binds — demographics + child JSON', () => {
  it('binds NULL for omitted optional new fields (backward compatible)', () => {
    const binds = buildRegisterProfileInBinds({
      ...BASE_BODY,
      password_hash: 'hash',
      source: 'CAREER_PORTAL',
      salary_currency: 'USD'
    });
    assert.equal(binds.p_alternate_phone.val, null);
    assert.equal(binds.p_skills_json.val, null);
    assert.equal(binds.p_education_json.val, null);
    assert.equal(binds.p_experience_json.val, null);
  });

  it('binds education, experience, and skills together', () => {
    const body = {
      ...BASE_BODY,
      password_hash: 'hash',
      education: SAMPLE_EDUCATION,
      experience: SAMPLE_EXPERIENCE,
      skills: SAMPLE_SKILLS
    };
    validateRegisterCandidateUserBody(body);
    const binds = buildRegisterProfileInBinds(body);
    assert.equal(binds.p_education_json.val, JSON.stringify(body.education));
    assert.equal(binds.p_experience_json.val, JSON.stringify(body.experience));
    assert.equal(binds.p_skills_json.val, JSON.stringify(body.skills));
  });

  it('binds empty arrays as [] (not NULL)', () => {
    const binds = buildRegisterProfileInBinds({
      ...BASE_BODY,
      password_hash: 'hash',
      education: [],
      experience: [],
      skills: []
    });
    assert.equal(binds.p_education_json.val, '[]');
    assert.equal(binds.p_experience_json.val, '[]');
    assert.equal(binds.p_skills_json.val, '[]');
  });

  it('binds multipart JSON strings without double encoding', () => {
    const binds = buildRegisterProfileInBinds({
      ...BASE_BODY,
      password_hash: 'hash',
      education: JSON.stringify(SAMPLE_EDUCATION),
      experience: JSON.stringify(SAMPLE_EXPERIENCE),
      skills: '[{"skill_name":"Oracle PL/SQL"},{"skill_name":"Flutter"}]'
    });
    assert.equal(binds.p_education_json.val, JSON.stringify(SAMPLE_EDUCATION));
    assert.equal(binds.p_experience_json.val, JSON.stringify(SAMPLE_EXPERIENCE));
    assert.equal(
      binds.p_skills_json.val,
      '[{"skill_name":"Oracle PL/SQL"},{"skill_name":"Flutter"}]'
    );
  });

  it('binds education only / experience only / skills only', () => {
    const edu = buildRegisterProfileInBinds({
      ...BASE_BODY,
      password_hash: 'hash',
      education: SAMPLE_EDUCATION
    });
    assert.ok(edu.p_education_json.val);
    assert.equal(edu.p_experience_json.val, null);
    assert.equal(edu.p_skills_json.val, null);

    const exp = buildRegisterProfileInBinds({
      ...BASE_BODY,
      password_hash: 'hash',
      experience: SAMPLE_EXPERIENCE
    });
    assert.equal(exp.p_education_json.val, null);
    assert.ok(exp.p_experience_json.val);
    assert.equal(exp.p_skills_json.val, null);

    const sk = buildRegisterProfileInBinds({
      ...BASE_BODY,
      password_hash: 'hash',
      skills: SAMPLE_SKILLS
    });
    assert.equal(sk.p_education_json.val, null);
    assert.equal(sk.p_experience_json.val, null);
    assert.ok(sk.p_skills_json.val);
  });
});

describe('register validation', () => {
  it('accepts existing request without new fields', () => {
    assert.doesNotThrow(() => validateRegisterCandidateUserBody({ ...BASE_BODY }));
  });

  it('rejects future dob and invalid alternate_email', () => {
    assert.throws(
      () => validateRegisterCandidateUserBody({ ...BASE_BODY, dob: '2099-01-01' }),
      (e) => e instanceof ValidationError
    );
    assert.throws(
      () => validateRegisterCandidateUserBody({ ...BASE_BODY, alternate_email: 'bad' }),
      (e) => e instanceof ValidationError
    );
  });

  it('rejects invalid education / experience / skills JSON', () => {
    assert.throws(
      () => validateRegisterCandidateUserBody({ ...BASE_BODY, education: 'not-json' }),
      (e) => e instanceof ValidationError
    );
    assert.throws(
      () => validateRegisterCandidateUserBody({ ...BASE_BODY, experience: { company_name: 'x' } }),
      (e) => e instanceof ValidationError
    );
    assert.throws(
      () => validateRegisterCandidateUserBody({ ...BASE_BODY, skills: ['Oracle'] }),
      (e) => e instanceof ValidationError
    );
  });

  it('normalizes education/experience dates and current_job_flag', () => {
    const body = {
      ...BASE_BODY,
      education: SAMPLE_EDUCATION,
      experience: [{ ...SAMPLE_EXPERIENCE, end_date: '2025-01-01', current_job_flag: 'Y' }]
    };
    validateRegisterCandidateUserBody(body);
    assert.equal(body.experience[0].current_job_flag, 'Y');
    assert.equal(body.experience[0].end_date, null);
  });

  it('parses multipart child JSON strings during validation', () => {
    const body = {
      ...BASE_BODY,
      education: JSON.stringify(SAMPLE_EDUCATION),
      skills: '[{"skill_name":"Flutter"}]'
    };
    validateRegisterCandidateUserBody(body);
    assert.equal(body.education[0].degree_name, 'MBA');
    assert.deepEqual(body.skills, [{ skill_name: 'Flutter' }]);
  });
});

describe('register portal defaults + multipart body', () => {
  it('applies portal defaults when omitted', () => {
    const body = { enterprise_id: 1 };
    applyRegisterPortalDefaults(body);
    assert.equal(body.source, 'CAREER_PORTAL');
    assert.equal(body.salary_currency, 'USD');
    assert.equal(body.created_by, 'CAREER_PORTAL');
  });

  it('parses education/experience/skills JSON strings from multipart body', () => {
    const body = buildRegisterBodyFromRequest({
      body: {
        ...BASE_BODY,
        education: JSON.stringify(SAMPLE_EDUCATION),
        experience: JSON.stringify(SAMPLE_EXPERIENCE),
        skills: '[{"skill_name":"Python"}]'
      }
    });
    assert.equal(body.education[0].degree_name, 'MBA');
    assert.equal(body.experience[0].company_name, 'ABC Company');
    assert.deepEqual(body.skills, [{ skill_name: 'Python' }]);
  });
});
