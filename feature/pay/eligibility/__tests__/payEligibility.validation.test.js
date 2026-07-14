import test from 'node:test';
import assert from 'node:assert/strict';
import { ValidationError } from '../../../../utils/errors/index.js';
import {
  firstValidationMessage,
  validateEvaluateEligibilityBody
} from '../validations/payEligibility.validation.js';
import {
  buildForbiddenErrorPayload,
  buildSystemErrorPayload,
  buildValidationErrorPayload
} from '../utils/payEligibilityResponseUtils.js';
import { parseResultJsonClob, readClob } from '../utils/payEligibilityClobUtils.js';
import {
  ACCESS_DENIED_MESSAGE,
  GENERIC_TECHNICAL_ERROR,
  VALIDATION_REQUIRED_MESSAGE
} from '../constants/payEligibility.constants.js';

const VALID_BODY = {
  enterprise_id: 1,
  employee_guid: '4CBB495127471A6FE0633519000A2706',
  element_id: 3
};

test('validateEvaluateEligibilityBody accepts a valid payload', () => {
  const out = validateEvaluateEligibilityBody(VALID_BODY);
  assert.deepEqual(out, {
    enterprise_id: 1,
    employee_guid: '4CBB495127471A6FE0633519000A2706',
    element_id: 3
  });
});

test('validateEvaluateEligibilityBody normalizes employee_guid hyphen format', () => {
  const out = validateEvaluateEligibilityBody({
    ...VALID_BODY,
    employee_guid: '4CBB4951-2747-1A6F-E063-3519000A2706'
  });
  assert.equal(out.employee_guid, '4CBB495127471A6FE0633519000A2706');
});

test('validateEvaluateEligibilityBody rejects missing required fields with combined message', () => {
  assert.throws(
    () => validateEvaluateEligibilityBody({}),
    (err) =>
      err instanceof ValidationError &&
      firstValidationMessage(err) === VALIDATION_REQUIRED_MESSAGE
  );
});

test('validateEvaluateEligibilityBody rejects non-string employee_guid', () => {
  assert.throws(
    () => validateEvaluateEligibilityBody({ ...VALID_BODY, employee_guid: 123 }),
    (err) => err instanceof ValidationError && err.errors.includes('employee_guid must be a string')
  );
});

test('validateEvaluateEligibilityBody rejects blank employee_guid', () => {
  assert.throws(
    () => validateEvaluateEligibilityBody({ ...VALID_BODY, employee_guid: '   ' }),
    (err) => err instanceof ValidationError && err.errors.includes('employee_guid is required')
  );
});

test('validateEvaluateEligibilityBody rejects invalid element_id', () => {
  assert.throws(
    () => validateEvaluateEligibilityBody({ ...VALID_BODY, element_id: 0 }),
    (err) => err instanceof ValidationError && err.errors.includes('element_id must be a number')
  );
});

test('firstValidationMessage prefers specific type errors over required message', () => {
  const err = new ValidationError('Validation failed', ['element_id must be a number']);
  assert.equal(firstValidationMessage(err), 'element_id must be a number');
});

test('buildValidationErrorPayload matches API contract', () => {
  assert.deepEqual(buildValidationErrorPayload(), {
    success: false,
    eligible: false,
    message: VALIDATION_REQUIRED_MESSAGE,
    evaluation_trace: []
  });
});

test('buildForbiddenErrorPayload matches API contract', () => {
  assert.deepEqual(buildForbiddenErrorPayload(), {
    success: false,
    eligible: false,
    message: ACCESS_DENIED_MESSAGE,
    evaluation_trace: []
  });
});

test('buildSystemErrorPayload returns the expected 500 shape', () => {
  assert.deepEqual(buildSystemErrorPayload(), {
    success: false,
    eligible: false,
    message: GENERIC_TECHNICAL_ERROR,
    evaluation_trace: []
  });
});

test('readClob returns string values and unwraps array binds', async () => {
  assert.equal(await readClob('{"success":true}'), '{"success":true}');
  assert.equal(await readClob(['{"ok":1}']), '{"ok":1}');
  assert.equal(await readClob(null), null);
});

test('parseResultJsonClob parses object JSON from CLOB text', async () => {
  const out = await parseResultJsonClob('{"success":true,"eligible":false}');
  assert.deepEqual(out, { success: true, eligible: false });
});

test('parseResultJsonClob rejects null and non-object JSON', async () => {
  assert.equal(await parseResultJsonClob(null), null);
  assert.equal(await parseResultJsonClob(''), null);
  assert.equal(await parseResultJsonClob('["not","an","object"]'), null);
  assert.equal(await parseResultJsonClob('not-json'), null);
});
