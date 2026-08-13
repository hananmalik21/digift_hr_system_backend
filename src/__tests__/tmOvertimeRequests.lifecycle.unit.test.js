/**
 * OT request approval lifecycle + TM→PAY eligibility ownership contract.
 * Oracle owns eligibility (STATUS = 'APPROVED'); REST must not add HR/manager gates.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OT_REQUEST_CREATE_STATUSES,
  OT_REQUEST_LEGACY_STATUSES,
  OT_REQUEST_LIST_FILTER_STATUSES,
  OT_REQUEST_STATUSES,
} from '../constants/tmOvertimeRequestStatuses.js';
import { listQuerySchema } from '../validators/tmOvertimeRequests.schemas.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVICE_PATH = path.resolve(__dirname, '../services/tmOvertimeRequests.service.js');
const CONTROLLER_PATH = path.resolve(__dirname, '../controllers/tmOvertimeRequests.controller.js');
const PAY_SERVICE_PATH = path.resolve(
  __dirname,
  '../../feature/payroll/time_management/tmPayroll.service.js'
);
const PAY_LIFECYCLE_PATH = path.resolve(
  __dirname,
  '../../feature/payroll/time_management/tmPayroll.lifecycle.js'
);

const otServiceSource = fs.readFileSync(SERVICE_PATH, 'utf8');
const otControllerSource = fs.readFileSync(CONTROLLER_PATH, 'utf8');
const payServiceSource = fs.readFileSync(PAY_SERVICE_PATH, 'utf8');
const payLifecycleSource = fs.readFileSync(PAY_LIFECYCLE_PATH, 'utf8');

test('normal OT statuses are DRAFT → SUBMITTED → APPROVED (+ reject/withdraw)', () => {
  assert.deepEqual([...OT_REQUEST_STATUSES], [
    'DRAFT',
    'SUBMITTED',
    'APPROVED',
    'REJECTED',
    'WITHDRAWN',
  ]);
  assert.deepEqual([...OT_REQUEST_CREATE_STATUSES], ['DRAFT', 'SUBMITTED']);
  assert.ok(OT_REQUEST_LEGACY_STATUSES.includes('MANAGER_APPROVED'));
  assert.ok(OT_REQUEST_LIST_FILTER_STATUSES.includes('APPROVED'));
  assert.ok(OT_REQUEST_LIST_FILTER_STATUSES.includes('MANAGER_APPROVED'));
});

test('list filter accepts APPROVED and legacy MANAGER_APPROVED', () => {
  const approved = listQuerySchema.safeParse({ tenant_id: 1, status: 'APPROVED' });
  assert.equal(approved.success, true);
  const legacy = listQuerySchema.safeParse({ tenant_id: 1, status: 'MANAGER_APPROVED' });
  assert.equal(legacy.success, true);
  const waiting = listQuerySchema.safeParse({ tenant_id: 1, status: 'WAITING_FOR_HR' });
  assert.equal(waiting.success, false);
});

test('submit/approve call TM.TM_OT_REQUESTS_PKG and re-read persisted row', () => {
  assert.ok(otServiceSource.includes('TM.TM_OT_REQUESTS_PKG.SUBMIT_REQUEST('));
  assert.ok(otServiceSource.includes('TM.TM_OT_REQUESTS_PKG.APPROVE_REQUEST('));
  assert.ok(otServiceSource.includes('getRequestByGuid(connection, tenantId, guidBuf)'));
  assert.ok(!otServiceSource.includes("status: 'MANAGER_APPROVED'"));
  assert.ok(!otServiceSource.includes("status = 'MANAGER_APPROVED'"));
});

test('API messages describe final APPROVED lifecycle (no waiting-for-HR wording)', () => {
  assert.ok(otControllerSource.includes('Overtime request submitted successfully.'));
  assert.ok(otControllerSource.includes('Overtime request approved successfully.'));
  assert.ok(!otControllerSource.includes('waiting for HR'));
  assert.ok(!otControllerSource.includes('WAITING_FOR_HR'));
  assert.ok(!otControllerSource.includes('HR_VALIDATE_REQUEST'));
});

test('TM→PAY preview/validate/transfer do not filter OT by HR or manager audit fields', () => {
  assert.ok(payServiceSource.includes('PREVIEW_TRANSFER_BATCH('));
  assert.ok(payServiceSource.includes('VALIDATE_TRANSFER_BATCH('));
  assert.ok(payServiceSource.includes('TRANSFER_BATCH_TO_PAYROLL('));
  assert.ok(!payServiceSource.includes('hr_validated'));
  assert.ok(!payServiceSource.includes('hrValidated'));
  assert.ok(!payServiceSource.includes('HR_VALIDATED'));
  assert.ok(!payServiceSource.includes('manager_approved'));
  assert.ok(!payServiceSource.includes('managerApproved'));
  assert.ok(!payServiceSource.includes('MANAGER_APPROVED'));
  assert.ok(!payLifecycleSource.includes('hr_validated'));
  assert.ok(!payLifecycleSource.includes('manager_approved'));
  assert.ok(!payLifecycleSource.includes('MANAGER_APPROVED'));
});
