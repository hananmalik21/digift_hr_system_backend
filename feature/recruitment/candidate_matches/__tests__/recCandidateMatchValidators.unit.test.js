import test from 'node:test';
import assert from 'node:assert/strict';
import { ValidationError } from '../../../../utils/errors/index.js';
import {
  parseAppliedStatusFilter,
  parseFindCandidatesPagination,
  parseFindCandidatesSortKey,
  parseFindCandidatesSortOrder,
  parseFindCandidatesSortSql,
  parseMinAvailabilityScore,
  parseMinMatchScore,
  parseWillingToRelocateFilter
} from '../utils/recCandidateMatchValidators.js';
import { buildCandidateMatchListFilters } from '../utils/recCandidateMatchFilters.js';

const REQ = '574176DB57C7EFCBE0631718000A61BB';

test('default page_size is 20 and max is 100', () => {
  const def = parseFindCandidatesPagination({});
  assert.equal(def.page, 1);
  assert.equal(def.limit, 20);

  const capped = parseFindCandidatesPagination({ page_size: '500' });
  assert.equal(capped.limit, 100);
});

test('sort_by rejects unknown keys and never interpolates raw input', () => {
  assert.equal(parseFindCandidatesSortKey({}), 'match_score');
  assert.equal(parseFindCandidatesSortKey({ sort_by: 'years_experience' }), 'years_experience');
  assert.equal(parseFindCandidatesSortKey({ sort_by: 'availability_score' }), 'availability_score');
  assert.throws(() => parseFindCandidatesSortKey({ sort_by: 'MATCH_SCORE; DROP TABLE' }), ValidationError);

  const sql = parseFindCandidatesSortSql({ sort_by: 'candidate_name', sort_order: 'asc' });
  assert.match(sql, /v\.CANDIDATE_NAME ASC/);
  assert.doesNotMatch(sql, /DROP TABLE/);
});

test('sort_order must be asc or desc', () => {
  assert.equal(parseFindCandidatesSortOrder({}), 'desc');
  assert.throws(() => parseFindCandidatesSortOrder({ sort_order: 'up' }), ValidationError);
});

test('min_match_score must be 0–100', () => {
  assert.equal(parseMinMatchScore(undefined), null);
  assert.equal(parseMinMatchScore('70'), 70);
  assert.throws(() => parseMinMatchScore('101'), ValidationError);
});

test('min_availability_score must be 0–100', () => {
  assert.equal(parseMinAvailabilityScore(undefined), null);
  assert.equal(parseMinAvailabilityScore('80'), 80);
  assert.throws(() => parseMinAvailabilityScore('-1'), ValidationError);
});

test('willing_to_relocate accepts Y/N only', () => {
  assert.equal(parseWillingToRelocateFilter('y'), 'Y');
  assert.throws(() => parseWillingToRelocateFilter('yes'), ValidationError);
});

test('applied_status maps ALL/APPLIED/NOT_APPLIED to APPLIED_FLAG binds', () => {
  assert.equal(parseAppliedStatusFilter(undefined), null);
  assert.equal(parseAppliedStatusFilter('ALL'), null);
  assert.equal(parseAppliedStatusFilter('APPLIED'), 'Y');
  assert.equal(parseAppliedStatusFilter('NOT_APPLIED'), 'N');
  assert.throws(() => parseAppliedStatusFilter('MAYBE'), ValidationError);
});

test('list filters bind GUID and enterprise instead of concatenating SQL', () => {
  const { whereSql, binds } = buildCandidateMatchListFilters(REQ, 12, {
    min_match_score: '70',
    min_availability_score: '80',
    availability_code: 'IMMEDIATE',
    applied_status: 'NOT_APPLIED',
    application_stage_code: 'SCREENING',
    search: 'Alex'
  });

  assert.match(whereSql, /v\.ENTERPRISE_ID = :p_enterprise_id/);
  assert.match(whereSql, /v\.REQUISITION_GUID = :p_requisition_guid/);
  assert.match(whereSql, /v\.AVAILABILITY_SCORE >= :p_min_availability_score/);
  assert.match(whereSql, /v\.APPLIED_FLAG = :p_applied_flag/);
  assert.match(whereSql, /v\.APPLICATION_STAGE_CODE = :p_application_stage_code/);
  assert.doesNotMatch(whereSql, /574176DB57C7EFCBE0631718000A61BB/);
  assert.equal(binds.p_enterprise_id.val, 12);
  assert.equal(binds.p_min_match_score.val, 70);
  assert.equal(binds.p_min_availability_score.val, 80);
  assert.equal(binds.p_availability_code.val, 'IMMEDIATE');
  assert.equal(binds.p_applied_flag.val, 'N');
  assert.equal(binds.p_application_stage_code.val, 'SCREENING');
  assert.ok(String(binds.p_search_pat.val).includes('Alex'));
});
