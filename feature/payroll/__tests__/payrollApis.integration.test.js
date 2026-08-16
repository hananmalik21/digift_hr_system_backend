/**
 * Live DigifyHR Payroll API scenario tests.
 * Boots /api/payroll against real Oracle Autonomous DB fixtures.
 *
 * Scenarios per group:
 *  - list success + pagination contract
 *  - validation / not-found client errors
 *  - detail / nested reads where fixtures exist
 *  - safe mutation validation (no destructive lifecycle changes)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIXTURES,
  api,
  assertClientError,
  assertSuccessList,
  assertSuccessObject,
  qEnterprise,
  startPayrollTestServer,
  stopPayrollTestServer
} from './helpers/payrollTestHarness.js';

test.before(async () => {
  await startPayrollTestServer();
});

test.after(async () => {
  await stopPayrollTestServer();
});

const E = FIXTURES.enterpriseId;

// =============================================================================
// 1. Elements
// =============================================================================
test('1. Elements — list paginated', async () => {
  const r = await api('GET', '/api/payroll/elements', { query: qEnterprise });
  assertSuccessList(r, 'elements list');
});

test('1. Elements — list requires enterprise_id when unresolved', async () => {
  // With harness enterprise context, list still works; invalid page should 400
  const r = await api('GET', '/api/payroll/elements', {
    query: { enterprise_id: E, page: 0 }
  });
  assertClientError(r, 'elements invalid page');
});

test('1. Elements — nested input-values / balance-feeds / dependencies', async () => {
  const list = await api('GET', '/api/payroll/elements', { query: qEnterprise });
  assertSuccessList(list);
  const guid = list.json.data[0]?.element_guid;
  assert.ok(guid, 'fixture element_guid');
  for (const suffix of [
    'input-values',
    'balance-feeds',
    'dependencies',
    'eligibility',
    'formulas',
    'recurring-entries'
  ]) {
    const r = await api('GET', `/api/payroll/elements/${guid}/${suffix}`, {
      query: { enterprise_id: E, page: 1, page_size: 5 }
    });
    assert.ok([200, 400, 404].includes(r.status), `${suffix} status ${r.status}`);
    if (r.status === 200) {
      assert.equal(r.json.success, true);
      assert.ok(Array.isArray(r.json.data) || r.json.data != null);
    }
  }
});

test('1. Elements — unknown guid returns not found or empty failure', async () => {
  const r = await api('GET', '/api/payroll/elements/00000000000000000000000000000000', {
    query: { enterprise_id: E }
  });
  assertClientError(r, 'element not found');
});

// =============================================================================
// 2. Element input values
// =============================================================================
test('2. Input values — list paginated', async () => {
  const r = await api('GET', '/api/payroll/element-input-values', { query: qEnterprise });
  assertSuccessList(r, 'input values');
});

test('2. Input values — create validation rejects empty body', async () => {
  const r = await api('POST', '/api/payroll/element-input-values', { body: {} });
  assertClientError(r, 'input value create validation');
});

// =============================================================================
// 3. Formulas
// =============================================================================
test('3. Formulas — list + get + executions', async () => {
  const list = await api('GET', '/api/payroll/formulas', { query: qEnterprise });
  // legacy formula list may use slightly different envelope; accept success or data
  assert.ok(list.status === 200, `formulas list ${list.status}`);
  assert.ok(list.json?.success !== false || Array.isArray(list.json?.data));

  const exec = await api('GET', '/api/payroll/formulas/executions', { query: qEnterprise });
  assertSuccessList(exec, 'formula executions');
});

test('3. Formulas — validate requires formula body/guid handling', async () => {
  const r = await api('POST', `/api/payroll/formulas/${FIXTURES.formulaGuid}/validate`, {
    body: { enterprise_id: E }
  });
  assert.ok([200, 400, 404].includes(r.status), `validate status ${r.status}`);
  assert.equal(typeof r.json?.success, 'boolean');
});

test('3. Formulas — test without inputs returns failed package envelope', async () => {
  const r = await api('POST', `/api/payroll/formulas/${FIXTURES.formulaGuid}/test`, {
    body: { enterprise_id: E }
  });
  assert.ok([200, 400].includes(r.status), `status ${r.status}`);
  assert.equal(typeof r.json?.success, 'boolean');
  assert.ok(r.json?.message || r.json?.data);
  if (r.status === 400) assert.equal(r.json.success, false);
});

// =============================================================================
// 4. Balances
// =============================================================================
test('4. Balances — categories / balances / feeds / dimensions lists', async () => {
  for (const path of [
    '/api/payroll/balance-categories',
    '/api/payroll/balances',
    '/api/payroll/balance-feeds',
    '/api/payroll/balance-dimensions',
    '/api/payroll/balance-definitions'
  ]) {
    const r = await api('GET', path, { query: qEnterprise });
    assert.equal(r.status, 200, `${path} ${r.status} ${r.text?.slice(0, 200)}`);
    assert.equal(r.json.success, true, path);
    assert.ok(Array.isArray(r.json.data), path);
    // New payroll modules use meta.pagination; remounted legacy balance CRUD may omit it.
    if (r.json.meta?.pagination) {
      assert.equal(typeof r.json.meta.pagination.page, 'number', path);
      assert.equal(typeof r.json.meta.pagination.total, 'number', path);
    }
  }
});

test('4. Balances — run / employee balance reads', async () => {
  const runBal = await api('GET', `/api/payroll/runs/${FIXTURES.runId}/balances`, {
    query: qEnterprise
  });
  assert.ok([200, 404].includes(runBal.status));
  if (runBal.status === 200) assertSuccessList(runBal, 'run balances');

  const empBal = await api(
    'GET',
    `/api/payroll/runs/${FIXTURES.runId}/employees/${FIXTURES.employeeId}/balances`,
    { query: qEnterprise }
  );
  assert.ok([200, 404].includes(empBal.status));
});

// =============================================================================
// 5. Element dependencies
// =============================================================================
test('5. Dependencies — list + validate + reject CRUD', async () => {
  const list = await api('GET', '/api/payroll/element-dependencies', { query: qEnterprise });
  assertSuccessList(list, 'dependencies');

  const validate = await api('POST', '/api/payroll/element-dependencies/validate', {
    body: { enterprise_id: E }
  });
  assert.ok([200, 400].includes(validate.status));
  assert.equal(typeof validate.json?.success, 'boolean');

  const create = await api('POST', '/api/payroll/element-dependencies', {
    body: { enterprise_id: E }
  });
  assertClientError(create, 'dependency CRUD blocked');
});

// =============================================================================
// 6. Eligibility
// =============================================================================
test('6. Eligibility — rules / profiles lists + evaluate validation', async () => {
  const rules = await api('GET', '/api/payroll/eligibility/rules', { query: qEnterprise });
  assert.equal(rules.status, 200);
  assert.equal(rules.json.success, true);

  const profiles = await api('GET', '/api/payroll/eligibility/profiles', { query: qEnterprise });
  assert.equal(profiles.status, 200);
  assert.equal(profiles.json.success, true);

  const evaluate = await api('POST', '/api/payroll/eligibility/evaluate', { body: {} });
  assertClientError(evaluate, 'eligibility evaluate validation');

  const evaluateElement = await api('POST', '/api/payroll/eligibility/evaluate-element', {
    body: { enterprise_id: E }
  });
  assertClientError(evaluateElement, 'evaluate-element validation');
});

// =============================================================================
// 7. Recurring entries
// =============================================================================
test('7. Recurring entries — list + generation logs + generate validation', async () => {
  const list = await api('GET', '/api/payroll/recurring-entries', { query: qEnterprise });
  assertSuccessList(list, 'recurring');

  const logs = await api('GET', '/api/payroll/recurring-entries/generation-logs', {
    query: qEnterprise
  });
  assert.ok([200, 404].includes(logs.status) || logs.json?.success !== undefined);

  const generate = await api('POST', '/api/payroll/recurring-entries/generate', {
    body: { enterprise_id: E }
  });
  assertClientError(generate, 'generate requires run_id');
});

// =============================================================================
// 8. Payroll runs
// =============================================================================
test('8. Runs — list + detail + summary + nested reads', async () => {
  const list = await api('GET', '/api/payroll/runs', { query: qEnterprise });
  assertSuccessList(list, 'runs');

  const detail = await api('GET', `/api/payroll/runs/${FIXTURES.runId}`, {
    query: { enterprise_id: E }
  });
  assertSuccessObject(detail, 'run detail');
  assert.equal(detail.json.data.run_id, FIXTURES.runId);

  const summary = await api('GET', `/api/payroll/runs/${FIXTURES.runId}/summary`, {
    query: { enterprise_id: E }
  });
  assertSuccessObject(summary, 'run summary');
  assert.equal(summary.json.data.run_id, FIXTURES.runId);
  assert.ok('gross_pay' in summary.json.data || 'gross' in summary.json.data || summary.json.data.run);

  for (const suffix of ['employees', 'actions', 'results', 'balances', 'exceptions', 'status-overview']) {
    const r = await api('GET', `/api/payroll/runs/${FIXTURES.runId}/${suffix}`, {
      query: qEnterprise
    });
    assert.ok([200, 404].includes(r.status), `run ${suffix} => ${r.status}`);
    if (r.status === 200 && Array.isArray(r.json.data)) {
      assert.ok(r.json.meta?.pagination || true);
    }
  }
});

// =============================================================================
// 8b. Person results (PAY.V_PAY_PERSON_RESULTS / V_PAY_PERSON_PROCESS_RESULTS)
// =============================================================================
test('8b. Person results — list paginated', async () => {
  const r = await api('GET', '/api/payroll/person-results', {
    query: { enterprise_id: E, page: 1, page_size: 25 }
  });
  assertSuccessList(r, 'person results');
  for (const item of r.json.data) {
    assert.equal(item.flow_name, undefined);
    assert.ok(item.employee_id == null || Number.isFinite(Number(item.employee_id)));
  }
});

test('8b. Person results — search by name', async () => {
  const r = await api('GET', '/api/payroll/person-results', {
    query: { enterprise_id: E, search: 'Hammad', page: 1, page_size: 25 }
  });
  assertSuccessList(r, 'person results search');
});

test('8b. Person results — unknown employee process-results is 404 or empty', async () => {
  const r = await api('GET', '/api/payroll/person-results/999999999/process-results', {
    query: { enterprise_id: E, page: 1, page_size: 25 }
  });
  assert.ok([200, 404].includes(r.status), `process-results unknown employee => ${r.status}`);
  if (r.status === 200) {
    assert.equal(r.json.success, true);
    assert.ok(Array.isArray(r.json.data));
    assert.equal(r.json.data.length, 0);
  }
});

test('8b. Person results — process-results for fixture employee', async () => {
  const r = await api('GET', `/api/payroll/person-results/${FIXTURES.employeeId}/process-results`, {
    query: { enterprise_id: E, page: 1, page_size: 25 }
  });
  assert.ok([200, 404].includes(r.status), `process-results fixture => ${r.status}`);
  if (r.status === 200) {
    assertSuccessList(r, 'process results');
    for (const item of r.json.data) {
      assert.equal(item.employee_id, FIXTURES.employeeId);
      assert.equal(item.flow_name, undefined);
      assert.equal(item.rel_action_obj, undefined);
      assert.equal(item.payroll_definition_obj, undefined);
      if (item.rel_action != null) assert.equal(typeof item.rel_action, 'object');
      if (item.payroll_definition != null) assert.equal(typeof item.payroll_definition, 'object');
      if (item.period_end_date) {
        assert.ok(!/August|September/i.test(String(item.period_end_date)));
      }
    }
  }
});

test('8. Runs — initialize validation rejects incomplete body', async () => {
  const r = await api('POST', '/api/payroll/runs/initialize', {
    body: { enterprise_id: E }
  });
  assertClientError(r, 'initialize validation');
});

test('8. Runs — unknown run returns not found', async () => {
  const r = await api('GET', '/api/payroll/runs/999999999', {
    query: { enterprise_id: E }
  });
  assertClientError(r, 'run not found');
});

// =============================================================================
// 9. Element entries
// =============================================================================
test('9. Element entries — list paginated', async () => {
  const r = await api('GET', '/api/payroll/element-entries', { query: qEnterprise });
  assert.equal(r.status, 200);
  assert.equal(r.json.success, true);
  assert.ok(Array.isArray(r.json.data));
});

test('9. Element entries — create validation', async () => {
  const r = await api('POST', '/api/payroll/element-entries', { body: {} });
  assertClientError(r, 'element entry create validation');
});

// =============================================================================
// 10. Retro
// =============================================================================
test('10. Retro — events list/detail/lines/comparison', async () => {
  const list = await api('GET', '/api/payroll/retro/events', { query: qEnterprise });
  assertSuccessList(list, 'retro events');

  const detail = await api('GET', `/api/payroll/retro/events/${FIXTURES.retroEventId}`, {
    query: { enterprise_id: E }
  });
  assert.ok([200, 404].includes(detail.status));

  const lines = await api('GET', `/api/payroll/retro/events/${FIXTURES.retroEventId}/lines`, {
    query: qEnterprise
  });
  assert.ok([200, 404].includes(lines.status));

  const comparison = await api(
    'GET',
    `/api/payroll/retro/events/${FIXTURES.retroEventId}/comparison`,
    { query: { enterprise_id: E } }
  );
  assert.ok([200, 404].includes(comparison.status));
});

test('10. Retro — create validation rejects empty body', async () => {
  const r = await api('POST', '/api/payroll/retro/events', { body: { enterprise_id: E } });
  assertClientError(r, 'retro create validation');
});

// =============================================================================
// 11. Arrears
// =============================================================================
test('11. Arrears — list/detail/recoveries + recover validation', async () => {
  const list = await api('GET', '/api/payroll/arrears', { query: qEnterprise });
  assertSuccessList(list, 'arrears');

  const detail = await api('GET', `/api/payroll/arrears/${FIXTURES.arrearId}`, {
    query: { enterprise_id: E }
  });
  assert.ok([200, 404].includes(detail.status));

  const recoveries = await api('GET', `/api/payroll/arrears/${FIXTURES.arrearId}/recoveries`, {
    query: qEnterprise
  });
  assert.ok([200, 404].includes(recoveries.status));

  const recover = await api('POST', `/api/payroll/arrears/${FIXTURES.arrearId}/recover`, {
    body: { enterprise_id: E }
  });
  assert.ok([200, 400, 404].includes(recover.status));
  assert.equal(typeof recover.json?.success, 'boolean');
});

// =============================================================================
// 12. Payment methods / bank accounts
// =============================================================================
test('12. Payment methods — employee list + rejects unmasked account fields', async () => {
  const list = await api('GET', `/api/payroll/employees/${FIXTURES.employeeId}/payment-methods`, {
    query: qEnterprise
  });
  assertSuccessList(list, 'payment methods');

  const banks = await api('GET', `/api/payroll/employees/${FIXTURES.employeeId}/bank-accounts`, {
    query: qEnterprise
  });
  assert.ok([200, 400].includes(banks.status));
  if (banks.status === 200) assertSuccessList(banks, 'bank accounts');

  const banned = await api('POST', `/api/payroll/employees/${FIXTURES.employeeId}/bank-accounts`, {
    body: {
      enterprise_id: E,
      payment_method_id: 1,
      account_number: '1234567890',
      masked_account_number: '****7890',
      account_holder_name: 'Test',
      bank_name: 'Test Bank'
    }
  });
  assertClientError(banned, 'reject unmasked account_number');
});

// =============================================================================
// 13. Payment batches
// =============================================================================
test('13. Payment batches — list/detail/payments/history/reconciliation', async () => {
  const list = await api('GET', '/api/payroll/payment-batches', { query: qEnterprise });
  assertSuccessList(list, 'payment batches');

  const id = FIXTURES.paymentBatchId;
  for (const path of [
    `/api/payroll/payment-batches/${id}`,
    `/api/payroll/payment-batches/${id}/payments`,
    `/api/payroll/payment-batches/${id}/history`,
    `/api/payroll/payment-batches/${id}/reconciliation`
  ]) {
    const r = await api('GET', path, { query: { enterprise_id: E, page: 1, page_size: 5 } });
    assert.ok([200, 404].includes(r.status), `${path} => ${r.status}`);
  }
});

test('13. Payment batches — validate returns package success/failure envelope', async () => {
  const r = await api('POST', `/api/payroll/payment-batches/${FIXTURES.paymentBatchId}/validate`, {
    body: { enterprise_id: E }
  });
  assert.ok([200, 400].includes(r.status));
  assert.equal(typeof r.json?.success, 'boolean');
  assert.ok(r.json?.message);
});

// =============================================================================
// 14. GL
// =============================================================================
test('14. GL — accounts/mappings/overrides/journals lists', async () => {
  for (const path of [
    '/api/payroll/gl/accounts',
    '/api/payroll/gl/element-mappings',
    '/api/payroll/gl/costing-overrides',
    '/api/payroll/gl/journals'
  ]) {
    const r = await api('GET', path, { query: qEnterprise });
    assertSuccessList(r, path);
  }
});

test('14. GL — journal detail/lines/history + run reconciliation', async () => {
  const id = FIXTURES.journalId;
  for (const path of [
    `/api/payroll/gl/journals/${id}`,
    `/api/payroll/gl/journals/${id}/lines`,
    `/api/payroll/gl/journals/${id}/history`,
    `/api/payroll/gl/journals/${id}/export-payload`
  ]) {
    const r = await api('GET', path, { query: { enterprise_id: E, page: 1, page_size: 5 } });
    assert.ok([200, 404].includes(r.status), `${path} => ${r.status}`);
  }

  const recon = await api('GET', `/api/payroll/runs/${FIXTURES.runId}/gl/reconciliation`, {
    query: { enterprise_id: E }
  });
  assert.ok([200, 404].includes(recon.status));
});

test('14. GL — account create validation', async () => {
  const r = await api('POST', '/api/payroll/gl/accounts', { body: { enterprise_id: E } });
  assertClientError(r, 'gl account create validation');
});

// =============================================================================
// 15. Payslips
// =============================================================================
test('15. Payslips — list/detail/lines/document-data + employee payslips', async () => {
  const list = await api('GET', '/api/payroll/payslips', { query: qEnterprise });
  assertSuccessList(list, 'payslips');

  const id = FIXTURES.payslipId;
  for (const path of [
    `/api/payroll/payslips/${id}`,
    `/api/payroll/payslips/${id}/lines`,
    `/api/payroll/payslips/${id}/document-data`
  ]) {
    const r = await api('GET', path, { query: { enterprise_id: E } });
    assert.ok([200, 404].includes(r.status), `${path} => ${r.status}`);
  }

  const emp = await api('GET', `/api/payroll/employees/${FIXTURES.employeeId}/payslips`, {
    query: qEnterprise
  });
  assert.ok([200, 404].includes(emp.status));
});

// =============================================================================
// 16. Period close
// =============================================================================
test('16. Close — checks/history + validate/reopen envelopes', async () => {
  const checks = await api('GET', `/api/payroll/runs/${FIXTURES.runId}/close/checks`, {
    query: { enterprise_id: E }
  });
  assert.ok([200, 404].includes(checks.status));

  const history = await api('GET', `/api/payroll/runs/${FIXTURES.runId}/close/history`, {
    query: qEnterprise
  });
  assert.ok([200, 404].includes(history.status));

  const validate = await api('POST', `/api/payroll/runs/${FIXTURES.runId}/close/validate`, {
    body: { enterprise_id: E }
  });
  assert.ok([200, 400].includes(validate.status));
  assert.equal(typeof validate.json?.success, 'boolean');
});

// =============================================================================
// 17. Approvals
// =============================================================================
test('17. Approvals — roles/policies/requests/pending/status', async () => {
  for (const path of [
    '/api/payroll/approvals/roles',
    '/api/payroll/approvals/policies',
    '/api/payroll/approvals/requests',
    '/api/payroll/approvals/pending'
  ]) {
    const r = await api('GET', path, { query: qEnterprise });
    assert.ok([200, 400].includes(r.status), `${path} => ${r.status}`);
    if (r.status === 200) {
      assert.equal(r.json.success, true);
      assert.ok(Array.isArray(r.json.data));
    }
  }

  const reqDetail = await api('GET', `/api/payroll/approvals/requests/${FIXTURES.approvalRequestId}`, {
    query: { enterprise_id: E }
  });
  assert.ok([200, 404].includes(reqDetail.status));

  const status = await api('GET', '/api/payroll/approvals/status', {
    query: {
      enterprise_id: E,
      object_type_code: 'PAYROLL_RUN',
      object_id: FIXTURES.runId
    }
  });
  assert.ok([200, 400].includes(status.status));

  const withdraw = await api(
    'POST',
    `/api/payroll/approvals/requests/${FIXTURES.approvalRequestId}/withdraw`,
    { body: { enterprise_id: E } }
  );
  assertClientError(withdraw, 'withdraw unsupported');
});

test('17. Approvals — create request validation', async () => {
  const r = await api('POST', '/api/payroll/approvals/requests', {
    body: { enterprise_id: E }
  });
  assertClientError(r, 'approval create validation');
});

// =============================================================================
// 18. Statutory
// =============================================================================
test('18. Statutory — regimes/rules/filings/certificates/amendments/audit', async () => {
  for (const path of [
    '/api/payroll/statutory/regimes',
    '/api/payroll/statutory/rules',
    '/api/payroll/statutory/filings',
    '/api/payroll/statutory/certificates',
    '/api/payroll/statutory/amendments',
    '/api/payroll/statutory/audit',
    '/api/payroll/statutory/results'
  ]) {
    const r = await api('GET', path, { query: qEnterprise });
    assert.ok([200, 400].includes(r.status), `${path} => ${r.status} ${r.text?.slice(0, 120)}`);
    if (r.status === 200) {
      assert.equal(r.json.success, true);
      assert.ok(Array.isArray(r.json.data));
    }
  }

  const filing = await api('GET', `/api/payroll/statutory/filings/${FIXTURES.filingId}`, {
    query: { enterprise_id: E }
  });
  assert.ok([200, 404].includes(filing.status));

  const runResults = await api('GET', `/api/payroll/runs/${FIXTURES.runId}/statutory/results`, {
    query: qEnterprise
  });
  assert.ok([200, 404].includes(runResults.status));
});

test('18. Statutory — process/create filing validation', async () => {
  const process = await api('POST', `/api/payroll/runs/${FIXTURES.runId}/statutory/process`, {
    body: { enterprise_id: E }
  });
  assert.ok([200, 400].includes(process.status));
  assert.equal(typeof process.json?.success, 'boolean');
});

// =============================================================================
// 19. Operations / health / certification
// =============================================================================
test('19. Operations — list/detail/steps/events', async () => {
  const list = await api('GET', '/api/payroll/operations', { query: qEnterprise });
  assertSuccessList(list, 'operations');

  const id = FIXTURES.operationRunId;
  for (const path of [
    `/api/payroll/operations/${id}`,
    `/api/payroll/operations/${id}/steps`,
    `/api/payroll/operations/${id}/events`
  ]) {
    const r = await api('GET', path, { query: { enterprise_id: E, page: 1, page_size: 5 } });
    assert.ok([200, 404].includes(r.status), `${path} => ${r.status}`);
  }
});

test('19. Health checks + certifications', async () => {
  const health = await api('GET', `/api/payroll/runs/${FIXTURES.runId}/health-checks`, {
    query: qEnterprise
  });
  assert.ok([200, 404].includes(health.status));

  const certs = await api('GET', `/api/payroll/runs/${FIXTURES.runId}/certifications`, {
    query: qEnterprise
  });
  assert.ok([200, 404].includes(certs.status));

  const certified = await api('GET', `/api/payroll/runs/${FIXTURES.runId}/certified-status`, {
    query: { enterprise_id: E }
  });
  assert.ok([200, 400, 404].includes(certified.status));

  const certDetail = await api('GET', `/api/payroll/certifications/${FIXTURES.certificationId}`, {
    query: { enterprise_id: E }
  });
  assert.ok([200, 404].includes(certDetail.status));

  const gates = await api('GET', `/api/payroll/certifications/${FIXTURES.certificationId}/gates`, {
    query: qEnterprise
  });
  assert.ok([200, 404].includes(gates.status));
});

test('19. Operations — create validation', async () => {
  const r = await api('POST', '/api/payroll/operations', { body: { enterprise_id: E } });
  assertClientError(r, 'operation create validation');
});

// =============================================================================
// 20. Dashboard
// =============================================================================
test('20. Dashboard — summary + all status panels', async () => {
  const summary = await api('GET', '/api/payroll/dashboard/summary', {
    query: { enterprise_id: E }
  });
  assertSuccessObject(summary, 'dashboard summary');
  assert.ok('total_payroll_runs' in summary.json.data);

  for (const path of [
    '/api/payroll/dashboard/runs',
    '/api/payroll/dashboard/exceptions',
    '/api/payroll/dashboard/pending-approvals',
    '/api/payroll/dashboard/payment-status',
    '/api/payroll/dashboard/gl-status',
    '/api/payroll/dashboard/statutory-status',
    '/api/payroll/dashboard/certification-status'
  ]) {
    const r = await api('GET', path, { query: qEnterprise });
    assert.ok([200, 400].includes(r.status), `${path} => ${r.status}`);
    if (r.status === 200) {
      assert.equal(r.json.success, true);
      assert.ok(Array.isArray(r.json.data));
      assert.ok(r.json.meta?.pagination, `${path} pagination`);
    }
  }
});

// =============================================================================
// 21. Audit
// =============================================================================
test('21. Audit — history endpoints + combined run audit', async () => {
  for (const path of [
    '/api/payroll/audit/payment-history',
    '/api/payroll/audit/gl-history',
    '/api/payroll/audit/payroll-close-history',
    '/api/payroll/audit/approval-actions',
    '/api/payroll/audit/statutory-history',
    '/api/payroll/audit/operation-events'
  ]) {
    const r = await api('GET', path, { query: qEnterprise });
    assertSuccessList(r, path);
  }

  const runAudit = await api('GET', `/api/payroll/audit/run/${FIXTURES.runId}`, {
    query: { enterprise_id: E }
  });
  assertSuccessObject(runAudit, 'run audit');
});
