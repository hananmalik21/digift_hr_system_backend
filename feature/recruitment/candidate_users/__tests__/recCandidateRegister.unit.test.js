/**
 * Unit tests for Career Portal REGISTER_CANDIDATE_USER demographic + skills alignment.
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

describe('register binds — new demographic + skills fields', () => {
  it('binds NULL for omitted optional new fields (backward compatible)', () => {
    const binds = buildRegisterProfileInBinds({
      ...BASE_BODY,
      password_hash: 'hash',
      source: 'CAREER_PORTAL',
      salary_currency: 'USD'
    });
    assert.equal(binds.p_alternate_phone.val, null);
    assert.equal(binds.p_alternate_email.val, null);
    assert.equal(binds.p_date_of_birth.val, null);
    assert.equal(binds.p_gender.val, null);
    assert.equal(binds.p_nationality.val, null);
    assert.equal(binds.p_visa_status.val, null);
    assert.equal(binds.p_preferred_location.val, null);
    assert.equal(binds.p_source_from.val, null);
    assert.equal(binds.p_skills_json.val, null);
  });

  it('binds all new master fields and skills', () => {
    const body = {
      ...BASE_BODY,
      password_hash: 'hash',
      alternate_phone: '+96551111111',
      alternate_email: 'John.Alt@Example.com',
      dob: '1990-05-15',
      gender: 'male',
      nationality: 'Pakistani',
      visa_status: 'TRANSFERABLE_RESIDENCY',
      preferred_location: 'Dubai',
      source: 'CAREER_PORTAL',
      source_from: 'LinkedIn Campaign',
      skills: [{ skill_name: 'Oracle PL/SQL' }, { skill_name: 'Flutter' }, { skill_name: 'Python' }]
    };
    validateRegisterCandidateUserBody(body);
    const binds = buildRegisterProfileInBinds(body);
    assert.equal(binds.p_alternate_phone.val, '+96551111111');
    assert.equal(binds.p_alternate_email.val, 'john.alt@example.com');
    assert.ok(binds.p_date_of_birth.val instanceof Date);
    assert.equal(binds.p_gender.val, 'MALE');
    assert.equal(binds.p_nationality.val, 'Pakistani');
    assert.equal(binds.p_visa_status.val, 'TRANSFERABLE_RESIDENCY');
    assert.equal(binds.p_preferred_location.val, 'Dubai');
    assert.equal(binds.p_source_from.val, 'LinkedIn Campaign');
    assert.equal(
      binds.p_skills_json.val,
      JSON.stringify([
        { skill_name: 'Oracle PL/SQL' },
        { skill_name: 'Flutter' },
        { skill_name: 'Python' }
      ])
    );
  });

  it('binds [] when skills is an empty array', () => {
    const binds = buildRegisterProfileInBinds({
      ...BASE_BODY,
      password_hash: 'hash',
      skills: []
    });
    assert.equal(binds.p_skills_json.val, '[]');
  });

  it('binds skills from multipart JSON string without double encoding', () => {
    const binds = buildRegisterProfileInBinds({
      ...BASE_BODY,
      password_hash: 'hash',
      skills: '[{"skill_name":"Oracle PL/SQL"},{"skill_name":"Flutter"}]'
    });
    assert.equal(
      binds.p_skills_json.val,
      '[{"skill_name":"Oracle PL/SQL"},{"skill_name":"Flutter"}]'
    );
    assert.notEqual(binds.p_skills_json.val, JSON.stringify('[{"skill_name":"Oracle PL/SQL"}]'));
  });

  it('keeps source and source_from separate', () => {
    const binds = buildRegisterProfileInBinds({
      ...BASE_BODY,
      password_hash: 'hash',
      source: 'CAREER_PORTAL',
      source_from: 'LinkedIn Campaign'
    });
    assert.equal(binds.p_source.val, 'CAREER_PORTAL');
    assert.equal(binds.p_source_from.val, 'LinkedIn Campaign');
  });

  it('defaults willing_to_relocate to N when omitted', () => {
    const binds = buildRegisterProfileInBinds({ ...BASE_BODY, password_hash: 'hash' });
    assert.equal(binds.p_willing_to_relocate.val, 'N');
  });
});

describe('register validation', () => {
  it('accepts existing request without new fields', () => {
    assert.doesNotThrow(() => validateRegisterCandidateUserBody({ ...BASE_BODY }));
  });

  it('rejects future dob', () => {
    assert.throws(
      () => validateRegisterCandidateUserBody({ ...BASE_BODY, dob: '2099-01-01' }),
      (e) => e instanceof ValidationError
    );
  });

  it('rejects invalid alternate_email', () => {
    assert.throws(
      () => validateRegisterCandidateUserBody({ ...BASE_BODY, alternate_email: 'bad' }),
      (e) => e instanceof ValidationError
    );
  });

  it('rejects empty skill_name and strips removed skill fields', () => {
    assert.throws(
      () => validateRegisterCandidateUserBody({ ...BASE_BODY, skills: [{ skill_name: '' }] }),
      (e) => e instanceof ValidationError
    );

    const body = {
      ...BASE_BODY,
      years_experience: 8,
      skills: [
        {
          skill_name: ' Oracle PL/SQL ',
          skill_type_code: 'TECHNICAL',
          years_experience: 5
        }
      ]
    };
    validateRegisterCandidateUserBody(body);
    assert.deepEqual(body.skills, [{ skill_name: 'Oracle PL/SQL' }]);
    assert.equal(body.years_experience, 8);
  });

  it('parses multipart skills JSON string during validation', () => {
    const body = {
      ...BASE_BODY,
      skills: '[{"skill_name":"Flutter"}]'
    };
    validateRegisterCandidateUserBody(body);
    assert.deepEqual(body.skills, [{ skill_name: 'Flutter' }]);
  });
});

describe('register portal defaults + multipart body', () => {
  it('applies source, salary_currency, created_by defaults when omitted', () => {
    const body = { enterprise_id: 1 };
    applyRegisterPortalDefaults(body);
    assert.equal(body.source, 'CAREER_PORTAL');
    assert.equal(body.salary_currency, 'USD');
    assert.equal(body.created_by, 'CAREER_PORTAL');
  });

  it('does not override client-supplied defaults', () => {
    const body = {
      source: 'REFERRAL',
      salary_currency: 'KWD',
      created_by: 'ADMIN'
    };
    applyRegisterPortalDefaults(body);
    assert.equal(body.source, 'REFERRAL');
    assert.equal(body.salary_currency, 'KWD');
    assert.equal(body.created_by, 'ADMIN');
  });

  it('parses skills JSON string from multipart request body', () => {
    const body = buildRegisterBodyFromRequest({
      body: {
        ...BASE_BODY,
        skills: '[{"skill_name":"Python"}]'
      }
    });
    assert.deepEqual(body.skills, [{ skill_name: 'Python' }]);
    assert.equal(body.source, 'CAREER_PORTAL');
  });
});
