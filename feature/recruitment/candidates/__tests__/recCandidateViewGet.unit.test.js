/**
 * Unit tests for candidate GET view mapping (REC.CANDIDATES_FULL_V).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mapCandidateSkillsResponse } from '../utils/recCandidateSkillMappers.js';
import {
  mapCandidateListViewRow,
  mapCandidateViewRow,
  parseJsonColumn
} from '../utils/recCandidateViewMapper.js';

describe('parseJsonColumn', () => {
  it('returns [] for null when asArray', async () => {
    assert.deepEqual(await parseJsonColumn(null, true), []);
  });

  it('returns [] for JSON string "null" when asArray', async () => {
    assert.deepEqual(await parseJsonColumn('null', true), []);
  });

  it('parses JSON string arrays', async () => {
    assert.deepEqual(await parseJsonColumn('[{"skill_name":"Oracle"}]', true), [
      { skill_name: 'Oracle' }
    ]);
  });
});

describe('mapCandidateViewRow detail JSON collections', () => {
  it('maps all JSON view columns to canonical API names', async () => {
    const mapped = await mapCandidateViewRow({
      CANDIDATE_GUID: '50FDBB885E1D190DE0633519000A3BAC',
      EDUCATION_JSON: [{ education_id: 1, degree_name: 'MBA', institution_name: 'Example University' }],
      EXPERIENCE_JSON: [{ experience_id: 1, company_name: 'ABC', job_title: 'Architect' }],
      SKILLS_JSON: [
        {
          candidate_skill_id: 21,
          candidate_skill_guid: '72E8B30EA00E4F26A78FA4D22A3E35C7',
          skill_name: 'Oracle PL/SQL',
          skill_type_code: 'TECHNICAL'
        }
      ],
      RESUMES_JSON: [
        {
          resume_id: 1,
          resume_guid: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
          file_name: 'cv.pdf',
          file_content: Buffer.from('secret')
        }
      ],
      BACKGROUND_CHECKS_JSON: [{ background_check_id: 1, provider: 'CheckCo' }],
      ASSESSMENTS_JSON: [{ assessment_id: 1, assessment_type: 'TECH' }],
      TALENT_POOLS_JSON: [{ pool_id: 1, pool_name: 'Engineers' }]
    });

    assert.deepEqual(mapped.education, [{ education_id: 1, degree_name: 'MBA', institution_name: 'Example University' }]);
    assert.deepEqual(mapped.experience, [{ experience_id: 1, company_name: 'ABC', job_title: 'Architect' }]);
    assert.deepEqual(mapped.skills, [
      {
        candidate_skill_id: 21,
        candidate_skill_guid: '72E8B30EA00E4F26A78FA4D22A3E35C7',
        skill_name: 'Oracle PL/SQL'
      }
    ]);
    assert.deepEqual(mapped.resumes, [
      {
        resume_id: 1,
        resume_guid: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        file_name: 'cv.pdf'
      }
    ]);
    assert.deepEqual(mapped.background_checks, [{ background_check_id: 1, provider: 'CheckCo' }]);
    assert.deepEqual(mapped.assessments, [{ assessment_id: 1, assessment_type: 'TECH' }]);
    assert.deepEqual(mapped.talent_pools, [{ pool_id: 1, pool_name: 'Engineers' }]);
    assert.equal(mapped.education_json, undefined);
    assert.equal(mapped.resumes_json, undefined);
  });

  it('defaults missing JSON collections to empty arrays', async () => {
    const mapped = await mapCandidateViewRow({
      CANDIDATE_GUID: '50FDBB885E1D190DE0633519000A3BAC',
      FIRST_NAME: 'John',
      LAST_NAME: 'Smith'
    });

    assert.deepEqual(mapped.education, []);
    assert.deepEqual(mapped.experience, []);
    assert.deepEqual(mapped.skills, []);
    assert.deepEqual(mapped.resumes, []);
    assert.deepEqual(mapped.background_checks, []);
    assert.deepEqual(mapped.assessments, []);
    assert.deepEqual(mapped.talent_pools, []);
  });
});

describe('mapCandidateListViewRow', () => {
  it('returns slim list fields without JSON collections', async () => {
    const mapped = await mapCandidateListViewRow({
      CANDIDATE_ID: 101,
      CANDIDATE_GUID: '50FDBB885E1D190DE0633519000A3BAC',
      ENTERPRISE_ID: 1,
      FIRST_NAME: 'John',
      LAST_NAME: 'Smith',
      FULL_NAME: 'John Smith',
      EMAIL: 'john@example.com',
      PHONE: '+96550000000',
      CURRENT_TITLE: 'Architect',
      CURRENT_EMPLOYER: 'ABC',
      YEARS_EXPERIENCE: 10,
      CURRENT_LOCATION: 'Kuwait',
      PREFERRED_LOCATION: 'Dubai',
      NATIONALITY: 'Pakistani',
      VISA_STATUS: 'TRANSFERABLE',
      SOURCE: 'CAREER_PORTAL',
      SOURCE_FROM: 'LinkedIn',
      STATUS: 'ACTIVE',
      ACTIVE_FLAG: 'Y',
      CREATION_DATE: new Date('2026-08-28T10:00:00Z'),
      EDUCATION_JSON: [{ degree_name: 'MBA' }]
    });

    assert.equal(mapped.candidate_id, 101);
    assert.equal(mapped.full_name, 'John Smith');
    assert.equal(mapped.preferred_location, 'Dubai');
    assert.equal(mapped.education, undefined);
    assert.equal(mapped.skills, undefined);
  });
});

describe('mapCandidateSkillsResponse', () => {
  it('returns candidate_skill_id, candidate_skill_guid, and skill_name only', () => {
    const mapped = mapCandidateSkillsResponse([
      {
        candidate_skill_id: 22,
        candidate_skill_guid: '1DBDE33483A746EEB703D9FA45C5A9F6',
        skill_name: 'Flutter',
        skill_type_code: 'TECHNICAL',
        years_experience: 5
      }
    ]);

    assert.deepEqual(mapped, [
      {
        candidate_skill_id: 22,
        candidate_skill_guid: '1DBDE33483A746EEB703D9FA45C5A9F6',
        skill_name: 'Flutter'
      }
    ]);
  });
});
