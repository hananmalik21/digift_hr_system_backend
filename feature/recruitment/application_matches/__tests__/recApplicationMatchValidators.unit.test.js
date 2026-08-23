import test from 'node:test';
import assert from 'node:assert/strict';
import { ValidationError } from '../../../../utils/errors/index.js';
import {
  parseApplicationStageFilter,
  parseEligibilityStatusFilter,
  parseMatchLevelFilter,
  parseMatchListPagination,
  parseMatchSortKey,
  parseMinMatchScore
} from '../utils/recApplicationMatchValidators.js';

test('min_match_score must be 0–100', () => {
  assert.equal(parseMinMatchScore(undefined), null);
  assert.equal(parseMinMatchScore('70'), 70);
  assert.throws(() => parseMinMatchScore('101'), ValidationError);
});

test('match_level and eligibility_status reject unknown codes', () => {
  assert.equal(parseMatchLevelFilter('strong'), 'STRONG');
  assert.throws(() => parseMatchLevelFilter('GREAT'), ValidationError);
  assert.equal(parseEligibilityStatusFilter('ELIGIBLE'), 'ELIGIBLE');
  assert.throws(() => parseEligibilityStatusFilter('OK'), ValidationError);
});

test('application_stage uses existing pipeline codes', () => {
  assert.equal(parseApplicationStageFilter('applied'), 'APPLIED');
  assert.throws(() => parseApplicationStageFilter('NEW'), ValidationError);
});

test('default page_size is 20', () => {
  const { page, limit } = parseMatchListPagination({});
  assert.equal(page, 1);
  assert.equal(limit, 20);
});

test('sort_by rejects unknown keys', () => {
  assert.equal(parseMatchSortKey({}), 'match_score');
  assert.equal(parseMatchSortKey({ sort_by: 'candidate_name' }), 'candidate_name');
  assert.throws(() => parseMatchSortKey({ sort_by: 'salary' }), ValidationError);
});
