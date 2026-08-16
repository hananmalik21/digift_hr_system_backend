/**
 * Unit tests for Payroll Person Results APIs.
 * No live Oracle required.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { MESSAGES, PERSON_SEARCH_COLUMNS } from '../constants.js';
import {
  validateListPersonProcessResults,
  validateListPersonProcessRunResults,
  validateListPersonResults
} from '../middleware/payPersonResultsValidation.js';
import {
  hasOracleSentinelYear,
  mapPersonProcessResultRow,
  mapPersonResultRow,
  parseOracleJsonField
} from '../utils/payPersonResultsMappers.js';

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

test('search columns cover name, person number, assignment, title, and email', () => {
  assert.deepEqual(PERSON_SEARCH_COLUMNS, [
    'v.EMPLOYEE_NAME',
    'v.PERSON_NUMBER',
    'v.ASSIGNMENT_NUMBER',
    'v.BUSINESS_TITLE',
    'v.WORK_EMAIL'
  ]);
});

test('list person results defaults page=1, page_size=25, include_terminated=N', async () => {
  const { req, res } = await runMiddleware(
    validateListPersonResults,
    mockReq({ query: { enterprise_id: '1' } })
  );
  assert.equal(res.body, null);
  assert.equal(req.validated.page, 1);
  assert.equal(req.validated.pageSize, 25);
  assert.equal(req.validated.include_terminated_work_relationships, 'N');
  assert.equal(req.validated.search, null);
  assert.equal(req.validated.effective_as_of_date, null);
});

test('list person results caps page_size at 100 and binds search/filters', async () => {
  const { req } = await runMiddleware(
    validateListPersonResults,
    mockReq({
      query: {
        enterprise_id: '1',
        search: 'Hammad',
        business_title: 'SENIOR SALES EXECUTIVE',
        assignment_status: 'ACTIVE',
        employment_status: 'ACTIVE',
        worker_type: 'EMPLOYEE',
        effective_as_of_date: '2026-08-16',
        include_terminated_work_relationships: 'Y',
        page: '2',
        page_size: '500'
      }
    })
  );
  assert.equal(req.validated.search, 'Hammad');
  assert.equal(req.validated.business_title, 'SENIOR SALES EXECUTIVE');
  assert.equal(req.validated.assignment_status, 'ACTIVE');
  assert.equal(req.validated.worker_type, 'EMPLOYEE');
  assert.equal(req.validated.include_terminated_work_relationships, 'Y');
  assert.equal(req.validated.page, 2);
  assert.equal(req.validated.pageSize, 100);
  assert.ok(req.validated.effective_as_of_date instanceof Date);
});

test('list person results rejects invalid include_terminated flag', async () => {
  const { res } = await runMiddleware(
    validateListPersonResults,
    mockReq({ query: { enterprise_id: '1', include_terminated_work_relationships: 'YES' } })
  );
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
});

test('list person results rejects mismatched enterprise_id', async () => {
  const { res } = await runMiddleware(
    validateListPersonResults,
    mockReq({ query: { enterprise_id: '99' }, enterpriseId: 1 })
  );
  assert.ok([400, 403].includes(res.statusCode));
  assert.equal(res.body.success, false);
});

test('process results require a positive employeeId', async () => {
  const { res } = await runMiddleware(
    validateListPersonProcessResults,
    mockReq({ params: { employeeId: 'abc' }, query: { enterprise_id: '1' } })
  );
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
});

test('process results parse optional payroll/run/status/period filters', async () => {
  const { req } = await runMiddleware(
    validateListPersonProcessResults,
    mockReq({
      params: { employeeId: '293' },
      query: {
        enterprise_id: '1',
        payroll_id: '15',
        run_id: '238',
        status: 'Complete',
        period_start_date: '2026-08-01',
        period_end_date: '2026-08-31',
        page: '1',
        page_size: '25'
      }
    })
  );
  assert.equal(req.validated.employee_id, 293);
  assert.equal(req.validated.payroll_id, 15);
  assert.equal(req.validated.run_id, 238);
  assert.equal(req.validated.status, 'Complete');
  assert.equal(req.validated.pageSize, 25);
});

test('calculation results require employeeId and runId', async () => {
  const { req } = await runMiddleware(
    validateListPersonProcessRunResults,
    mockReq({
      params: { employeeId: '293', runId: '238' },
      query: { enterprise_id: '1' }
    })
  );
  assert.equal(req.validated.employee_id, 293);
  assert.equal(req.validated.run_id, 238);
  assert.equal(req.validated.page, 1);
  assert.equal(req.validated.pageSize, 25);
});

test('parseOracleJsonField parses CLOB/string JSON once and skips objects', async () => {
  const obj = { rel_action_id: 174, run_id: 238, employee_id: 293 };
  assert.deepEqual(await parseOracleJsonField(JSON.stringify(obj)), obj);
  assert.equal(await parseOracleJsonField(obj), obj);

  const clob = { getData: async () => '{"payroll_code":"KW_MONTHLY"}' };
  assert.deepEqual(await parseOracleJsonField(clob), { payroll_code: 'KW_MONTHLY' });
  assert.equal(await parseOracleJsonField(null), null);
});

test('hasOracleSentinelYear detects 4712 without rewriting dates', () => {
  assert.equal(hasOracleSentinelYear('4712-12-31'), true);
  assert.equal(hasOracleSentinelYear(new Date(4712, 11, 31)), true);
  assert.equal(hasOracleSentinelYear('2026-08-31'), false);
  assert.equal(hasOracleSentinelYear(null), false);
});

test('mapPersonResultRow keeps identifier/phone text and omits TOTAL_COUNT', async () => {
  const mapped = await mapPersonResultRow({
    EMPLOYEE_ID: 293,
    EMPLOYEE_NAME: 'HAMMAD RAZA',
    PERSON_NUMBER: 'EMP-10045',
    ASSIGNMENT_NUMBER: 'EMP-10045',
    BUSINESS_TITLE: 'SENIOR SALES EXECUTIVE',
    MOBILE_NUMBER: '+965 50000000',
    WORK_PHONE: '+965 22000000',
    ASSIGNMENT_IS_ACTIVE: 'Y',
    PAYROLL_RUN_COUNT: 1,
    LAST_PAYROLL_RESULT_DATE: new Date(2026, 7, 16, 11, 26, 3),
    TOTAL_COUNT: 9
  });
  assert.equal(mapped.employee_id, 293);
  assert.equal(mapped.person_number, 'EMP-10045');
  assert.equal(mapped.mobile_number, '+965 50000000');
  assert.equal(mapped.work_phone, '+965 22000000');
  assert.equal(mapped.assignment_is_active, 'Y');
  assert.equal(mapped.total_count, undefined);
});

test('mapPersonProcessResultRow returns JSON objects, not raw *_OBJ, and no flow name', async () => {
  const mapped = await mapPersonProcessResultRow({
    EMPLOYEE_ID: 293,
    EMPLOYEE_NAME: 'HAMMAD RAZA',
    PERSON_NUMBER: 'EMP-10045',
    BUSINESS_TITLE: 'SENIOR SALES EXECUTIVE',
    TASK_CODE: 'CALCULATE_PAYROLL',
    TASK_NAME: 'Calculate Payroll',
    STATUS: 'Complete',
    RUN_ID: 238,
    PAYROLL_ID: 15,
    PERIOD_START_DATE: '2026-08-01',
    PERIOD_END_DATE: '2026-08-31',
    PAYROLL_PERIOD: 'August 2026',
    AMOUNT: 2347.596,
    CURRENCY_CODE: 'USD',
    AMOUNT_SOURCE_CODE: 'NET_PAY',
    FLOW_NAME: 'Monthly Payroll Flow',
    FLOW_ID: 99,
    REL_ACTION_OBJ: JSON.stringify({
      rel_action_id: 174,
      run_id: 238,
      employee_id: 293,
      payroll_id: 15,
      status_code: 'COMPLETED'
    }),
    PAYROLL_DEFINITION_OBJ: {
      payroll_definition_id: 15,
      payroll_code: 'KW_MONTHLY',
      payroll_name: 'Kuwait Monthly Payroll'
    }
  });

  assert.equal(typeof mapped.rel_action, 'object');
  assert.equal(mapped.rel_action.rel_action_id, 174);
  assert.equal(typeof mapped.payroll_definition, 'object');
  assert.equal(mapped.payroll_definition.payroll_code, 'KW_MONTHLY');
  assert.equal(mapped.rel_action_obj, undefined);
  assert.equal(mapped.payroll_definition_obj, undefined);
  assert.equal(mapped.flow_name, undefined);
  assert.equal(mapped.flow_id, undefined);
  assert.equal(mapped.payroll_definition_id, 15);
  assert.equal(mapped.amount, 2347.596);
  assert.equal(mapped.currency_code, 'USD');
  assert.equal(mapped.period_end_date, '2026-08-31');
  assert.equal(mapped.period_warning, undefined);
});

test('sentinel period_end_date is not rewritten; period_warning is set', async () => {
  const mapped = await mapPersonProcessResultRow({
    EMPLOYEE_ID: 293,
    PERIOD_START_DATE: '2026-08-01',
    PERIOD_END_DATE: '4712-12-31',
    PAYROLL_PERIOD: 'August 2026',
    REL_ACTION_OBJ: null,
    PAYROLL_DEFINITION_OBJ: null
  });
  assert.equal(mapped.period_end_date, '4712-12-31');
  assert.equal(mapped.period_warning, true);
  assert.notEqual(mapped.period_end_date, '2026-08-31');
});

test('API messages match payroll list conventions', () => {
  assert.equal(MESSAGES.PERSON_LIST, 'Payroll person results retrieved successfully.');
  assert.equal(MESSAGES.PROCESS_LIST, 'Payroll process results retrieved successfully.');
  assert.equal(MESSAGES.CALCULATION_LIST, 'Payroll calculation results retrieved successfully.');
  assert.equal(MESSAGES.PERSON_NOT_FOUND, 'Payroll person result not found.');
});
