/**
 * Unit tests for Payroll Person Result Dashboard mapping and validation.
 * No live Oracle required.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { MESSAGES } from '../constants.js';
import {
  validateGetPersonResultDashboard,
  validateListPersonResultDashboards
} from '../middleware/payPersonResultsValidation.js';
import {
  formatProcessingSeconds,
  mapPersonResultDashboardRow,
  parseOracleJson
} from '../utils/payPersonResultDashboardMappers.js';

function mockReq({ params = {}, query = {}, enterpriseId = 1 } = {}) {
  return {
    params,
    query,
    user: { enterprise_id: enterpriseId, user_id: 10, username: 'tester' }
  };
}

function runMiddleware(fn, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        resolve({ req, res });
        return this;
      }
    };
    fn(req, res, () => resolve({ req, res }));
  });
}

const DASHBOARD_ROW = {
  ENTERPRISE_ID: 1,
  EMPLOYEE_ID: 293,
  EMPLOYEE_GUID: '4cbd406524718fd1e0633519000ae4ea',
  ASSIGNMENT_ID: 360,
  ASSIGNMENT_GUID: '4d36c822123e1881e0633519000a3ce6',
  EMPLOYEE_NAME: 'John Robert Smith',
  PERSON_NUMBER: 'EMP-293',
  ASSIGNMENT_NUMBER: 'EMP-293',
  BUSINESS_TITLE: 'TECH-SWE-042',
  ASSIGNMENT_STATUS: 'ACTIVE',
  EMPLOYMENT_STATUS: 'PROBATION',
  WORKER_TYPE: 'PERMANENT',
  WORK_EMAIL: 'john.smith@digifyhr.com',
  WORK_PHONE: '+96522222222',
  MOBILE_NUMBER: '+96555555555',
  RUN_ID: 242,
  RUN_GUID: '592f8a8b7a0fd36ae0631718000ad9f0',
  REL_ACTION_OBJ: JSON.stringify({
    rel_action_id: 178,
    run_id: 242,
    employee_id: 293,
    payroll_id: 15,
    status_code: 'COMPLETED'
  }),
  PAYROLL_DEFINITION_OBJ: {
    payroll_definition_id: 15,
    payroll_code: 'KW_MONTHLY',
    payroll_name: 'Kuwait Monthly Payroll'
  },
  RUN_NUMBER: 'Pakistan Monthly Payroll 26',
  RUN_TYPE_CODE: 'REGULAR',
  RUN_STATUS_CODE: 'COMPLETED',
  EMPLOYEE_ACTION_STATUS_CODE: 'COMPLETED',
  PERIOD_START_DATE: '2026-01-01',
  PERIOD_END_DATE: '4712-12-31',
  PAYROLL_PERIOD: 'December 4712',
  PAYMENT_DATE: '2026-08-31',
  PERIOD_WARNING_FLAG: 'Y',
  PAYROLL_TIMELINE_OBJ: JSON.stringify({
    payroll_submitted: { label: 'Payroll Submitted', status: 'Complete' }
  }),
  RATE_DETAILS_OBJ: JSON.stringify([
    {
      element_result_id: 246,
      element_code: 'OVERTIME',
      amount: 31.731,
      rate: 12.692308,
      hours: 2,
      multiplier: 1.25
    }
  ]),
  EARNINGS_BREAKDOWN_OBJ: JSON.stringify([
    { element_code: 'OVERTIME', element_name: 'Overtime', amount: 31.731, currency_code: 'USD' }
  ]),
  EXECUTION_METRICS_OBJ: JSON.stringify({
    processing_seconds: 263,
    elements_processed: 18,
    calculation_rules: 46,
    errors_warnings: 0
  }),
  PAYROLL_DISTRIBUTION_OBJ: JSON.stringify({
    gross_pay: 2347.596,
    deductions: 0,
    net_pay: 2347.596,
    employer_cost: 200,
    currency_code: 'USD'
  }),
  GROSS_PAY: 2347.596,
  DEDUCTIONS: 0,
  NET_PAY: 2347.596,
  EMPLOYER_COST: 200,
  DISTRIBUTION_CURRENCY_CODE: 'USD',
  RESULT_COUNT: 5,
  CALCULATED_RESULT_TOTAL: 2547.596,
  AMOUNT: 2347.596,
  CURRENCY_CODE: 'USD',
  STATUS: 'Complete',
  PROCESS_DATE: '2026-08-16T18:52:26',
  CAN_VIEW_RESULTS: 'Y',
  ACTION_RUN_ID: 242,
  ACTION_REL_ACTION_ID: 178,
  ACTION_PAYROLL_DEFINITION_ID: 15,
  ACTION_EMPLOYEE_ID: 293
};

test('dashboard validation requires positive employeeId, runId, and enterprise_id', async () => {
  const badEmp = await runMiddleware(
    validateGetPersonResultDashboard,
    mockReq({ params: { employeeId: 'abc', runId: '242' }, query: { enterprise_id: '1' } })
  );
  assert.equal(badEmp.res.statusCode, 400);

  const badRun = await runMiddleware(
    validateGetPersonResultDashboard,
    mockReq({ params: { employeeId: '293', runId: '0' }, query: { enterprise_id: '1' } })
  );
  assert.equal(badRun.res.statusCode, 400);

  const { req } = await runMiddleware(
    validateGetPersonResultDashboard,
    mockReq({ params: { employeeId: '293', runId: '242' }, query: { enterprise_id: '1' } })
  );
  assert.equal(req.validated.employee_id, 293);
  assert.equal(req.validated.run_id, 242);
  assert.equal(req.validated.enterprise_id, 1);
});

test('dashboard history validation defaults page and page_size', async () => {
  const { req } = await runMiddleware(
    validateListPersonResultDashboards,
    mockReq({ params: { employeeId: '293' }, query: { enterprise_id: '1' } })
  );
  assert.equal(req.validated.employee_id, 293);
  assert.equal(req.validated.page, 1);
  assert.equal(req.validated.pageSize, 25);
});

test('parseOracleJson uses fallback and does not double-parse objects', async () => {
  const obj = { payroll_name: 'Kuwait Monthly Payroll' };
  assert.deepEqual(await parseOracleJson(JSON.stringify(obj), {}), obj);
  assert.equal(await parseOracleJson(obj, {}), obj);
  assert.deepEqual(await parseOracleJson(null, []), []);
  assert.deepEqual(await parseOracleJson('not-json', { ok: true }), { ok: true });
});

test('formatProcessingSeconds formats 263 as 4m 23s', () => {
  assert.equal(formatProcessingSeconds(263), '4m 23s');
  assert.equal(formatProcessingSeconds(0), '0s');
  assert.equal(formatProcessingSeconds(60), '1m');
});

test('mapPersonResultDashboardRow nests Oracle row and parses JSON objects', async () => {
  const data = await mapPersonResultDashboardRow(DASHBOARD_ROW);

  assert.equal(data.person.employee_name, 'John Robert Smith');
  assert.equal(data.person.person_number, 'EMP-293');
  assert.equal(data.person.mobile_number, '+96555555555');
  assert.equal(data.run.run_id, 242);
  assert.equal(data.run.run_status_code, 'COMPLETED');
  assert.equal(data.run.employee_action_status_code, 'COMPLETED');
  assert.equal(data.run.status, 'Complete');

  assert.equal(typeof data.relation_action, 'object');
  assert.equal(data.relation_action.rel_action_id, 178);
  assert.equal(data.payroll_definition.payroll_name, 'Kuwait Monthly Payroll');
  assert.equal(typeof data.timeline, 'object');
  assert.equal(Array.isArray(data.rate_details), true);
  assert.equal(data.rate_details[0].element_code, 'OVERTIME');
  assert.equal(Array.isArray(data.earnings_breakdown), true);

  assert.equal(data.distribution.gross_pay, 2347.596);
  assert.equal(data.distribution.net_pay, 2347.596);
  assert.equal(data.distribution.employer_cost, 200);
  assert.equal(data.distribution.currency_code, 'USD');
  assert.equal(data.calculation.result_count, 5);
  assert.equal(data.calculation.calculated_result_total, 2547.596);

  assert.equal(data.period.period_end_date, '4712-12-31');
  assert.equal(data.period.warning, true);
  assert.equal(data.period.payroll_period, 'December 4712');

  assert.equal(data.execution_metrics.processing_seconds, 263);
  assert.equal(data.execution_metrics.processing_time_display, '4m 23s');

  assert.equal(data.actions.can_view_results, true);
  assert.equal(data.actions.run_id, 242);
  assert.equal(data.actions.rel_action_id, 178);

  assert.equal(data.rel_action_obj, undefined);
  assert.equal(data.payroll_definition_obj, undefined);
  assert.equal(data.rate_details_obj, undefined);
});

test('dashboard messages match payroll conventions', () => {
  assert.equal(MESSAGES.DASHBOARD_GET, 'Payroll person result dashboard retrieved successfully.');
  assert.equal(MESSAGES.DASHBOARD_NOT_FOUND, 'Payroll person result dashboard not found.');
});
