/**
 * Transfer lifecycle response contract: summary + persisted Oracle batch/lines.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  preferPackageMessage,
  previewSuccessMessage,
  previewSummary,
  transferSuccessMessage,
  transferSummary,
  validateSuccessMessage,
  validateSummary,
  wasReversedBatchReopened
} from '../time_management/tmPayroll.lifecycle.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVICE_PATH = path.resolve(__dirname, '../time_management/tmPayroll.service.js');
const CONTROLLER_PATH = path.resolve(__dirname, '../time_management/tmPayroll.controller.js');
const LIFECYCLE_PATH = path.resolve(__dirname, '../time_management/tmPayroll.lifecycle.js');
const serviceSource = fs.readFileSync(SERVICE_PATH, 'utf8');
const controllerSource = fs.readFileSync(CONTROLLER_PATH, 'utf8');
const lifecycleSource = fs.readFileSync(LIFECYCLE_PATH, 'utf8');

test('service exposes getTransferBatchOperationSnapshot for post-package reads', () => {
  assert.ok(serviceSource.includes('export async function getTransferBatchOperationSnapshot'));
  assert.ok(serviceSource.includes('getTransferBatchById'));
  assert.ok(serviceSource.includes('listTransferLines'));
});

test('lifecycle helpers live in tmPayroll.lifecycle.js and are used by controller', () => {
  assert.ok(lifecycleSource.includes('export async function buildTransferLifecycleOutcome'));
  assert.ok(lifecycleSource.includes('export async function runTransferBatchLifecycle'));
  assert.ok(controllerSource.includes("from './tmPayroll.lifecycle.js'"));
  assert.ok(controllerSource.includes('runTransferBatchLifecycle(req, res'));
  for (const handler of [
    'previewTransferBatchHandler',
    'validateTransferBatchHandler',
    'transferBatchHandler',
    'reconcileTransferBatchHandler',
    'lockTransferBatchHandler',
    'reverseTransferBatchHandler'
  ]) {
    assert.ok(controllerSource.includes(`export async function ${handler}`), handler);
  }
});

test('preferPackageMessage keeps Oracle messages and replaces generic executor text', () => {
  assert.equal(
    preferPackageMessage('Transfer preview completed.', 'fallback'),
    'Transfer preview completed.'
  );
  assert.equal(preferPackageMessage('Operation completed successfully.', 'fallback'), 'fallback');
  assert.equal(preferPackageMessage(null, 'fallback'), 'fallback');
});

test('summary + success message helpers match acceptance wording', () => {
  const previewOutcome = {
    message: 'Operation completed successfully.',
    data: { total_source_records: 1, total_transfer_lines: 1 }
  };
  assert.deepEqual(previewSummary(previewOutcome), { source_records: 1, transfer_lines: 1 });
  assert.equal(
    previewSuccessMessage(previewOutcome),
    'Transfer preview completed. Source records=1, transfer lines=1.'
  );

  const validateOutcome = {
    message: 'Operation completed successfully.',
    data: { validated_transfer_lines: 1, error_transfer_lines: 0 }
  };
  assert.deepEqual(validateSummary(validateOutcome), { passed: 1, failed: 0 });
  assert.equal(
    validateSuccessMessage(validateOutcome),
    'Transfer validation completed. Passed=1, Failed=0.'
  );

  const transferOutcome = {
    message: 'Operation completed successfully.',
    data: { transferred_transfer_lines: 1, error_transfer_lines: 0 }
  };
  assert.deepEqual(transferSummary(transferOutcome), { transferred: 1, failed: 0 });
  assert.equal(
    transferSuccessMessage(transferOutcome),
    'Payroll transfer completed. Transferred=1, Failed=0.'
  );
});

test('wasReversedBatchReopened detects same-ID REVERSED → reopen only', () => {
  assert.equal(
    wasReversedBatchReopened(
      { payroll_transfer_batch_id: 23, status_code: 'REVERSED' },
      { payroll_transfer_batch_id: 23 }
    ),
    true
  );
  assert.equal(
    wasReversedBatchReopened(
      { payroll_transfer_batch_id: 23, status_code: 'DRAFT' },
      { payroll_transfer_batch_id: 23 }
    ),
    false
  );
  assert.equal(wasReversedBatchReopened(null, { payroll_transfer_batch_id: 23 }), false);
});

test('API does not calculate OT hours/multiplier/hourly rate in transfer lifecycle', () => {
  assert.ok(!lifecycleSource.includes('ot_multiplier'));
  assert.ok(!lifecycleSource.includes('weekly_hours'));
  assert.ok(!lifecycleSource.includes('173.333'));
  assert.ok(!lifecycleSource.includes('2200 /'));
  assert.ok(lifecycleSource.includes('getTransferBatchOperationSnapshot'));
});

test('package failures remain success=false (failureHttpStatus 422 path)', () => {
  assert.ok(lifecycleSource.includes('failureHttpStatus = 422'));
  assert.ok(lifecycleSource.includes("failOutcome(outcome.message || 'Transfer operation failed.'"));
});

test('CREATE_TRANSFER_BATCH and CREATE_OR_UPDATE_SOURCE_MAPPING remain canonical', () => {
  assert.ok(serviceSource.includes('CREATE_TRANSFER_BATCH('));
  assert.ok(serviceSource.includes('CREATE_OR_UPDATE_SOURCE_MAPPING('));
  assert.ok(serviceSource.includes('PREVIEW_TRANSFER_BATCH('));
  assert.ok(serviceSource.includes('VALIDATE_TRANSFER_BATCH('));
  assert.ok(serviceSource.includes('TRANSFER_BATCH_TO_PAYROLL('));
  assert.ok(serviceSource.includes('isOvertimeRequestSource'));
});
