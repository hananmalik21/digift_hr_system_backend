import test from 'node:test';
import assert from 'node:assert/strict';
import { ValidationError } from '../../../../utils/errors/index.js';
import {
  firstValidationMessage,
  validateCreateElementProcessingRuleBody,
  validateUpdateElementProcessingRuleBody
} from '../validations/payElementProcessingRules.validation.js';
import { mapPayElementProcessingRuleViewRow } from '../model/payElementProcessingRulesViewModel.js';
import {
  FORMULA_ENTERPRISE_MISMATCH_MESSAGE,
  isProcessingRuleNotFoundMessage,
  mapPackageBusinessMessage,
  PROCESSING_RULE_NOT_FOUND_MESSAGE
} from '../utils/payElementProcessingRulesOracleErrors.js';

const CREATE_BASE = Object.freeze({
  element_id: 71,
  processing_type_code: 'NONRECURRING',
  priority: 130,
  processing_group_code: 'STANDARD',
  effective_start_date: '2026-01-01',
  effective_end_date: null,
  legislative_data_group: 'KUWAIT',
  process_every_payroll_flag: 'N',
  retroactive_flag: 'Y',
  proration_flag: 'N',
  process_separately_flag: 'N',
  include_quickpay_flag: 'Y',
  include_simulation_flag: 'N'
});

const VIEW_BASE = Object.freeze({
  PROCESSING_RULE_ID: 104,
  PROCESSING_RULE_GUID: '58C53781728CEB7BE0631718000A9E2B',
  ELEMENT_ID: 71,
  ELEMENT_GUID: '58C0000000000000E0631718000A0001',
  ELEMENT_CODE: 'OVERTIME',
  ELEMENT_NAME: 'Overtime',
  ENTERPRISE_ID: 1,
  CLASSIFICATION_CODE: 'EARNINGS',
  CATEGORY_CODE: 'STANDARD',
  PROCESSING_TYPE_CODE: 'NONRECURRING',
  PRIORITY: 130,
  PROCESSING_GROUP_CODE: 'STANDARD',
  EFFECTIVE_START_DATE: '2026-01-01',
  EFFECTIVE_END_DATE: null,
  LEGISLATIVE_DATA_GROUP: 'KUWAIT',
  PROCESS_EVERY_PAYROLL_FLAG: 'N',
  RETROACTIVE_FLAG: 'Y',
  PRORATION_FLAG: 'N',
  PROCESS_SEPARATELY_FLAG: 'N',
  INCLUDE_QUICKPAY_FLAG: 'Y',
  INCLUDE_SIMULATION_FLAG: 'N',
  CREATED_BY: 'TEST',
  CREATION_DATE: '2026-01-01T00:00:00.000Z',
  LAST_UPDATED_BY: 'TEST',
  LAST_UPDATE_DATE: '2026-01-01T00:00:00.000Z'
});

test('A. create without formula_id omits formula_id from payload', () => {
  const out = validateCreateElementProcessingRuleBody({ ...CREATE_BASE });
  assert.equal(Object.prototype.hasOwnProperty.call(out, 'formula_id'), false);
  assert.equal(out.element_id, 71);
  assert.equal(out.processing_type_code, 'NONRECURRING');
});

test('B. create with valid formula_id includes formula_id', () => {
  const out = validateCreateElementProcessingRuleBody({ ...CREATE_BASE, formula_id: 9 });
  assert.equal(out.formula_id, 9);
});

test('create with formula_id null includes explicit null (does not strip)', () => {
  const out = validateCreateElementProcessingRuleBody({ ...CREATE_BASE, formula_id: null });
  assert.equal(Object.prototype.hasOwnProperty.call(out, 'formula_id'), true);
  assert.equal(out.formula_id, null);
  assert.equal(JSON.stringify({ formula_id: out.formula_id }), '{"formula_id":null}');
});

test('C. update { formula_id: 9 } only includes formula_id', () => {
  const out = validateUpdateElementProcessingRuleBody({ formula_id: 9 });
  assert.deepEqual(out, { formula_id: 9 });
});

test('D. update { priority: 140 } omits formula_id so existing link is unchanged by package', () => {
  const out = validateUpdateElementProcessingRuleBody({ priority: 140 });
  assert.deepEqual(out, { priority: 140 });
  assert.equal(Object.prototype.hasOwnProperty.call(out, 'formula_id'), false);
});

test('E. update { formula_id: null } preserves null for unlink', () => {
  const out = validateUpdateElementProcessingRuleBody({ formula_id: null });
  assert.equal(Object.prototype.hasOwnProperty.call(out, 'formula_id'), true);
  assert.equal(out.formula_id, null);
  assert.match(JSON.stringify(out), /"formula_id":null/);
});

