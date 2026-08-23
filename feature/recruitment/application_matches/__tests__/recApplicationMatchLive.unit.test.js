/**
 * Live match aggregation used when REC.REC_APPLICATION_MATCHES is not deployed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ELIGIBILITY_STATUS, MATCH_LEVELS, RECOMMENDATIONS } from '../utils/recApplicationMatchConstants.js';
import {
  filterSortPageLiveItems,
  summarizeLiveResults,
  toListItemFromLive,
  toListSummary
} from '../utils/recApplicationMatchLive.js';
import { isMatchStoreUnavailableError } from '../utils/recApplicationMatchErrors.js';

function scored(overrides = {}) {
  return {
    result: {
      match_score: 82,
      match_level: MATCH_LEVELS.STRONG,
      eligibility_status: ELIGIBILITY_STATUS.ELIGIBLE,
      recommendation: RECOMMENDATIONS.SHORTLIST,
      ...overrides
    }
  };
}

test('summarizeLiveResults keeps eligibility independent of match level', () => {
  const summary = summarizeLiveResults([
    scored(),
    scored({
      match_score: 82,
      match_level: MATCH_LEVELS.STRONG,
      eligibility_status: ELIGIBILITY_STATUS.MANDATORY_REQUIREMENT_FAILED,
      recommendation: RECOMMENDATIONS.SHORTLIST
    }),
    scored({
      match_score: 41,
      match_level: MATCH_LEVELS.WEAK,
      eligibility_status: ELIGIBILITY_STATUS.ELIGIBLE,
      recommendation: RECOMMENDATIONS.LOW_PRIORITY
    })
  ]);

  assert.equal(summary.total_applications, 3);
  assert.equal(summary.match_distribution.strong, 2);
  assert.equal(summary.match_distribution.weak, 1);
  assert.equal(summary.eligibility.eligible, 2);
  assert.equal(summary.eligibility.mandatory_requirement_failed, 1);
  assert.equal(summary.shortlist_recommended, 2);
  assert.equal(summary.top_match_score, 82);
  assert.equal(summary.average_match_score, 68.3);

  const compact = toListSummary(summary);
  assert.equal(compact.mandatory_failed, 1);
  assert.equal(compact.strong, 2);
});

test('filterSortPageLiveItems filters score and sorts descending by default', () => {
  const rows = [
    {
      item: toListItemFromLive(
        {
          application: { application_id: 1, application_guid: 'A', applied_date: '2026-01-02' },
          candidate: { full_name: 'Ada' }
        },
        { match_score: 70, match_level: 'GOOD', eligibility_status: 'ELIGIBLE', recommendation: 'RECRUITER_REVIEW', scores: {} }
      )
    },
    {
      item: toListItemFromLive(
        {
          application: { application_id: 2, application_guid: 'B', applied_date: '2026-01-01' },
          candidate: { full_name: 'Bob' }
        },
        { match_score: 90, match_level: 'EXCEPTIONAL', eligibility_status: 'ELIGIBLE', recommendation: 'PRIORITY_SHORTLIST', scores: {} }
      )
    }
  ];

  const { rows: paged, total } = filterSortPageLiveItems(rows, { min_match_score: 80 }, { page: 1, limit: 20 });
  assert.equal(total, 1);
  assert.equal(paged[0].application_guid, 'B');
  assert.equal(paged[0].match.match_score, 90);
  assert.equal(paged[0].applied_date, undefined);
});

test('isMatchStoreUnavailableError detects ORA-00942 on wrapped DatabaseError', () => {
  const err = {
    errorNum: 942,
    technicalMessage: 'ORA-00942: table or view does not exist',
    oracleError: { errorNum: 942, message: 'ORA-00942: table or view does not exist' },
    message: 'Unable to recalculate application match. Please try again.'
  };
  assert.equal(isMatchStoreUnavailableError(err), true);
  assert.equal(isMatchStoreUnavailableError(new Error('connection reset')), false);
});
