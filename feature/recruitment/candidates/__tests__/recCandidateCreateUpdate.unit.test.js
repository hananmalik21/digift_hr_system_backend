/**
 * Create/update bind and validation tests for REC.CANDIDATE_PKG alignment.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ValidationError } from '../../../../utils/errors/index.js';
import { buildCandidateChildJsonInBinds } from '../utils/recCandidateChildJsonBinds.js';
import { buildCandidateDemographicInBinds } from '../utils/recCandidateDemographicBinds.js';
import {
  candidateChildJsonToClobString,
  candidateSkillsToClobString,
  validateCandidateChildJsonFieldsInErrors
} from '../utils/recCandidateChildJsonUtils.js';
import { mapCandidateSkillsResponse } from '../utils/recCandidateSkillMappers.js';
import { validateCandidateBody } from '../utils/recCandidateValidators.js';
import { mapCandidateViewRow } from '../utils/recCandidateViewMapper.js';

const FULL_CREATE_BODY = {
  enterprise_id: 1,
  alternate_phone: '+96551111111',
  alternate_email: 'Candidate.Alt@Example.com',
  dob: '1990-05-15',
  gender: 'MALE',
  nationality: 'Pakistani',
  visa_status: 'TRANSFERABLE',
  preferred_location: 'Kuwait City',
  source: 'CAREER_PORTAL',
  source_from: 'LinkedIn Campaign',
  education: [
    {
      degree_name: 'MBA',
      institution_name: 'Example University',
      field_of_study: 'Business Administration',
      start_date: '2020-09-01',
      end_date: '2021-08-31',
      grade: null,
      description: null
    }
  ],
  experience: [
    {
      company_name: 'ABC Company',
      job_title: 'Enterprise Architect',
      location: 'Kuwait',
      start_date: '2021-01-01',
      end_date: null,
      current_job_flag: 'Y',
      description: 'Enterprise architecture'
    }
  ],
  skills: [{ skill_name: 'Oracle PL/SQL' }, { skill_name: 'Flutter' }, { skill_name: 'Python' }]
};

function childBinds(body) {
  return buildCandidateChildJsonInBinds({ ...body });
}

describe('create candidate — demographic + child JSON binds', () => {
  it('binds all new master fields on create', () => {
    const demo = buildCandidateDemographicInBinds(FULL_CREATE_BODY);
    assert.equal(demo.p_nationality.val, 'Pakistani');
    assert.equal(demo.p_visa_status.val, 'TRANSFERABLE');
    assert.equal(demo.p_preferred_location.val, 'Kuwait City');
    assert.equal(demo.p_source_from.val, 'LinkedIn Campaign');
    assert.equal(demo.p_alternate_phone.val, '+96551111111');
    assert.equal(demo.p_alternate_email.val, 'candidate.alt@example.com');
    assert.ok(demo.p_date_of_birth.val instanceof Date);
    assert.equal(demo.p_gender.val, 'MALE');
  });

  it('binds education, experience, and simplified skills on create', () => {
    const binds = childBinds(FULL_CREATE_BODY);
    assert.equal(binds.p_education_json.val, JSON.stringify(FULL_CREATE_BODY.education));
    assert.equal(binds.p_experience_json.val, JSON.stringify(FULL_CREATE_BODY.experience));
    assert.equal(
      binds.p_skills_json.val,
      JSON.stringify([{ skill_name: 'Oracle PL/SQL' }, { skill_name: 'Flutter' }, { skill_name: 'Python' }])
    );
  });

  it('binds NULL child JSON when skills omitted on create', () => {
    const { skills: _s, ...body } = FULL_CREATE_BODY;
    const binds = childBinds(body);
    assert.equal(binds.p_skills_json.val, null);
    assert.equal(binds.p_education_json.val, JSON.stringify(body.education));
  });

  it('binds [] when skills is an empty array on create', () => {
    const binds = childBinds({ ...FULL_CREATE_BODY, skills: [] });
    assert.equal(binds.p_skills_json.val, '[]');
  });

  it('accepts create without new optional fields (backward compatible)', () => {
    assert.doesNotThrow(() => validateCandidateBody({ enterprise_id: 1, source: 'CAREER_PORTAL' }));
    const demo = buildCandidateDemographicInBinds({});
    const json = childBinds({});
    assert.equal(demo.p_nationality.val, null);
    assert.equal(json.p_skills_json.val, null);
  });
});

describe('update candidate — omit vs [] JSON semantics', () => {
  it('binds NULL for omitted skills on update (keep existing)', () => {
    const binds = childBinds({ enterprise_id: 1, first_name: 'John' });
    assert.equal(binds.p_skills_json.val, null);
    assert.equal(binds.p_education_json.val, null);
    assert.equal(binds.p_experience_json.val, null);
  });

  it('binds [] for skills on update (delete all)', () => {
    const binds = childBinds({ enterprise_id: 1, skills: [] });
    assert.equal(binds.p_skills_json.val, '[]');
  });

  it('binds replacement skills on update', () => {
    const binds = childBinds({ enterprise_id: 1, skills: [{ skill_name: 'Oracle' }] });
    assert.equal(binds.p_skills_json.val, JSON.stringify([{ skill_name: 'Oracle' }]));
  });

  it('keeps education/experience NULL when only skills updated', () => {
    const binds = childBinds({ enterprise_id: 1, skills: [{ skill_name: 'Python' }] });
    assert.equal(binds.p_education_json.val, null);
    assert.equal(binds.p_experience_json.val, null);
    assert.equal(binds.p_skills_json.val, JSON.stringify([{ skill_name: 'Python' }]));
  });

  it('keeps skills NULL when only education updated', () => {
    const binds = childBinds({
      enterprise_id: 1,
      education: [{ degree_name: 'BSc', institution_name: 'State U' }]
    });
    assert.equal(binds.p_skills_json.val, null);
    assert.equal(
      binds.p_education_json.val,
      JSON.stringify([{ degree_name: 'BSc', institution_name: 'State U' }])
    );
    assert.equal(binds.p_experience_json.val, null);
  });
});

describe('skills validation', () => {
  it('rejects future dob and invalid alternate_email', () => {
    assert.throws(
      () => validateCandidateBody({ enterprise_id: 1, dob: '2099-01-01' }),
      (e) => e instanceof ValidationError
    );
    assert.throws(
      () => validateCandidateBody({ enterprise_id: 1, alternate_email: 'bad' }),
      (e) => e instanceof ValidationError
    );
  });

  it('binds skills from multipart JSON string on create', () => {
    const binds = childBinds({
      enterprise_id: 1,
      skills: '[{"skill_name":"Oracle PL/SQL"},{"skill_name":"Flutter"}]'
    });
    assert.equal(
      binds.p_skills_json.val,
      '[{"skill_name":"Oracle PL/SQL"},{"skill_name":"Flutter"}]'
    );
    assert.notEqual(binds.p_skills_json.val, JSON.stringify('[{"skill_name":"Oracle PL/SQL"}]'));
  });

  it('strips removed skill fields before bind', () => {
    const body = {
      enterprise_id: 1,
      skills: [
        {
          skill_name: ' Oracle PL/SQL ',
          skill_type_code: 'TECHNICAL',
          proficiency_level_code: 'EXPERT',
          years_experience: 5,
          verified_flag: 'Y'
        }
      ]
    };
    const errors = [];
    validateCandidateChildJsonFieldsInErrors(errors, body);
    assert.deepEqual(errors, []);
    assert.deepEqual(body.skills, [{ skill_name: 'Oracle PL/SQL' }]);
    assert.equal(
      candidateSkillsToClobString(body),
      JSON.stringify([{ skill_name: 'Oracle PL/SQL' }])
    );
  });
});

describe('GET skill response shape', () => {
  it('returns only candidate_skill_guid and skill_name', async () => {
    const mapped = await mapCandidateViewRow({
      CANDIDATE_GUID: '50FDBB885E1D190DE0633519000A3BAC',
      SKILLS_JSON: [
        {
          candidate_skill_id: 21,
          candidate_skill_guid: '72E8B30EA00E4F26A78FA4D22A3E35C7',
          skill_name: 'Oracle PL/SQL',
          skill_type_code: 'TECHNICAL'
        }
      ],
      NATIONALITY: 'Pakistani',
      VISA_STATUS: 'TRANSFERABLE',
      PREFERRED_LOCATION: 'Kuwait City',
      SOURCE_FROM: 'LinkedIn Campaign',
      GENDER: 'MALE',
      DATE_OF_BIRTH: new Date(1990, 4, 15)
    });

    assert.deepEqual(mapped.skills, [
      {
        candidate_skill_guid: '72E8B30EA00E4F26A78FA4D22A3E35C7',
        skill_name: 'Oracle PL/SQL'
      }
    ]);
    assert.equal(mapped.nationality, 'Pakistani');
    assert.equal(mapped.dob, '1990-05-15');
    assert.equal(mapped.skills[0].candidate_skill_id, undefined);
    assert.equal(mapped.skills[0].skill_type_code, undefined);
  });

  it('mapCandidateSkillsResponse strips removed fields', () => {
    assert.deepEqual(
      mapCandidateSkillsResponse([
        {
          candidate_skill_guid: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          skill_name: 'Flutter',
          display_sequence: 1
        }
      ]),
      [{ candidate_skill_guid: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', skill_name: 'Flutter' }]
    );
  });
});