test('F/G. invalid formula_id rejected at validation with 400-style ValidationError', () => {
  assert.throws(
    () => validateCreateElementProcessingRuleBody({ ...CREATE_BASE, formula_id: 0 }),
    (err) =>
      err instanceof ValidationError &&
      firstValidationMessage(err) === 'formula_id must be a positive integer or null'
  );
  assert.throws(
    () => validateUpdateElementProcessingRuleBody({ formula_id: -1 }),
    (err) =>
      err instanceof ValidationError &&
      firstValidationMessage(err) === 'formula_id must be a positive integer or null'
  );
  assert.throws(
    () => validateUpdateElementProcessingRuleBody({ formula_id: 'abc' }),
    (err) => err instanceof ValidationError
  );
});

test('package formula enterprise mismatch maps to friendly 400 message', () => {
  assert.equal(
    mapPackageBusinessMessage(
      'Selected formula does not exist or does not belong to the same enterprise as the element.'
    ),
    FORMULA_ENTERPRISE_MISMATCH_MESSAGE
  );
  assert.equal(
    mapPackageBusinessMessage('ORA-20001: Formula does not exist for this enterprise'),
    FORMULA_ENTERPRISE_MISMATCH_MESSAGE
  );
  assert.equal(
    mapPackageBusinessMessage('Invalid formula_id supplied'),
    FORMULA_ENTERPRISE_MISMATCH_MESSAGE
  );
});

test('processing rule not found maps to 404 message helper', () => {
  const msg = mapPackageBusinessMessage('Processing rule not found');
  assert.equal(msg, PROCESSING_RULE_NOT_FOUND_MESSAGE);
  assert.equal(isProcessingRuleNotFoundMessage(msg), true);
});

test('H. GET mapping returns formula metadata when linked', () => {
  const mapped = mapPayElementProcessingRuleViewRow({
    ...VIEW_BASE,
    FORMULA_ID: 9,
    FORMULA_GUID: '58C386F0FA598C58E0631718000A977C',
    FORMULA_CODE: 'OVERTIME_CALC',
    FORMULA_NAME: 'Overtime Calculation',
    FORMULA_TYPE_CODE: 'OVERTIME',
    FORMULA_ENGINE_CODE: 'INTERNAL',
    RETURN_TYPE_CODE: 'AMOUNT',
    RETURN_VALUE_CODE: 'PAY_VALUE',
    FORMULA_STATUS: 'ACTIVE'
  });

  assert.equal(mapped.element_id, 71);
  assert.equal(mapped.formula_id, 9);
  assert.equal(mapped.formula_guid, '58C386F0FA598C58E0631718000A977C');
  assert.equal(mapped.formula_code, 'OVERTIME_CALC');
  assert.equal(mapped.formula_name, 'Overtime Calculation');
  assert.equal(mapped.formula_type_code, 'OVERTIME');
  assert.equal(mapped.formula_engine_code, 'INTERNAL');
  assert.equal(mapped.return_type_code, 'AMOUNT');
  assert.equal(mapped.return_value_code, 'PAY_VALUE');
  assert.equal(mapped.formula_status, 'ACTIVE');
});

test('I. GET mapping returns null formula fields when unlinked (LEFT JOIN)', () => {
  const mapped = mapPayElementProcessingRuleViewRow({
    ...VIEW_BASE,
    FORMULA_ID: null,
    FORMULA_GUID: null,
    FORMULA_CODE: null,
    FORMULA_NAME: null,
    FORMULA_TYPE_CODE: null,
    FORMULA_ENGINE_CODE: null,
    RETURN_TYPE_CODE: null,
    RETURN_VALUE_CODE: null,
    FORMULA_STATUS: null
  });

  assert.equal(mapped.processing_rule_id, 104);
  assert.equal(mapped.element_id, 71);
  assert.equal(mapped.formula_id, null);
  assert.equal(mapped.formula_guid, null);
  assert.equal(mapped.formula_code, null);
  assert.equal(mapped.formula_name, null);
  assert.equal(mapped.formula_type_code, null);
  assert.equal(mapped.formula_engine_code, null);
  assert.equal(mapped.return_type_code, null);
  assert.equal(mapped.return_value_code, null);
  assert.equal(mapped.formula_status, null);
});

test('update rejects empty body', () => {
  assert.throws(
    () => validateUpdateElementProcessingRuleBody({}),
    (err) =>
      err instanceof ValidationError &&
      firstValidationMessage(err) === 'At least one updatable field is required'
  );
});

test('create still rejects unknown processing_type_code', () => {
  assert.throws(
    () =>
      validateCreateElementProcessingRuleBody({
        ...CREATE_BASE,
        processing_type_code: 'WEEKLY'
      }),
    (err) => err instanceof ValidationError
  );
});
