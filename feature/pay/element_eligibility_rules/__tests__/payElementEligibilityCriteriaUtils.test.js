import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectDuplicateCriteriaTypeErrors,
  criteriaForPackagePayload,
  normalizeCriteriaForApi,
  normalizeCriteriaValuesJson
} from '../utils/payElementEligibilityCriteriaUtils.js';
import {
  validateCreateElementEligibilityRuleBody,
  validateUpdateElementEligibilityRuleBody
} from '../validations/payElementEligibilityRules.validation.js';
import { ValidationError } from '../../../../utils/errors/index.js';

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

test('A: array request normalizes empty criteria_values to JSON string for Oracle CLOB', () => {
  const input = [
    {
      criteria_type_code: 'EMPLOYMENT_TYPE',
      criteria_values: []
    }
  ];
  const out = normalizeCriteriaValuesJson(input);
  assert.equal(out, '[{"criteria_type_code":"EMPLOYMENT_TYPE","criteria_values":[]}]');
  assert.notEqual(out, null);
  assert.equal(typeof out, 'string');
});

test('B: single-value criteria normalizes without reshaping', () => {
  const out = normalizeCriteriaValuesJson([
    {
      criteria_type_code: 'GRADE',
      criteria_value: '2'
    }
  ]);
  assert.equal(out, '[{"criteria_type_code":"GRADE","criteria_value":"2"}]');
});

test('C: multi-value criteria normalizes without reshaping', () => {
  const out = normalizeCriteriaValuesJson([
    {
      criteria_type_code: 'GRADE',
      criteria_values: ['1', '2']
    }
  ]);
  assert.equal(out, '[{"criteria_type_code":"GRADE","criteria_values":["1","2"]}]');
});

test('D: already-stringified JSON is parsed then re-stringified', () => {
  const raw = '[{"criteria_type_code":"EMPLOYMENT_TYPE","criteria_values":[]}]';
  const out = normalizeCriteriaValuesJson(raw);
  assert.equal(out, '[{"criteria_type_code":"EMPLOYMENT_TYPE","criteria_values":[]}]');
});

test('E: invalid JSON string throws ValidationError', () => {
  assert.throws(
    () => normalizeCriteriaValuesJson('[{"criteria_type_code":'),
    (err) => err instanceof ValidationError && /valid JSON/i.test(err.errors?.[0] || err.message)
  );
});

test('F: missing criteria_values_json throws ValidationError', () => {
  assert.throws(
    () => normalizeCriteriaValuesJson(undefined),
    (err) => err instanceof ValidationError && /required/i.test(err.errors?.[0] || err.message)
  );
  assert.throws(
    () => normalizeCriteriaValuesJson(null),
    (err) => err instanceof ValidationError && /required/i.test(err.errors?.[0] || err.message)
  );
  assert.throws(
    () => normalizeCriteriaValuesJson(''),
    (err) => err instanceof ValidationError && /required/i.test(err.errors?.[0] || err.message)
  );
});

test('create accepts criteria_values_json array with empty nested criteria_values', () => {
  const out = validateCreateElementEligibilityRuleBody({
    enterprise_id: 1,
    rule_name: 'All Payroll Employees',
    criteria_values_json: [
      {
        criteria_type_code: 'EMPLOYMENT_TYPE',
        criteria_values: []
      }
    ],
    effective_start_date: '2026-01-01',
    effective_end_date: '4712-12-31',
    status: 'ACTIVE'
  });
  assert.equal(
    out.criteria_values_json,
    '[{"criteria_type_code":"EMPLOYMENT_TYPE","criteria_values":[]}]'
  );
});

test('create accepts legacy criteria field for backward compatibility', () => {
  const out = validateCreateElementEligibilityRuleBody({
    enterprise_id: 1,
    rule_name: 'Management Grades',
    criteria: [{ criteria_type_code: 'GRADE', criteria_values: [] }]
  });
  assert.equal(out.criteria_values_json, '[{"criteria_type_code":"GRADE","criteria_values":[]}]');
});

test('create rejects missing criteria_values_json with HTTP-ready validation message', () => {
  assert.throws(
    () =>
      validateCreateElementEligibilityRuleBody({
        enterprise_id: 1,
        rule_name: 'Missing Criteria'
      }),
    /Validation failed|criteria_values_json is required/
  );
});

test('create rejects invalid JSON string', () => {
  assert.throws(
    () =>
      validateCreateElementEligibilityRuleBody({
        enterprise_id: 1,
        rule_name: 'Bad JSON',
        criteria_values_json: '{not-json'
      }),
    /Validation failed|valid JSON/
  );
});

test('update normalizes criteria_values_json the same way as create', () => {
  const out = validateUpdateElementEligibilityRuleBody({
    criteria_values_json: [
      {
        criteria_type_code: 'GRADE',
        criteria_values: ['1', '2']
      }
    ]
  });
  assert.equal(
    out.criteria_values_json,
    '[{"criteria_type_code":"GRADE","criteria_values":["1","2"]}]'
  );
});

test('object criteria_values_json is stringified for Oracle', () => {
  const out = normalizeCriteriaValuesJson({
    criteria_type_code: 'GRADE',
    criteria_value: '2'
  });
  assert.equal(out, '{"criteria_type_code":"GRADE","criteria_value":"2"}');
});
