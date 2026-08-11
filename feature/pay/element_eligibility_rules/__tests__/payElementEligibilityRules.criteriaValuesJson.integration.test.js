/**
 * Integration: eligibility rule create binds criteria_values_json as Oracle CLOB text.
 * Requires a live Oracle pool (same harness as payroll API tests).
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

const RULE_NAME = `IT All Payroll Employees ${Date.now()}`;

test.before(async () => {
  await ensurePool();
  await startPayrollTestServer();
});

test.after(async () => {
  await stopPayrollTestServer();
});

test('POST /api/payroll/eligibility/rules accepts criteria_values_json array', async () => {
  const create = await api('POST', '/api/payroll/eligibility/rules', {
    body: {
      enterprise_id: TEST_ENTERPRISE_ID,
      rule_name: RULE_NAME,
      criteria_values_json: [
        {
          criteria_type_code: 'EMPLOYMENT_TYPE',
          criteria_values: []
        }
      ],
      effective_start_date: '2026-01-01',
      effective_end_date: '4712-12-31',
      status: 'ACTIVE'
    }
  });

  assert.ok(
    [200, 201].includes(create.status),
    `expected 200/201, got ${create.status}: ${create.text?.slice(0, 500)}`
  );
  assert.equal(create.json?.success, true, create.text?.slice(0, 500));
  assert.ok(create.json?.data?.eligibility_rule_id != null);
  assert.ok(create.json?.data?.eligibility_rule_guid);

  const ruleId = create.json.data.eligibility_rule_id;
  const result = await db.executeQuery(
    `
SELECT
    R.ELIGIBILITY_RULE_ID,
    R.RULE_NAME,
    V.CRITERIA_TYPE_CODE,
    V.CRITERIA_VALUE,
    V.ALL_VALUES_FLAG
  FROM PAY.PAY_ELEMENT_ELIGIBILITY_RULES R
  JOIN PAY.PAY_ELEMENT_ELIGIBILITY_RULE_VALUES V
    ON V.ELIGIBILITY_RULE_ID = R.ELIGIBILITY_RULE_ID
 WHERE R.ELIGIBILITY_RULE_ID = :rule_id
 ORDER BY V.ELIGIBILITY_RULE_VALUE_ID
`,
    { rule_id: ruleId }
  );

  const rows = result.rows || [];
  assert.ok(rows.length >= 1, 'expected at least one eligibility rule value row');

  const employmentType = rows.find(
    (r) => String(r.CRITERIA_TYPE_CODE || r.criteria_type_code || '').toUpperCase() === 'EMPLOYMENT_TYPE'
  );
  assert.ok(employmentType, 'expected EMPLOYMENT_TYPE value row');

  const criteriaValue = String(
    employmentType.CRITERIA_VALUE ?? employmentType.criteria_value ?? ''
  ).trim();
  const allValuesFlag = String(
    employmentType.ALL_VALUES_FLAG ?? employmentType.all_values_flag ?? ''
  )
    .trim()
    .toUpperCase();

  assert.equal(criteriaValue, '*');
  assert.equal(allValuesFlag, 'Y');
});

test('POST /api/payroll/eligibility/rules rejects invalid criteria_values_json string', async () => {
  const create = await api('POST', '/api/payroll/eligibility/rules', {
    body: {
      enterprise_id: TEST_ENTERPRISE_ID,
      rule_name: `IT Bad JSON ${Date.now()}`,
      criteria_values_json: '[{"criteria_type_code":'
    }
  });

  assert.equal(create.status, 400);
  assert.equal(create.json?.success, false);
  assert.match(String(create.json?.message || ''), /valid JSON|required/i);
});

test('POST /api/payroll/eligibility/rules rejects missing criteria_values_json', async () => {
  const create = await api('POST', '/api/payroll/eligibility/rules', {
    body: {
      enterprise_id: TEST_ENTERPRISE_ID,
      rule_name: `IT Missing Criteria ${Date.now()}`
    }
  });

  assert.equal(create.status, 400);
  assert.equal(create.json?.success, false);
  assert.match(String(create.json?.message || ''), /criteria_values_json is required/i);
});
