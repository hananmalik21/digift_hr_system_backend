/**
 * Integration: LINK_ELEMENT effective dating + historical link preservation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import db from '../../../../config/db.js';
import {
  api,
  ensurePool,
  startPayrollTestServer,
  stopPayrollTestServer,
  TEST_ENTERPRISE_ID
} from '../../../payroll/__tests__/helpers/payrollTestHarness.js';

const PROFILE_GUID = '58C747D03DA9C743E0631718000AA1C5';
const ELEMENT_GUID = '58C386F0FA208C58E0631718000A977C';

async function listLinksForBasicSalary() {
  const result = await db.executeQuery(
    `
SELECT
    PROFILE_LINK_ID,
    ENTERPRISE_ID,
    ELEMENT_ID,
    PROFILE_ID,
    TO_CHAR(EFFECTIVE_START_DATE, 'YYYY-MM-DD') AS EFFECTIVE_START_DATE,
    TO_CHAR(EFFECTIVE_END_DATE, 'YYYY-MM-DD') AS EFFECTIVE_END_DATE,
    STATUS
  FROM PAY.PAY_ELEMENT_PROFILE_LINKS
 WHERE ENTERPRISE_ID = 1
   AND PROFILE_ID = 22
   AND ELEMENT_ID = 67
 ORDER BY EFFECTIVE_START_DATE`.trim()
  );
  return result.rows || [];
}

function rowYmd(row, key) {
  return String(row[key] ?? row[key.toLowerCase()] ?? '').slice(0, 10);
}

function rowStatus(row) {
  return String(row.STATUS ?? row.status ?? '').toUpperCase();
}

test.before(async () => {
  await ensurePool();
  await startPayrollTestServer();
});

test.after(async () => {
  await stopPayrollTestServer();
});

test('A + H: Basic Salary link with 2026-01-01; historical link 21 stays INACTIVE', async () => {
  const before = await listLinksForBasicSalary();
  const historical = before.find((r) => Number(r.PROFILE_LINK_ID ?? r.profile_link_id) === 21);
  if (historical) {
    assert.equal(rowYmd(historical, 'EFFECTIVE_START_DATE'), '2026-08-11');
    assert.equal(rowStatus(historical), 'INACTIVE');
  }

  const create = await api('POST', `/api/payroll/eligibility/profiles/${PROFILE_GUID}/elements`, {
    body: {
      enterprise_id: 1,
      element_guid: ELEMENT_GUID,
      effective_start_date: '2026-01-01',
      effective_end_date: '4712-12-31',
      status: 'ACTIVE'
    }
  });

  assert.ok(
    [200, 201].includes(create.status),
    `expected 200/201, got ${create.status}: ${create.text?.slice(0, 600)}`
  );
  assert.equal(create.json?.success, true, create.text?.slice(0, 600));
  assert.equal(Number(create.json?.data?.profile_id), 22);
  assert.equal(Number(create.json?.data?.element_id), 67);
  assert.equal(Number(create.json?.data?.enterprise_id), 1);
  assert.equal(create.json?.data?.effective_start_date, '2026-01-01');
  assert.equal(create.json?.data?.effective_end_date, '4712-12-31');
  assert.equal(create.json?.data?.status, 'ACTIVE');
  assert.ok(create.json?.data?.profile_link_id != null);
  assert.notEqual(Number(create.json?.data?.profile_link_id), 21);

  const after = await listLinksForBasicSalary();
  const active = after.find(
    (r) =>
      rowYmd(r, 'EFFECTIVE_START_DATE') === '2026-01-01' && rowStatus(r) === 'ACTIVE'
  );
  assert.ok(active, 'expected ACTIVE link starting 2026-01-01');
  assert.equal(Number(active.PROFILE_ID ?? active.profile_id), 22);
  assert.equal(Number(active.ELEMENT_ID ?? active.element_id), 67);
  assert.equal(rowYmd(active, 'EFFECTIVE_END_DATE'), '4712-12-31');

  const link21 = after.find((r) => Number(r.PROFILE_LINK_ID ?? r.profile_link_id) === 21);
  assert.ok(link21, 'historical link 21 must still exist');
  assert.equal(rowYmd(link21, 'EFFECTIVE_START_DATE'), '2026-08-11');
  assert.equal(rowStatus(link21), 'INACTIVE');
});

test('B: missing effective_start_date returns HTTP 400', async () => {
  const create = await api('POST', `/api/payroll/eligibility/profiles/${PROFILE_GUID}/elements`, {
    body: {
      enterprise_id: 1,
      element_guid: ELEMENT_GUID
    }
  });
  assert.equal(create.status, 400);
  assert.equal(create.json?.success, false);
  assert.match(String(create.json?.message || ''), /effective_start_date is required/i);
});

test('C: invalid date range returns HTTP 400', async () => {
  const create = await api('POST', `/api/payroll/eligibility/profiles/${PROFILE_GUID}/elements`, {
    body: {
      enterprise_id: 1,
      element_guid: ELEMENT_GUID,
      effective_start_date: '2026-01-01',
      effective_end_date: '2025-12-31'
    }
  });
  assert.equal(create.status, 400);
  assert.equal(create.json?.success, false);
});

test('D: invalid status returns HTTP 400', async () => {
  const create = await api('POST', `/api/payroll/eligibility/profiles/${PROFILE_GUID}/elements`, {
    body: {
      enterprise_id: 1,
      element_guid: ELEMENT_GUID,
      effective_start_date: '2026-01-01',
      status: 'ABC'
    }
  });
  assert.equal(create.status, 400);
  assert.equal(create.json?.success, false);
});

test('E: wrong enterprise/profile relationship fails', async () => {
  const create = await api('POST', `/api/payroll/eligibility/profiles/${PROFILE_GUID}/elements`, {
    body: {
      enterprise_id: 999999,
      element_guid: ELEMENT_GUID,
      effective_start_date: '2026-01-01'
    }
  });
  assert.ok([400, 403, 404].includes(create.status), `got ${create.status}`);
  assert.equal(create.json?.success, false);
});

test('F: wrong enterprise/element relationship fails', async () => {
  const create = await api('POST', `/api/payroll/eligibility/profiles/${PROFILE_GUID}/elements`, {
    body: {
      enterprise_id: 1,
      element_guid: '00000000000000000000000000000000',
      effective_start_date: '2026-01-01'
    }
  });
  assert.ok([400, 404].includes(create.status), `got ${create.status}: ${create.text?.slice(0, 300)}`);
  assert.equal(create.json?.success, false);
});

test('G: GET profile returns date-only effective dates without UTC shift', async () => {
  const get = await api('GET', `/api/payroll/eligibility/profiles/${PROFILE_GUID}`, {
    query: { enterprise_id: TEST_ENTERPRISE_ID }
  });
  assert.equal(get.status, 200);
  assert.equal(get.json?.success, true);

  const links = get.json?.data?.linked_elements || [];
  const basic = links.find((l) => Number(l.element_id) === 67 && l.status === 'ACTIVE');
  if (basic) {
    assert.equal(basic.effective_start_date, '2026-01-01');
    assert.equal(basic.effective_end_date, '4712-12-31');
  } else {
    // Profile scalar dates still must not shift.
    assert.ok(
      !get.json?.data?.effective_start_date ||
        /^\d{4}-\d{2}-\d{2}$/.test(get.json.data.effective_start_date)
    );
  }
});
