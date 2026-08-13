/**
 * TM → Payroll PL/SQL binding contract tests.
 * Verifies REST service code calls the canonical Oracle package procedures
 * (no live Oracle required).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVICE_PATH = path.resolve(__dirname, '../time_management/tmPayroll.service.js');
const CONTROLLER_PATH = path.resolve(__dirname, '../time_management/tmPayroll.controller.js');

const serviceSource = fs.readFileSync(SERVICE_PATH, 'utf8');
const controllerSource = fs.readFileSync(CONTROLLER_PATH, 'utf8');

function assertIncludes(haystack, needle, label) {
  assert.ok(haystack.includes(needle), `${label}: expected to find ${needle}`);
}

function assertNotIncludes(haystack, needle, label) {
  assert.ok(!haystack.includes(needle), `${label}: must not invoke ${needle}`);
}

test('source mapping never defaults hourly_rate_divisor to 1', () => {
  assertNotIncludes(serviceSource, 'hourlyRateDivisor ?? 1', 'forced divisor default');
});

test('source mapping create/update calls CREATE_OR_UPDATE_SOURCE_MAPPING', () => {
  assertIncludes(
    serviceSource,
    'CREATE_OR_UPDATE_SOURCE_MAPPING',
    'source mapping procedure'
  );
  // Match PL/SQL call sites only (comments may mention the forbidden name).
  const upsertCalls = serviceSource.match(/\.\s*CREATE_OR_UPSERT_SOURCE_MAPPING/g) || [];
  assert.deepEqual(upsertCalls, [], `stale source mapping upsert alias: ${upsertCalls.join(', ')}`);
});

test('hourly rate policy create/update calls CREATE_OR_UPDATE_HOURLY_RATE_POLICY', () => {
  assertIncludes(
    serviceSource,
    'CREATE_OR_UPDATE_HOURLY_RATE_POLICY',
    'hourly rate policy procedure'
  );
  assertNotIncludes(
    serviceSource,
    'CREATE_OR_UPSERT_HOURLY_RATE_POLICY',
    'stale hourly rate policy upsert'
  );
});

test('transfer lifecycle procedures use canonical Oracle names', () => {
  const required = [
    'CREATE_TRANSFER_BATCH',
    'PREVIEW_TRANSFER_BATCH',
    'VALIDATE_TRANSFER_BATCH',
    'TRANSFER_BATCH_TO_PAYROLL',
    'RECONCILE_TRANSFER_BATCH',
    'LOCK_TRANSFER_BATCH',
    'RETRY_TRANSFER_LINE',
    'REVERSE_TRANSFER_LINE',
    'REVERSE_TRANSFER_BATCH'
  ];
  for (const name of required) {
    assertIncludes(serviceSource, `${name}(`, `transfer lifecycle ${name}`);
  }
});

test('hourly-rate policy/production procedures use canonical Oracle names', () => {
  const required = [
    'VALIDATE_HOURLY_RATE_POLICY',
    'PREVIEW_EMPLOYEE_HOURLY_RATE',
    'APPLY_POLICY_TO_SOURCE_MAPPING',
    'VALIDATE_PRODUCTION_READINESS',
    'ACTIVATE_PRODUCTION_HOURLY_RATE_MAPPING',
    'DEACTIVATE_PRODUCTION_HOURLY_RATE_MAPPING'
  ];
  for (const name of required) {
    assertIncludes(serviceSource, `${name}(`, `hourly-rate ${name}`);
  }
});

test('source mapping binds Oracle P_MULTIPLIER_INPUT_NAME (not VALUE_NAME)', () => {
  assertIncludes(serviceSource, 'P_MULTIPLIER_INPUT_NAME', 'oracle multiplier param');
  assertIncludes(serviceSource, 'P_RATE_TYPE_INPUT_NAME', 'oracle rate type param');
  assertIncludes(serviceSource, 'P_SOURCE_DATE_INPUT_NAME', 'oracle source date param');
  assertIncludes(serviceSource, 'P_HOURLY_RATE_INPUT_VALUE_NAME', 'oracle hourly rate input param');
});

test('controller accepts REST *_input_value_name aliases for Oracle *_INPUT_NAME params', () => {
  assertIncludes(controllerSource, 'multiplier_input_value_name', 'JSON multiplier alias');
  assertIncludes(controllerSource, 'rate_type_input_value_name', 'JSON rate type alias');
  assertIncludes(controllerSource, 'source_date_input_value_name', 'JSON source date alias');
});

test('regression: service does not invoke CREATE_OR_UPSERT_* procedures', () => {
  // Match only PL/SQL call sites (PKG.CREATE_OR_UPSERT_...), not prose.
  const upsertCalls = serviceSource.match(/\.\s*CREATE_OR_UPSERT_[A-Z0-9_]+/g) || [];
  assert.deepEqual(upsertCalls, [], `unexpected UPSERT call sites: ${upsertCalls.join(', ')}`);
  assertNotIncludes(
    serviceSource,
    'CREATE_OR_UPSERT_HOURLY_RATE_POLICY',
    'stale hourly rate policy upsert'
  );
});

test('service export names match CREATE_OR_UPDATE semantics', () => {
  assertIncludes(serviceSource, 'createOrUpdateHourlyRatePolicy', 'policy save export');
  assertIncludes(serviceSource, 'createOrUpdateSourceMapping', 'mapping save export');
  assertNotIncludes(serviceSource, 'function upsertHourlyRatePolicy', 'stale upsert policy export');
  assertNotIncludes(serviceSource, 'function upsertSourceMapping', 'stale upsert mapping export');
});

test('packages referenced by REST layer match Oracle owners', () => {
  assertIncludes(serviceSource, 'TM.TM_PAYROLL_HOURLY_RATE_POLICY_PKG', 'policy package');
  assertIncludes(serviceSource, 'TM.TM_PAYROLL_HOURLY_RATE_PRODUCTION_PKG', 'production package');
  assertIncludes(serviceSource, 'TM.TM_PAYROLL_TRANSFER_PROCESSING_PKG', 'transfer package');
});
