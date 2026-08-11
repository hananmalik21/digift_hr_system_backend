import test from 'node:test';
import assert from 'node:assert/strict';
import { ValidationError } from '../../../../utils/errors/index.js';
import { validateLinkElementEligProfileBody } from '../validations/payElementEligProfiles.validation.js';
import { formatOracleDateOnly, parseOracleDateOnly } from '../utils/oracleDateOnly.js';
import { toIsoDateOrNull } from '../utils/payElementEligProfilesViewUtils.js';

const ELEMENT_GUID = '58C386F0FA208C58E0631718000A977C';

test('parseOracleDateOnly preserves YYYY-MM-DD calendar day', () => {
  assert.equal(parseOracleDateOnly('2026-01-01'), '2026-01-01');
  assert.equal(parseOracleDateOnly('4712-12-31'), '4712-12-31');
  assert.equal(parseOracleDateOnly(''), null);
  assert.equal(parseOracleDateOnly('2026-13-01'), null);
  assert.equal(parseOracleDateOnly('not-a-date'), null);
});

test('G: formatOracleDateOnly / toIsoDateOrNull does not UTC-shift calendar dates', () => {
  // Local midnight for 2026-01-01 — toISOString() can become 2025-12-31 in UTC-negative zones.
  const localMidnight = new Date(2026, 0, 1, 0, 0, 0, 0);
  assert.equal(formatOracleDateOnly(localMidnight), '2026-01-01');
  assert.equal(toIsoDateOrNull(localMidnight), '2026-01-01');
  // Guard: never use toISOString for date-only eligibility fields.
  const utcShifted = localMidnight.toISOString().slice(0, 10);
  if (utcShifted !== '2026-01-01') {
    assert.equal(toIsoDateOrNull(localMidnight), '2026-01-01');
    assert.notEqual(utcShifted, '2026-01-01');
  }
});

test('A/validation: link body requires dates and passes YYYY-MM-DD through', () => {
  const out = validateLinkElementEligProfileBody({
    enterprise_id: 1,
    element_guid: ELEMENT_GUID,
    effective_start_date: '2026-01-01',
    effective_end_date: '4712-12-31',
    status: 'ACTIVE'
  });
  assert.equal(out.effective_start_date, '2026-01-01');
  assert.equal(out.effective_end_date, '4712-12-31');
  assert.equal(out.status, 'ACTIVE');
});

test('B: missing effective_start_date is rejected', () => {
  assert.throws(
    () =>
      validateLinkElementEligProfileBody({
        enterprise_id: 1,
        element_guid: ELEMENT_GUID
      }),
    (err) =>
      err instanceof ValidationError &&
      /effective_start_date is required/i.test(err.errors?.[0] || err.message)
  );
});

test('C: invalid date range is rejected', () => {
  assert.throws(
    () =>
      validateLinkElementEligProfileBody({
        enterprise_id: 1,
        element_guid: ELEMENT_GUID,
        effective_start_date: '2026-01-01',
        effective_end_date: '2025-12-31'
      }),
    (err) =>
      err instanceof ValidationError &&
      /effective_end_date must be on or after effective_start_date/i.test(
        err.errors?.[0] || err.message
      )
  );
});

test('D: invalid status is rejected', () => {
  assert.throws(
    () =>
      validateLinkElementEligProfileBody({
        enterprise_id: 1,
        element_guid: ELEMENT_GUID,
        effective_start_date: '2026-01-01',
        status: 'ABC'
      }),
    (err) =>
      err instanceof ValidationError &&
      /status must be one of/i.test(err.errors?.[0] || err.message)
  );
});
