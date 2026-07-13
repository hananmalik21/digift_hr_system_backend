import test from 'node:test';
import assert from 'node:assert/strict';
import { ValidationError } from '../../../../utils/errors/index.js';
import { validateEvaluateEligibilityBody } from '../validations/payEligibility.validation.js';
import { buildSystemErrorPayload } from '../utils/payEligibilityResponseUtils.js';
import { parseResultJsonClob, readClobOutFully } from '../utils/payEligibilityClobUtils.js';

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

test('validateEvaluateEligibilityBody rejects missing required fields', () => {
  assert.throws(
    () => validateEvaluateEligibilityBody({}),
    (err) => err instanceof ValidationError && err.errors.length >= 3
  );
});

test('validateEvaluateEligibilityBody rejects non-string employee_guid', () => {
  assert.throws(
    () => validateEvaluateEligibilityBody({ ...VALID_BODY, employee_guid: 123 }),
    (err) => err instanceof ValidationError && err.errors.includes('employee_guid must be a string')
  );
});

test('validateEvaluateEligibilityBody rejects invalid element_id', () => {
  assert.throws(
    () => validateEvaluateEligibilityBody({ ...VALID_BODY, element_id: 0 }),
    (err) => err instanceof ValidationError && err.errors.includes('element_id must be a positive integer')
  );
});

test('buildSystemErrorPayload returns the expected 500 shape', () => {
  assert.deepEqual(buildSystemErrorPayload(), {
    success: false,
    eligible: false,
    message: 'Unable to evaluate eligibility. Please try again or contact support.',
    evaluation_trace: []
  });
});

test('readClobOutFully returns string values unchanged', async () => {
  assert.equal(await readClobOutFully('{"success":true}'), '{"success":true}');
});

test('parseResultJsonClob parses object JSON from CLOB text', async () => {
  const out = await parseResultJsonClob('{"success":true,"eligible":false}');
  assert.deepEqual(out, { success: true, eligible: false });
});

test('parseResultJsonClob rejects non-object JSON', async () => {
  assert.equal(await parseResultJsonClob('["not","an","object"]'), null);
  assert.equal(await parseResultJsonClob('not-json'), null);
});
