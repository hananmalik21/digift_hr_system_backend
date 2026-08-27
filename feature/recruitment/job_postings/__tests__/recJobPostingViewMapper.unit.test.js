/**
 * Unit tests for REC.V_JOB_POSTINGS row → API mapping.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mapJobPostingViewRow } from '../utils/recJobPostingViewMapper.js';
import { JOB_POSTING_VIEW_COLUMNS } from '../utils/recJobPostingConstants.js';
import { buildPortalListSelectSql } from '../utils/recJobPostingPortalSql.js';

test('JOB_POSTING_VIEW_COLUMNS includes APPLICATION_COUNT', () => {
  assert.ok(JOB_POSTING_VIEW_COLUMNS.includes('APPLICATION_COUNT'));
});

test('portal select SQL includes APPLICATION_COUNT from the view column list', () => {
  const sql = buildPortalListSelectSql('WHERE v.ENTERPRISE_ID = :p_enterprise_id');
  assert.match(sql, /v\.APPLICATION_COUNT/);
  assert.doesNotMatch(sql, /\bv\.\*/);
});

test('mapJobPostingViewRow maps APPLICATION_COUNT to application_count', async () => {
  const mapped = await mapJobPostingViewRow({ APPLICATION_COUNT: 12 });
  assert.equal(mapped.application_count, 12);
});

test('mapJobPostingViewRow defaults missing APPLICATION_COUNT to 0', async () => {
  const mapped = await mapJobPostingViewRow({});
  assert.equal(mapped.application_count, 0);
});

test('mapJobPostingViewRow defaults null APPLICATION_COUNT to 0', async () => {
  const mapped = await mapJobPostingViewRow({ APPLICATION_COUNT: null });
  assert.equal(mapped.application_count, 0);
});

test('mapJobPostingViewRow truncates non-integer APPLICATION_COUNT', async () => {
  const mapped = await mapJobPostingViewRow({ APPLICATION_COUNT: 3.9 });
  assert.equal(mapped.application_count, 3);
});
