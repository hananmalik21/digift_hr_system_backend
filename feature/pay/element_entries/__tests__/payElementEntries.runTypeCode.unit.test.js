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
  ELEMENT_ENTRIES_LIST_DEFAULT_LIMIT,
  ELEMENT_ENTRIES_LIST_DEFAULT_PAGE,
  validateCreateElementEntryBody,
  validateListElementEntriesQuery,
  validateUpdateElementEntryBody
} from '../validations/payElementEntries.validation.js';
import { mapElementEntryViewRow } from '../model/payElementEntriesViewModel.js';
import { buildPayElementEntriesListWhereClause } from '../utils/payElementEntriesFilterBuilder.js';
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

test('GET/LIST SELECT uses view column v.RUN_TYPE_CODE after ENTRY_TYPE_CODE', () => {
  const viewSrc = readRel('../model/payElementEntriesViewModel.js');
  assert.ok(viewSrc.includes("const VIEW = 'PAY.V_PAY_ELEMENT_ENTRIES'"));
  assert.ok(viewSrc.includes('v.ENTRY_TYPE_CODE,\n  v.RUN_TYPE_CODE,'));
  assert.equal(/SELECT\s+E\.RUN_TYPE_CODE/i.test(viewSrc), false);
  assert.equal(/FROM\s+PAY\.PAY_ELEMENT_ENTRIES\s+E/i.test(viewSrc), false);
  assert.ok(!viewSrc.includes('AS RUN_TYPE_CODE'));
});

test('A/B: GET and LIST mapping expose snake_case run_type_code only', async () => {
  const mapped = await mapElementEntryViewRow({
    ELEMENT_ENTRY_ID: 10,
    ELEMENT_ENTRY_GUID: 'A1B2C3D4E5F6789012345678ABCDEF01',
    ENTERPRISE_ID: 1,
    ENTRY_TYPE_CODE: 'STANDARD',
    RUN_TYPE_CODE: 'REGULAR',
    RETROACTIVE_FLAG: 'N'
  });
  assert.equal(mapped.entry_type_code, 'STANDARD');
  assert.equal(mapped.run_type_code, 'REGULAR');
  assert.equal(mapped.retroactive_flag, 'N');
  assert.equal(Object.hasOwn(mapped, 'RUN_TYPE_CODE'), false);
});

test('C: historical RUN_TYPE_CODE NULL is returned as null, not REGULAR', async () => {
  const historical = await mapElementEntryViewRow({
    ELEMENT_ENTRY_ID: 11,
    ELEMENT_ENTRY_GUID: 'B1B2C3D4E5F6789012345678ABCDEF01',
    ENTERPRISE_ID: 1,
    ENTRY_TYPE_CODE: 'ELEMENT_ENTRY',
    RUN_TYPE_CODE: null
  });
  assert.equal(historical.run_type_code, null);
  assert.notEqual(historical.run_type_code, 'REGULAR');
  assert.equal(historical.entry_type_code, 'ELEMENT_ENTRY');
});

test('I: entry_type_code remains independent of run_type_code', () => {
  const payload = validateCreateElementEntryBody({
    ...REQUIRED_CREATE,
    entry_type_code: 'STANDARD',
    run_type_code: 'BONUS'
  });
  assert.equal(payload.entry_type_code, 'STANDARD');
  assert.equal(payload.run_type_code, 'BONUS');
});

test('J: list pagination and existing filters are unchanged when run_type_code is omitted', () => {
  const parsed = validateListElementEntriesQuery({ enterprise_id: 1 });
  assert.equal(parsed.page, ELEMENT_ENTRIES_LIST_DEFAULT_PAGE);
  assert.equal(parsed.limit, ELEMENT_ENTRIES_LIST_DEFAULT_LIMIT);
  assert.equal(parsed.run_type_code, null);
  assert.equal(parsed.sort_by, 'creation_date');
  assert.equal(parsed.sort_order, 'DESC');

  const paged = validateListElementEntriesQuery({
    enterprise_id: 1,
    page: 2,
    limit: 10,
    employee_id: 292,
    approval_status_code: 'DRAFT'
  });
  assert.equal(paged.page, 2);
  assert.equal(paged.limit, 10);
  assert.equal(paged.employee_id, 292);
  assert.equal(paged.approval_status_code, 'DRAFT');
  assert.equal(paged.run_type_code, null);

  const unfiltered = buildPayElementEntriesListWhereClause(parsed);
  assert.equal(unfiltered.whereSql.includes('v.RUN_TYPE_CODE'), false);
});

test('optional list filter run_type_code is applied against the view column', () => {
  const parsed = validateListElementEntriesQuery({
    enterprise_id: 1,
    run_type_code: 'retro',
    page: 1,
    limit: 20
  });
  assert.equal(parsed.run_type_code, 'RETRO');
  assert.equal(parsed.page, 1);
  assert.equal(parsed.limit, 20);

  const clause = buildPayElementEntriesListWhereClause(parsed);
  assert.ok(clause.whereSql.includes('v.RUN_TYPE_CODE = :run_type_code'));
  assert.equal(clause.binds.run_type_code, 'RETRO');
});

test('invalid list filter run_type_code is rejected', () => {
  assertValidationRejected(() =>
    validateListElementEntriesQuery({ enterprise_id: 1, run_type_code: 'OFFCYCLE' })
  );
});

