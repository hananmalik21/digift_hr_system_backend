import test from 'node:test';
import assert from 'node:assert/strict';
import { ValidationError } from '../../../../utils/errors/index.js';
import { normalizeEligibilityRules } from '../utils/normalizeEligibilityRules.js';
import {
  validateCreateElementEligProfileBody,
  validateUpdateElementEligProfileBody
} from '../validations/payElementEligProfiles.validation.js';

test('1: standard array normalizes eligibility rules', () => {
  const out = normalizeEligibilityRules([
    {
      eligibility_rule_id: 55,
      rule_sequence: 1,
      active_flag: 'Y'
    }
  ]);
  assert.deepEqual(out, [
    { eligibility_rule_id: 55, rule_sequence: 1, active_flag: 'Y' }
  ]);
});

test('2: already-stringified JSON is backward compatible', () => {
  const out = normalizeEligibilityRules(
    '[{"eligibility_rule_id":55,"rule_sequence":1,"active_flag":"Y"}]'
  );
  assert.deepEqual(out, [
    { eligibility_rule_id: 55, rule_sequence: 1, active_flag: 'Y' }
  ]);
});

test('3: empty array is rejected', () => {
  assert.throws(
    () => normalizeEligibilityRules([]),
    (err) =>
      err instanceof ValidationError &&
      /At least one eligibility rule is required/i.test(err.errors?.[0] || err.message)
  );
});

test('4: missing eligibility_rules_json is rejected', () => {
  assert.throws(
    () => normalizeEligibilityRules(undefined),
    (err) => err instanceof ValidationError && /required/i.test(err.errors?.[0] || err.message)
  );
});

test('5: invalid JSON string is rejected', () => {
  assert.throws(
    () => normalizeEligibilityRules('[{"eligibility_rule_id":'),
    (err) => err instanceof ValidationError && /valid JSON/i.test(err.errors?.[0] || err.message)
  );
});

test('6: missing eligibility_rule_id is rejected', () => {
  assert.throws(
    () =>
      normalizeEligibilityRules([
        {
          rule_sequence: 1,
          active_flag: 'Y'
        }
      ]),
    (err) =>
      err instanceof ValidationError && /eligibility_rule_id is required/i.test(err.errors?.[0] || '')
  );
});

test('7: invalid active_flag is rejected', () => {
  assert.throws(
    () =>
      normalizeEligibilityRules([
        {
          eligibility_rule_id: 55,
          active_flag: 'ABC'
        }
      ]),
    (err) => err instanceof ValidationError && /active_flag must be Y or N/i.test(err.errors?.[0] || '')
  );
});

test('8: multiple rules normalize with defaults', () => {
  const out = normalizeEligibilityRules([
    { eligibility_rule_id: 55, rule_sequence: 1, active_flag: 'Y' },
    { eligibility_rule_id: 56, rule_sequence: 2 }
  ]);
  assert.deepEqual(out, [
    { eligibility_rule_id: 55, rule_sequence: 1, active_flag: 'Y' },
    { eligibility_rule_id: 56, rule_sequence: 2, active_flag: 'Y' }
  ]);
});

test('create body accepts Postman eligibility_rules_json contract', () => {
  const out = validateCreateElementEligProfileBody({
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
  });

  assert.equal(out.profile_code, 'ALL_PAYROLL_EMPLOYEES');
  assert.equal(out.match_logic_code, 'ANY');
  assert.deepEqual(out.eligibility_rules, [
    { eligibility_rule_id: 55, rule_sequence: 1, active_flag: 'Y' }
  ]);
});

test('create rejects empty eligibility_rules_json with required message', () => {
  assert.throws(
    () =>
      validateCreateElementEligProfileBody({
        enterprise_id: 1,
        profile_code: 'X',
        profile_name: 'X',
        eligibility_rules_json: []
      }),
    (err) =>
      err instanceof ValidationError &&
      /At least one eligibility rule is required/i.test(err.errors?.[0] || err.message)
  );
});

test('update accepts eligibility_rules_json without replacing omitted semantics', () => {
  const out = validateUpdateElementEligProfileBody({
    profile_name: 'Updated',
    eligibility_rules_json: [{ eligibility_rule_id: 55 }]
  });
  assert.equal(out.profile_name, 'Updated');
  assert.deepEqual(out.eligibility_rules, [
    { eligibility_rule_id: 55, rule_sequence: 1, active_flag: 'Y' }
  ]);
});
