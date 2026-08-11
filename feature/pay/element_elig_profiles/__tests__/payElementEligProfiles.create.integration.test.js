/**
 * Integration: profile create orchestrates UPSERT_PROFILE + LINK_RULE.
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

const PROFILE_CODE = `ALL_PAYROLL_EMPLOYEES_${Date.now()}`;

test.before(async () => {
  await ensurePool();
  await startPayrollTestServer();
});

test.after(async () => {
  await stopPayrollTestServer();
});

test('POST /api/payroll/eligibility/profiles creates profile and links rule 55', async () => {
  const create = await api('POST', '/api/payroll/eligibility/profiles', {
    body: {
      enterprise_id: TEST_ENTERPRISE_ID,
      profile_code: PROFILE_CODE,
      profile_name: 'All Payroll Employees Profile',
      description: 'Eligibility profile for controlled payroll testing',
      match_logic_code: 'ANY',
      effective_start_date: '2026-01-01',
      effective_end_date: '4712-12-31',
      status: 'ACTIVE',
      eligibility_rules_json: [
        {
          eligibility_rule_id: 55,
          rule_sequence: 1,
          active_flag: 'Y'
        }
      ]
    }
  });

  assert.ok(
    [200, 201].includes(create.status),
    `expected 200/201, got ${create.status}: ${create.text?.slice(0, 600)}`
  );
  assert.equal(create.json?.success, true, create.text?.slice(0, 600));
  assert.ok(create.json?.data?.profile_id != null);
  assert.ok(create.json?.data?.profile_guid);

  const profileId = create.json.data.profile_id;
  const result = await db.executeQuery(
    `
SELECT
    P.PROFILE_ID,
    P.PROFILE_CODE,
    P.MATCH_LOGIC_CODE,
    P.STATUS,
    PR.ELIGIBILITY_RULE_ID,
    PR.RULE_SEQUENCE,
    PR.ACTIVE_FLAG
  FROM PAY.PAY_ELEMENT_PROFILES P
  JOIN PAY.PAY_ELEMENT_PROFILE_RULES PR
    ON PR.PROFILE_ID = P.PROFILE_ID
 WHERE P.ENTERPRISE_ID = :enterprise_id
   AND P.PROFILE_CODE = :profile_code
 ORDER BY PR.RULE_SEQUENCE`.trim(),
    {
      enterprise_id: TEST_ENTERPRISE_ID,
      profile_code: PROFILE_CODE
    }
  );

  const rows = result.rows || [];
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(Number(row.PROFILE_ID ?? row.profile_id), Number(profileId));
  assert.equal(String(row.MATCH_LOGIC_CODE ?? row.match_logic_code).toUpperCase(), 'ANY');
  assert.equal(Number(row.ELIGIBILITY_RULE_ID ?? row.eligibility_rule_id), 55);
  assert.equal(Number(row.RULE_SEQUENCE ?? row.rule_sequence), 1);
  assert.equal(String(row.ACTIVE_FLAG ?? row.active_flag).toUpperCase(), 'Y');
});

test('POST /api/payroll/eligibility/profiles rejects empty eligibility_rules_json', async () => {
  const create = await api('POST', '/api/payroll/eligibility/profiles', {
    body: {
      enterprise_id: TEST_ENTERPRISE_ID,
      profile_code: `EMPTY_${Date.now()}`,
      profile_name: 'Empty Rules',
      eligibility_rules_json: []
    }
  });
  assert.equal(create.status, 400);
  assert.equal(create.json?.success, false);
  assert.match(String(create.json?.message || ''), /At least one eligibility rule is required/i);
});

test('POST /api/payroll/eligibility/profiles rejects missing eligibility_rules_json', async () => {
  const create = await api('POST', '/api/payroll/eligibility/profiles', {
    body: {
      enterprise_id: TEST_ENTERPRISE_ID,
      profile_code: `MISSING_${Date.now()}`,
      profile_name: 'Missing Rules'
    }
  });
  assert.equal(create.status, 400);
  assert.equal(create.json?.success, false);
});

test('POST /api/payroll/eligibility/profiles accepts exact ALL_PAYROLL_EMPLOYEES body', async () => {
  const create = await api('POST', '/api/payroll/eligibility/profiles', {
    body: {
      enterprise_id: 1,
      profile_code: 'ALL_PAYROLL_EMPLOYEES',
      profile_name: 'All Payroll Employees Profile',
      description: 'Eligibility profile for controlled payroll testing',
      match_logic_code: 'ANY',
      effective_start_date: '2026-01-01',
      effective_end_date: '4712-12-31',
      status: 'ACTIVE',
      eligibility_rules_json: [
        {
          eligibility_rule_id: 55,
          rule_sequence: 1,
          active_flag: 'Y'
        }
      ]
    }
  });

  assert.ok(
    [200, 201].includes(create.status),
    `expected 200/201, got ${create.status}: ${create.text?.slice(0, 600)}`
  );
  assert.equal(create.json?.success, true, create.text?.slice(0, 600));
  assert.ok(create.json?.data?.profile_id != null);
  assert.ok(create.json?.data?.profile_guid);

  const verify = await db.executeQuery(
    `
SELECT
    P.PROFILE_ID,
    RAWTOHEX(P.PROFILE_GUID) PROFILE_GUID,
    P.ENTERPRISE_ID,
    P.PROFILE_CODE,
    P.PROFILE_NAME,
    P.MATCH_LOGIC_CODE,
    P.STATUS,
    PR.PROFILE_RULE_ID,
    PR.ELIGIBILITY_RULE_ID,
    PR.RULE_SEQUENCE,
    PR.ACTIVE_FLAG
  FROM PAY.PAY_ELEMENT_PROFILES P
  JOIN PAY.PAY_ELEMENT_PROFILE_RULES PR
    ON PR.PROFILE_ID = P.PROFILE_ID
 WHERE P.ENTERPRISE_ID = 1
   AND P.PROFILE_CODE = 'ALL_PAYROLL_EMPLOYEES'
 ORDER BY PR.RULE_SEQUENCE`.trim()
  );

  const rows = verify.rows || [];
  assert.ok(rows.length >= 1);
  assert.equal(Number(rows[0].ELIGIBILITY_RULE_ID ?? rows[0].eligibility_rule_id), 55);
  assert.equal(Number(rows[0].RULE_SEQUENCE ?? rows[0].rule_sequence), 1);
  assert.equal(String(rows[0].ACTIVE_FLAG ?? rows[0].active_flag).toUpperCase(), 'Y');
});
