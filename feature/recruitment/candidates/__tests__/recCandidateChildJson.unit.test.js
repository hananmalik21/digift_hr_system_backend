/**
 * Unit tests for candidate child JSON arrays (education, experience, skills).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCandidateChildJsonInBinds } from '../utils/recCandidateChildJsonBinds.js';
import {
  CANDIDATE_EDUCATION_FIELD,
  CANDIDATE_EXPERIENCE_FIELD,
  CANDIDATE_SKILLS_FIELD,
  candidateChildJsonToClobString,
  candidateSkillsToClobString,
  normalizeCandidateChildJsonRequestFields,
  normalizeSkillsFieldInBody,
  parseCandidateMultipartChildJsonFields,
  validateCandidateChildJsonArrayInErrors,
  validateCandidateChildJsonFieldsInErrors,
  validateCandidateSkillsInErrors
} from '../utils/recCandidateChildJsonUtils.js';
import { mapCandidateSkillsResponse } from '../utils/recCandidateSkillMappers.js';
import { mapCandidateViewRow } from '../utils/recCandidateViewMapper.js';

describe('candidateChildJsonToClobString', () => {
  it('returns null when field omitted', () => {
    assert.equal(candidateChildJsonToClobString({}, CANDIDATE_EDUCATION_FIELD), null);
    assert.equal(candidateChildJsonToClobString({}, CANDIDATE_EXPERIENCE_FIELD), null);
    assert.equal(candidateChildJsonToClobString({}, CANDIDATE_SKILLS_FIELD), null);
  });

  it('returns [] when empty array is explicitly supplied', () => {
    assert.equal(candidateChildJsonToClobString({ education: [] }, CANDIDATE_EDUCATION_FIELD), '[]');
    assert.equal(candidateChildJsonToClobString({ experience: [] }, CANDIDATE_EXPERIENCE_FIELD), '[]');
    assert.equal(candidateChildJsonToClobString({ skills: [] }, CANDIDATE_SKILLS_FIELD), '[]');
  });

  it('stringifies non-empty arrays', () => {
    const education = [{ degree_name: 'MBA', institution_name: 'Example University' }];
    assert.equal(
      candidateChildJsonToClobString({ education }, CANDIDATE_EDUCATION_FIELD),
      JSON.stringify(education)
    );
  });
});

describe('candidateSkillsToClobString', () => {
  it('returns null when skills omitted', () => {
    assert.equal(candidateSkillsToClobString({}), null);
  });

  it('stringifies a JS array once', () => {
    assert.equal(
      candidateSkillsToClobString({ skills: [{ skill_name: 'Oracle PL/SQL' }] }),
      '[{"skill_name":"Oracle PL/SQL"}]'
    );
  });

  it('parses a JSON string and stringifies once (no double encoding)', () => {
    const jsonString = '[{"skill_name":"Oracle PL/SQL"},{"skill_name":"Flutter"}]';
    const bind = candidateSkillsToClobString({ skills: jsonString });
    assert.equal(bind, jsonString);
    assert.notEqual(bind, JSON.stringify(jsonString));
  });

  it('returns [] when empty array is explicitly supplied', () => {
    assert.equal(candidateSkillsToClobString({ skills: [] }), '[]');
  });

  it('returns null for empty skills string', () => {
    assert.equal(candidateSkillsToClobString({ skills: '' }), null);
    assert.equal(candidateSkillsToClobString({ skills: '   ' }), null);
  });
});

describe('parseCandidateMultipartChildJsonFields / normalizeSkillsFieldInBody', () => {
  it('parses multipart skills JSON string into an array', () => {
    const body = {
      skills: '[{"skill_name":"Oracle PL/SQL"},{"skill_name":"Flutter"}]'
    };
    parseCandidateMultipartChildJsonFields(body);
    assert.deepEqual(body.skills, [{ skill_name: 'Oracle PL/SQL' }, { skill_name: 'Flutter' }]);
  });

  it('maps legacy skills_json alias', () => {
    const body = {
      skills_json: '[{"skill_name":"Python"}]'
    };
    normalizeSkillsFieldInBody(body);
    assert.deepEqual(body.skills, [{ skill_name: 'Python' }]);
  });
});

describe('buildCandidateChildJsonInBinds', () => {
  it('binds all child JSON fields from canonical body keys', () => {
    const binds = buildCandidateChildJsonInBinds({
      education: [{ degree_name: 'MBA', institution_name: 'Example University' }],
      experience: [{ company_name: 'ABC', job_title: 'Architect' }],
      skills: [{ skill_name: 'Oracle PL/SQL' }]
    });

    assert.equal(binds.p_education_json.val, JSON.stringify([{ degree_name: 'MBA', institution_name: 'Example University' }]));
    assert.equal(binds.p_experience_json.val, JSON.stringify([{ company_name: 'ABC', job_title: 'Architect' }]));
    assert.equal(binds.p_skills_json.val, JSON.stringify([{ skill_name: 'Oracle PL/SQL' }]));
  });

  it('binds skills from multipart JSON string without double encoding', () => {
    const binds = buildCandidateChildJsonInBinds({
      skills: '[{"skill_name":"Oracle PL/SQL"},{"skill_name":"Flutter"}]'
    });
    assert.equal(
      binds.p_skills_json.val,
      '[{"skill_name":"Oracle PL/SQL"},{"skill_name":"Flutter"}]'
    );
  });
});

describe('normalizeCandidateChildJsonRequestFields', () => {
  it('maps legacy education_json and experience_json to canonical keys', () => {
    const body = {
      education_json: [{ degree_name: 'BSc', institution_name: 'State U' }],
      experience_json: [{ company_name: 'Acme', job_title: 'Dev' }]
    };
    normalizeCandidateChildJsonRequestFields(body);
    assert.deepEqual(body.education, body.education_json);
    assert.deepEqual(body.experience, body.experience_json);
  });

  it('prefers canonical education over legacy alias', () => {
    const body = {
      education: [{ degree_name: 'MBA', institution_name: 'New U' }],
      education_json: [{ degree_name: 'BSc', institution_name: 'Old U' }]
    };
    normalizeCandidateChildJsonRequestFields(body);
    assert.equal(body.education[0].degree_name, 'MBA');
  });
});

describe('validateCandidateSkillsInErrors', () => {
  it('requires skill_name and strips removed fields', () => {
    const errors = [];
    const body = {
      skills: [
        {
          skill_name: ' Oracle PL/SQL ',
          skill_type_code: 'TECHNICAL',
          verified_flag: 'N'
        }
      ]
    };
    validateCandidateSkillsInErrors(errors, body);
    assert.deepEqual(errors, []);
    assert.deepEqual(body.skills, [{ skill_name: 'Oracle PL/SQL' }]);
  });

  it('parses JSON string skills and validates items', () => {
    const errors = [];
    const body = {
      skills: '[{"skill_name":" Oracle PL/SQL "}]'
    };
    validateCandidateSkillsInErrors(errors, body);
    assert.deepEqual(errors, []);
    assert.deepEqual(body.skills, [{ skill_name: 'Oracle PL/SQL' }]);
  });

  it('rejects plain string skills (not a JSON array)', () => {
    const errors = [];
    validateCandidateSkillsInErrors(errors, { skills: 'Oracle PL/SQL' });
    assert.ok(errors.some((e) => e.includes('skills must be valid JSON')));
  });

  it('rejects string items in skills array', () => {
    const errors = [];
    validateCandidateSkillsInErrors(errors, { skills: ['Oracle PL/SQL'] });
    assert.ok(errors.some((e) => e.includes('must be an object')));
  });

  it('rejects empty skill_name', () => {
    const errors = [];
    validateCandidateSkillsInErrors(errors, { skills: [{ skill_name: '' }] });
    assert.ok(errors.some((e) => e.includes('skill_name')));
  });
});

describe('validateCandidateChildJsonFieldsInErrors', () => {
  it('rejects non-array education', () => {
    const errors = [];
    validateCandidateChildJsonFieldsInErrors(errors, { education: 'bad' });
    assert.ok(errors.some((e) => e.includes('education must be an array')));
  });
});

describe('validateCandidateChildJsonArrayInErrors', () => {
  it('rejects non-array education', () => {
    const errors = [];
    validateCandidateChildJsonArrayInErrors(errors, { education: 'bad' }, CANDIDATE_EDUCATION_FIELD);
    assert.ok(errors.some((e) => e.includes('education must be an array')));
  });
});

describe('mapCandidateViewRow child JSON fields', () => {
  it('maps education_json and experience_json view columns to education and experience', async () => {
    const mapped = await mapCandidateViewRow({
      CANDIDATE_GUID: Buffer.from('50FDBB885E1D190DE0633519000A3BAC', 'hex'),
      EDUCATION_JSON: [{ degree_name: 'MBA', institution_name: 'Example University' }],
      EXPERIENCE_JSON: [{ company_name: 'ABC', job_title: 'Architect' }],
      SKILLS_JSON: [
        {
          candidate_skill_id: 21,
          candidate_skill_guid: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          skill_name: 'Oracle PL/SQL',
          skill_type_code: 'TECHNICAL'
        }
      ]
    });

    assert.deepEqual(mapped.education, [{ degree_name: 'MBA', institution_name: 'Example University' }]);
    assert.deepEqual(mapped.experience, [{ company_name: 'ABC', job_title: 'Architect' }]);
    assert.equal(mapped.education_json, undefined);
    assert.equal(mapped.experience_json, undefined);
    assert.deepEqual(mapped.skills, [
      {
        candidate_skill_guid: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        skill_name: 'Oracle PL/SQL'
      }
    ]);
  });
});

describe('mapCandidateSkillsResponse', () => {
  it('returns candidate_skill_guid and skill_name only', () => {
    const mapped = mapCandidateSkillsResponse([
      {
        candidate_skill_guid: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        skill_name: 'Flutter',
        skill_type_code: 'TECHNICAL',
        years_experience: 5
      }
    ]);

    assert.deepEqual(mapped, [
      {
        candidate_skill_guid: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        skill_name: 'Flutter'
      }
    ]);
  });
});
