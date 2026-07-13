import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectDuplicateCriteriaTypeErrors,
  criteriaForPackagePayload,
  normalizeCriteriaForApi
} from '../utils/payElementEligibilityCriteriaUtils.js';
import { validateCreateElementEligibilityRuleBody } from '../validations/payElementEligibilityRules.validation.js';

test('maps all-values marker to empty criteria_values array', () => {
  const out = normalizeCriteriaForApi([{ criteria_type_code: 'GRADE', criteria_value: '*' }]);
  assert.deepEqual(out, [{ criteria_type_code: 'GRADE', criteria_values: [] }]);
});

test('groups flat child rows by criteria type', () => {
  const out = normalizeCriteriaForApi([
    { criteria_type_code: 'GRADE', criteria_value: '1' },
    { criteria_type_code: 'GRADE', criteria_value: '2' }
  ]);
  assert.deepEqual(out, [{ criteria_type_code: 'GRADE', criteria_values: ['1', '2'] }]);
});

test('builds package payload for empty and specific criteria', () => {
  const out = criteriaForPackagePayload([
    { criteria_type_code: 'GRADE', criteria_values: [] },
    { criteria_type_code: 'POSITION', criteria_values: ['ABCDEF1234567890ABCDEF1234567890'] }
  ]);
  assert.deepEqual(out, [
    { criteria_type_code: 'GRADE', criteria_values: [] },
    {
      criteria_type_code: 'POSITION',
      criteria_value: 'ABCDEF1234567890ABCDEF1234567890'
    }
  ]);
});

test('rejects mixed all-values and specific values for same criteria type', () => {
  const errors = collectDuplicateCriteriaTypeErrors([
    { criteria_type_code: 'GRADE', criteria_values: [] },
    { criteria_type_code: 'GRADE', criteria_values: ['1'] }
  ]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /cannot combine all values with specific values/i);
});

test('accepts empty criteria_values array on create', () => {
  const out = validateCreateElementEligibilityRuleBody({
    enterprise_id: 1,
    rule_name: 'Management Grades',
    criteria: [{ criteria_type_code: 'GRADE', criteria_values: [] }]
  });
  assert.deepEqual(out.criteria, [{ criteria_type_code: 'GRADE', criteria_values: [] }]);
});

test('rejects explicit all-values marker in request body', () => {
  assert.throws(
    () =>
      validateCreateElementEligibilityRuleBody({
        enterprise_id: 1,
        rule_name: 'Invalid',
        criteria: [{ criteria_type_code: 'GRADE', criteria_values: ['*'] }]
      }),
    /Validation failed/
  );
});
