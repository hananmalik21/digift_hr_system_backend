/**
 * TM → Payroll transfer-batch create/reopen contract tests (no live Oracle required).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseError } from '../../../utils/errors/index.js';
import {
  isTransferBatchPeriodConflict,
  mapPayrollOracleError
} from '../shared/payrollOracleErrors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVICE_PATH = path.resolve(__dirname, '../time_management/tmPayroll.service.js');
const CONTROLLER_PATH = path.resolve(__dirname, '../time_management/tmPayroll.controller.js');
const serviceSource = fs.readFileSync(SERVICE_PATH, 'utf8');
const controllerSource = fs.readFileSync(CONTROLLER_PATH, 'utf8');

function ora(num, message) {
  return { errorNum: num, message: `ORA-${num}: ${message}` };
}

test('CREATE_TRANSFER_BATCH is the only create binding (no API reopen logic)', () => {
  assert.ok(serviceSource.includes('CREATE_TRANSFER_BATCH('));
  assert.ok(serviceSource.includes('findTransferBatchByPeriod'));
  assert.ok(
    serviceSource.includes('reopens a same-period REVERSED') ||
      serviceSource.includes('reopens a same-period REVERSED batch'),
    'service documents Oracle reopen ownership'
  );
});

test('controller does not reject same-period existence before Oracle create', () => {
  assert.ok(controllerSource.includes('findTransferBatchByPeriod'));
  assert.ok(controllerSource.includes('NEVER reject same-period existence'));
  const createFn = controllerSource.slice(
    controllerSource.indexOf('export async function createTransferBatchHandler'),
    controllerSource.indexOf('export async function previewTransferBatchHandler')
  );
  assert.ok(createFn.includes('createTransferBatch('));
  assert.ok(!/if\s*\(\s*priorSamePeriod[\s\S]{0,200}409/.test(createFn));
  assert.ok(createFn.includes('getTransferBatchById'));
  assert.ok(createFn.includes('wasReversedBatchReopened'));
  assert.ok(createFn.includes('reopened ? 200 : 201'));
});

test('API does not delete transfer history', () => {
  assert.ok(!/DELETE\s+FROM\s+TM\.?TM_PAYROLL_TRANSFER_HISTORY/i.test(serviceSource));
  assert.ok(!/DELETE\s+FROM\s+TM\.?TM_PAYROLL_TRANSFER_HISTORY/i.test(controllerSource));
  const routes = fs.readFileSync(
    path.resolve(__dirname, '../time_management/tmPayroll.routes.js'),
    'utf8'
  );
  assert.ok(!/history.*\.delete\(|\.delete\(.*history/i.test(routes));
});

test('isTransferBatchPeriodConflict detects non-reversed period conflicts', () => {
  assert.equal(
    isTransferBatchPeriodConflict(
      'Transfer batch already exists for this enterprise/payroll/period'
    ),
    true
  );
  assert.equal(
    isTransferBatchPeriodConflict(
      'ORA-00001: unique constraint (TM.TM_PAYROLL_TRANSFER_BATCHES_U1) violated'
    ),
    true
  );
  assert.equal(isTransferBatchPeriodConflict('Employee is not eligible.'), false);
  assert.equal(isTransferBatchPeriodConflict('Transfer batch reopened successfully.'), false);
});

test('mapPayrollOracleError maps transfer-batch period conflicts to 409 intent', () => {
  const mapped = mapPayrollOracleError(
    ora(20001, 'Transfer batch already exists for this payroll period')
  );
  assert.match(mapped.message, /transfer batch already exists/i);
  assert.equal(mapped.httpStatus, 409);
});

test('DatabaseError maps transfer-batch business conflict to HTTP 409', () => {
  const err = new DatabaseError(
    'fallback',
    ora(20001, 'A transfer batch already exists for this period'),
    'A transfer batch already exists for this enterprise, payroll, and period.'
  );
  assert.equal(err.statusCode, 409);
});

test('DatabaseError maps transfer-batch unique constraint to HTTP 409', () => {
  const err = new DatabaseError(
    'fallback',
    ora(1, 'unique constraint (TM.TM_PAYROLL_TRANSFER_BATCHES_U1) violated'),
    null
  );
  assert.equal(err.statusCode, 409);
  assert.match(String(err.message || err.userMessage || ''), /transfer batch already exists/i);
});

test('lifecycle procedures remain bound for preview/validate/transfer/reconcile/lock/reverse', () => {
  for (const name of [
    'PREVIEW_TRANSFER_BATCH',
    'VALIDATE_TRANSFER_BATCH',
    'TRANSFER_BATCH_TO_PAYROLL',
    'RECONCILE_TRANSFER_BATCH',
    'LOCK_TRANSFER_BATCH',
    'REVERSE_TRANSFER_BATCH'
  ]) {
    assert.ok(serviceSource.includes(`${name}(`), name);
  }
});

test('create vs reopen response classification uses prior REVERSED status only', () => {
  assert.ok(controllerSource.includes('Transfer batch reopened.'));
  assert.ok(controllerSource.includes('Transfer batch ready.'));
  assert.ok(controllerSource.includes('wasReversedBatchReopened'));
});
