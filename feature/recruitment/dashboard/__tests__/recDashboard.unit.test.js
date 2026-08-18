/**
 * Unit tests for recruitment dashboard mappers and column contracts.
 * No live Oracle required.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APPLICATION_STATS_COLUMNS,
  CANDIDATE_STATS_COLUMNS,
  DASHBOARD_SECTIONS,
  INTERVIEW_STATS_COLUMNS,
  COMBINED_DASHBOARD_SECTIONS,
  OFFER_STATS_COLUMNS,
  REC_REQUISITION_STATS_VIEW,
  REQUISITION_STATS_COLUMNS,
  selectSqlFromColumns
} from '../utils/recDashboardConstants.js';
import { emptyStatsRow, mapStatsViewRow } from '../utils/recDashboardMapper.js';

const CANDIDATE_ROW = {
  ENTERPRISE_ID: 1,
  TOTAL_CANDIDATES: 120,
  SHORTLISTED: 40,
  INTERVIEWED: 25,
  HIRED: 8,
  MONTH_0_CANDIDATES: 15,
  MONTH_1_CANDIDATES: 18,
  MONTH_2_CANDIDATES: 12,
  MONTH_0_LABEL: 'Jun 2026',
  MONTH_1_LABEL: 'Jul 2026',
  MONTH_2_LABEL: 'Aug 2026',
  LAST_3_MONTHS_CANDIDATES: 45,
  CANDIDATE_CHANGE_PCT: 12.5,
  CANDIDATE_TREND: 'UP',
  CANDIDATE_CHANGE_LABEL: '+12.5% vs prior 3 months'
};

test('candidate stats mapper returns view values without recalculating trend or pct', () => {
  const mapped = mapStatsViewRow(CANDIDATE_ROW, CANDIDATE_STATS_COLUMNS, 1);

  assert.equal(mapped.enterprise_id, 1);
  assert.equal(mapped.total_candidates, 120);
  assert.equal(mapped.shortlisted, 40);
  assert.equal(mapped.interviewed, 25);
  assert.equal(mapped.hired, 8);
  assert.equal(mapped.month_0_candidates, 15);
  assert.equal(mapped.last_3_months_candidates, 45);
  assert.equal(mapped.candidate_change_pct, 12.5);
  assert.equal(mapped.candidate_trend, 'UP');
  assert.equal(mapped.candidate_change_label, '+12.5% vs prior 3 months');
  assert.equal(mapped.month_2_label, 'Aug 2026');
  assert.equal(Object.keys(mapped).length, CANDIDATE_STATS_COLUMNS.length);
});

test('mapper accepts lowercase Oracle keys', () => {
  const mapped = mapStatsViewRow(
    { enterprise_id: 9, total_candidates: 3, candidate_trend: 'FLAT' },
    CANDIDATE_STATS_COLUMNS,
    9
  );
  assert.equal(mapped.enterprise_id, 9);
  assert.equal(mapped.total_candidates, 3);
  assert.equal(mapped.candidate_trend, 'FLAT');
});

test('offer stats mapper passes avg_offer_value through from the view', () => {
  const mapped = mapStatsViewRow(
    {
      ENTERPRISE_ID: 1,
      TOTAL_OFFERS: 10,
      PENDING_APPROVAL: 2,
      SENT_TO_CANDIDATES: 5,
      ACCEPTED: 3,
      AVG_OFFER_VALUE: 18500.75,
      DRAFT_OFFERS: 1,
      EXPIRED_OFFERS: 0,
      WITHDRAWN_OFFERS: 0,
      MONTH_0_OFFERS: 4,
      MONTH_1_OFFERS: 3,
      MONTH_2_OFFERS: 3,
      MONTH_0_LABEL: 'Jun',
      MONTH_1_LABEL: 'Jul',
      MONTH_2_LABEL: 'Aug',
      LAST_3_MONTHS_OFFERS: 10,
      OFFER_CHANGE_PCT: -4,
      OFFER_TREND: 'DOWN',
      OFFER_CHANGE_LABEL: '-4% vs prior 3 months'
    },
    OFFER_STATS_COLUMNS,
    1
  );

  assert.equal(mapped.avg_offer_value, 18500.75);
  assert.equal(mapped.offer_change_pct, -4);
  assert.equal(mapped.offer_trend, 'DOWN');
  assert.equal(mapped.pending_approval, 2);
  assert.equal(Object.keys(mapped).length, OFFER_STATS_COLUMNS.length);
});

test('empty stats row keeps enterprise_id and nulls remaining view columns', () => {
  const empty = emptyStatsRow(APPLICATION_STATS_COLUMNS, 7);
  assert.equal(empty.enterprise_id, 7);
  assert.equal(empty.total_applications, null);
  assert.equal(empty.application_change_pct, null);
  assert.equal(empty.application_trend, null);
  assert.equal(empty.month_0_label, null);
});

test('mapStatsViewRow uses request enterprise_id when the view row is missing', () => {
  const mapped = mapStatsViewRow(null, INTERVIEW_STATS_COLUMNS, 3);
  assert.equal(mapped.enterprise_id, 3);
  assert.equal(mapped.total_interviews, null);
  assert.equal(mapped.interview_change_label, null);
});

test('select SQL lists every contracted column from the view alias', () => {
  const sql = selectSqlFromColumns(CANDIDATE_STATS_COLUMNS);
  assert.match(sql, /^v\.ENTERPRISE_ID/);
  assert.match(sql, /v\.CANDIDATE_CHANGE_LABEL$/);
  assert.equal(sql.split(',').length, CANDIDATE_STATS_COLUMNS.length);
});

test('requisition stats mapper returns view values without recalculating trend or pct', () => {
  const mapped = mapStatsViewRow(
    {
      ENTERPRISE_ID: 1,
      TOTAL_REQUISITIONS: 13,
      TOTAL_OPENINGS: 19,
      PENDING_APPROVAL: 0,
      HIGH_PRIORITY: 13,
      MONTH_0_REQUISITIONS: 0,
      MONTH_1_REQUISITIONS: 4,
      MONTH_2_REQUISITIONS: 0,
      MONTH_0_LABEL: 'AUG 2026',
      MONTH_1_LABEL: 'JUL 2026',
      MONTH_2_LABEL: 'JUN 2026',
      LAST_3_MONTHS_REQUISITIONS: 4,
      REQUISITION_CHANGE_PCT: -100,
      REQUISITION_TREND: 'DOWN',
      REQUISITION_CHANGE_LABEL: '100% decrease from last month'
    },
    REQUISITION_STATS_COLUMNS,
    1
  );

  assert.equal(mapped.enterprise_id, 1);
  assert.equal(mapped.total_requisitions, 13);
  assert.equal(mapped.total_openings, 19);
  assert.equal(mapped.pending_approval, 0);
  assert.equal(mapped.high_priority, 13);
  assert.equal(mapped.month_1_requisitions, 4);
  assert.equal(mapped.last_3_months_requisitions, 4);
  assert.equal(mapped.requisition_change_pct, -100);
  assert.equal(mapped.requisition_trend, 'DOWN');
  assert.equal(mapped.requisition_change_label, '100% decrease from last month');
  assert.equal(Object.keys(mapped).length, REQUISITION_STATS_COLUMNS.length);
});

test('each stats contract has unique columns starting with ENTERPRISE_ID', () => {
  for (const columns of [
    CANDIDATE_STATS_COLUMNS,
    APPLICATION_STATS_COLUMNS,
    INTERVIEW_STATS_COLUMNS,
    OFFER_STATS_COLUMNS,
    REQUISITION_STATS_COLUMNS
  ]) {
    assert.equal(columns[0].name, 'ENTERPRISE_ID');
    const names = columns.map((c) => c.name);
    assert.equal(new Set(names).size, names.length);
  }
});

test('dashboard sections cover all views including requisition-stats route', () => {
  assert.deepEqual(
    DASHBOARD_SECTIONS.map((s) => s.key),
    ['candidates', 'applications', 'interviews', 'offers', 'requisitions']
  );
  assert.deepEqual(
    DASHBOARD_SECTIONS.map((s) => s.path),
    [
      '/candidate-stats',
      '/application-stats',
      '/interview-stats',
      '/offer-stats',
      '/requisition-stats'
    ]
  );
  assert.equal(DASHBOARD_SECTIONS.at(-1)?.view, REC_REQUISITION_STATS_VIEW);
});

test('combined dashboard stats exclude requisitions section', () => {
  assert.deepEqual(
    COMBINED_DASHBOARD_SECTIONS.map((s) => s.key),
    ['candidates', 'applications', 'interviews', 'offers']
  );
});
