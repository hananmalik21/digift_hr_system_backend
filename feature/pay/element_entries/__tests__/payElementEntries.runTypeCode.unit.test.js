/**
 * Element-entry RUN_TYPE_CODE API contract tests.
 * No live Oracle required.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ValidationError } from '../../../../utils/errors/index.js';
import {
  validateCreateElementEntryBody,
  validateUpdateElementEntryBody
} from '../validations/payElementEntries.validation.js';
import { mapElementEntryViewRow } from '../model/payElementEntriesViewModel.js';
import {
  mapPackageBusinessMessage,
  resolvePayElementEntriesOracleMessage
} from '../utils/payElementEntriesOracleErrors.js';
import { packageStatusIsSuccess } from '../../../../utils/oraclePackageUtils.js';
import { sendMutationOutcome } from '../controllers/payElementEntriesControllerHelpers.js';
import { validateCreateDraft } from '../../../payroll/flow_submissions/middleware/payFlowSubmissions.validation.js';
import {
  validatePrepareRunEmployees,
  validateProcessRun
} from '../../../payroll/runs/middleware/payRunsValidation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readRel(rel) {
  return fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
}

const REQUIRED_CREATE = {
  enterprise_id: 1,
  employee_id: 292,
  element_id: 3,
  effective_as_of_date: '2026-07-15',
  effective_start_date: '2026-07-15'
};

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

function authReq(overrides = {}) {
  return {
    query: {},
    params: {},
    body: {},
    user: { username: 'PAYROLL_TEST', enterprise_id: 1 },
    enterprise: { enterpriseId: 1 },
    ...overrides
  };
}

function assertValidationRejected(fn) {
  assert.throws(fn, (err) => err instanceof ValidationError);
}

test('A: element entry create accepts explicit REGULAR', () => {
  const payload = validateCreateElementEntryBody({
    ...REQUIRED_CREATE,
    run_type_code: 'REGULAR'
  });
  assert.equal(payload.run_type_code, 'REGULAR');
});

test('B: element entry create accepts explicit RETRO', () => {
  const payload = validateCreateElementEntryBody({
    ...REQUIRED_CREATE,
    run_type_code: 'RETRO',
    retroactive_flag: 'Y'
  });
  assert.equal(payload.run_type_code, 'RETRO');
  assert.equal(payload.retroactive_flag, 'Y');
});

test('C: element entry create accepts explicit BONUS', () => {
  const payload = validateCreateElementEntryBody({
    ...REQUIRED_CREATE,
    run_type_code: 'bonus',
    retroactive_flag: 'N'
  });
  assert.equal(payload.run_type_code, 'BONUS');
  assert.equal(payload.retroactive_flag, 'N');
});

test('D: element entry create accepts explicit SUPPLEMENTAL', () => {
  const payload = validateCreateElementEntryBody({
    ...REQUIRED_CREATE,
    run_type_code: 'SUPPLEMENTAL',
    retroactive_flag: 'N'
  });
  assert.equal(payload.run_type_code, 'SUPPLEMENTAL');
  assert.equal(payload.retroactive_flag, 'N');
});

test('E: omitted run_type_code remains accepted for backward compatibility', () => {
  const payload = validateCreateElementEntryBody(REQUIRED_CREATE);
  assert.equal(Object.hasOwn(payload, 'run_type_code'), false);
});

test('F: invalid run_type_code is rejected by API validation', () => {
  assertValidationRejected(() =>
    validateCreateElementEntryBody({
      ...REQUIRED_CREATE,
      run_type_code: 'OFFCYCLE'
    })
  );
});

test('create does not enforce Oracle run-type / retroactive_flag consistency', () => {
  const payload = validateCreateElementEntryBody({
    ...REQUIRED_CREATE,
    run_type_code: 'RETRO',
    retroactive_flag: 'N'
  });
  assert.equal(payload.run_type_code, 'RETRO');
  assert.equal(payload.retroactive_flag, 'N');
});

test('G: element entry update passes run_type_code only when supplied', () => {
  const amountOnly = validateUpdateElementEntryBody({ amount: 150 });
  assert.equal(Object.hasOwn(amountOnly, 'run_type_code'), false);
  assert.equal(amountOnly.amount, 150);

  const withRunType = validateUpdateElementEntryBody({ run_type_code: 'BONUS' });
  assert.equal(withRunType.run_type_code, 'BONUS');
  assert.deepEqual(Object.keys(withRunType), ['run_type_code']);
});

test('H: element entry GET/list mapping returns run_type_code including null', async () => {
  const mapped = await mapElementEntryViewRow({
    ELEMENT_ENTRY_ID: 10,
    ELEMENT_ENTRY_GUID: 'A1B2C3D4E5F6789012345678ABCDEF01',
    ENTERPRISE_ID: 1,
    EMPLOYEE_ID: 292,
    ELEMENT_ID: 3,
    RUN_TYPE_CODE: 'BONUS',
    RETROACTIVE_FLAG: 'N'
  });
  assert.equal(mapped.run_type_code, 'BONUS');
  assert.equal(mapped.retroactive_flag, 'N');

  const historical = await mapElementEntryViewRow({
    ELEMENT_ENTRY_ID: 11,
    ELEMENT_ENTRY_GUID: 'B1B2C3D4E5F6789012345678ABCDEF01',
    ENTERPRISE_ID: 1,
    RUN_TYPE_CODE: null
  });
  assert.equal(historical.run_type_code, null);
});

test('I: flow-submission create continues accepting run_type_code', () => {
  const req = authReq({
    body: {
      enterprise_id: 1,
      flow_id: 1,
      run_type_code: 'bonus'
    }
  });
  let nextCalled = false;
  validateCreateDraft(req, mockRes(), () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.equal(req.validated.run_type_code, 'BONUS');
});

test('J: prepare-employees request contract remains unchanged', () => {
  const req = authReq({
    params: { runId: '123' },
    body: { enterprise_id: 1, run_type_code: 'BONUS' }
  });
  validatePrepareRunEmployees(req, mockRes(), () => {});
  assert.equal(Object.hasOwn(req.validated, 'run_type_code'), false);
  assert.equal(req.validated.run_id, 123);
  assert.equal(req.validated.enterprise_id, 1);
  assert.ok(Object.hasOwn(req.validated, 'prepared_by'));
});

test('K: process request contract remains unchanged', () => {
  const req = authReq({
    params: { runId: '123' },
    body: { enterprise_id: 1, stop_on_error: 'N', run_type_code: 'RETRO' }
  });
  validateProcessRun(req, mockRes(), () => {});
  assert.equal(Object.hasOwn(req.validated, 'run_type_code'), false);
  assert.equal(req.validated.stop_on_error, 'N');
  assert.equal(req.validated.run_id, 123);
});

test('L: Oracle business failure is not treated as success', () => {
  const oracleMessage = 'RUN_TYPE_CODE RETRO requires RETROACTIVE_FLAG = Y';
  assert.equal(packageStatusIsSuccess('ERROR'), false);
  assert.equal(packageStatusIsSuccess('E'), false);
  assert.equal(mapPackageBusinessMessage(oracleMessage), oracleMessage);

  const remapped = resolvePayElementEntriesOracleMessage({
    errorNum: 20001,
    message: `ORA-20001: ${oracleMessage}`
  });
  assert.equal(remapped, oracleMessage);
  assert.notEqual(remapped, 'GUID is required.');

  const res = mockRes();
  sendMutationOutcome(res, {
    success: false,
    httpStatus: 200,
    message: oracleMessage
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, false);
  assert.equal(res.body.message, oracleMessage);

  const serviceSrc = readRel('../services/payElementEntries.service.js');
  assert.ok(serviceSrc.includes('packageStatusIsSuccess(pkg.status)'));
  assert.ok(serviceSrc.includes('success: false'));
});

test('create/update still invoke PAY_ELEMENT_ENTRIES_PKG JSON payloads only', () => {
  const modelSrc = readRel('../model/payElementEntriesModel.js');
  assert.ok(modelSrc.includes("const PKG = 'PAY.PAY_ELEMENT_ENTRIES_PKG'"));
  assert.ok(modelSrc.includes('CREATE_ELEMENT_ENTRY'));
  assert.ok(modelSrc.includes('UPDATE_ELEMENT_ENTRY'));
  assert.ok(modelSrc.includes('P_PAYLOAD_JSON'));
  assert.equal(/\bUPDATE\s+PAY\.PAY_ELEMENT_ENTRIES\b/i.test(modelSrc), false);
  assert.equal(/\bINSERT\s+INTO\s+PAY\.PAY_ELEMENT_ENTRIES\b/i.test(modelSrc), false);
});
