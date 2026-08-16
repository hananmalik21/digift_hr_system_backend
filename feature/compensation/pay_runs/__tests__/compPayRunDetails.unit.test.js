import test from 'node:test';
import assert from 'node:assert/strict';
import { ValidationError } from '../../../../utils/errors/index.js';
import { MESSAGES } from '../constants.js';
import {
  parsePositiveInt,
  validateGetFailedPayRunLines,
  validateGetPayRunDetails,
  validateGetPayRunEmployeeDetails,
  validateGetPayRunEmployees,
  validateGetPayRunsByEmployee,
  validateListPayRuns
} from '../middleware/compPayRunDetailsValidation.js';
import {
  buildPagination,
  mapFailedPayRunLine,
  mapPayRunEmployeeSummary,
  mapPayRunHeader,
  nestPayRunDetails,
  nestPayRunEmployeeDetails,
  toApiDateTimeOrNull,
  toNumberOrNull
} from '../utils/compPayRunDetailsMappers.js';

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

const SAMPLE_ROWS = [
  {
    PAY_RUN_ID: 103,
    ENTERPRISE_ID: 1,
    PAY_RUN_PLAN_ID: 111,
    RUN_TYPE: 'PAYROLL',
    RUN_STATUS: 'COMPLETED',
    RUN_START_DATE: new Date(2026, 7, 31, 0, 0, 0),
    RUN_END_DATE: new Date(2026, 7, 11, 20, 11, 39),
    TOTAL_SELECTED: 9,
    TOTAL_PROCESSED: 9,
    TOTAL_FAILED: 0,
    PROCESS_MONTH_NAME: 'AUGUST',
    PROCESS_MONTH_NO: 8,
    PROCESS_YEAR: 2026,
    PROCESS_PERIOD: 'AUGUST 2026',
    PROCESS_PERIOD_CODE: '2026-08',
    RUN_CREATED_BY: 'enterprise_admin',
    RUN_CREATION_DATE: new Date(2026, 7, 11, 20, 11, 39),
    RUN_LAST_UPDATED_BY: 'enterprise_admin',
    RUN_LAST_UPDATE_DATE: new Date(2026, 7, 11, 20, 11, 39),
    EMPLOYEE_ID: 501,
    LINE_PLAN_ID: 111,
    COMPONENT_ID: 10,
    ASSIGNMENT_DTL_ID: 1001,
    AMOUNT: 1500,
    CURRENCY_CODE: 'KWD',
    PROCESS_STATUS: 'COMPLETED',
    ERROR_MESSAGE: null,
    PROCESSED_DATE: new Date(2026, 7, 11, 20, 11, 39),
    LINE_CREATED_BY: 'SYSTEM',
    LINE_CREATION_DATE: new Date(2026, 7, 11, 20, 11, 39),
    LINE_LAST_UPDATED_BY: 'SYSTEM'
  },
  {
    PAY_RUN_ID: 103,
    ENTERPRISE_ID: 1,
    PAY_RUN_PLAN_ID: 111,
    RUN_TYPE: 'PAYROLL',
    RUN_STATUS: 'COMPLETED',
    PROCESS_PERIOD: 'AUGUST 2026',
    EMPLOYEE_ID: 501,
    LINE_PLAN_ID: 111,
    COMPONENT_ID: 20,
    ASSIGNMENT_DTL_ID: 1002,
    AMOUNT: 250,
    CURRENCY_CODE: 'KWD',
    PROCESS_STATUS: 'COMPLETED',
    ERROR_MESSAGE: null,
    PROCESSED_DATE: new Date(2026, 7, 11, 20, 11, 39)
  },
  {
    PAY_RUN_ID: 103,
    ENTERPRISE_ID: 1,
    PAY_RUN_PLAN_ID: 111,
    RUN_TYPE: 'PAYROLL',
    RUN_STATUS: 'COMPLETED',
    PROCESS_PERIOD: 'AUGUST 2026',
    EMPLOYEE_ID: 502,
    LINE_PLAN_ID: 111,
    COMPONENT_ID: 10,
    ASSIGNMENT_DTL_ID: 2001,
    AMOUNT: 900,
    CURRENCY_CODE: 'KWD',
    PROCESS_STATUS: 'FAILED',
    ERROR_MESSAGE: 'Missing assignment amount',
    PROCESSED_DATE: new Date(2026, 7, 11, 20, 11, 39)
  }
];

test('validateListPayRuns requires enterprise_id and accepts optional filters', async () => {
  const missing = await runMiddleware(validateListPayRuns, mockReq({ query: {} }));
  assert.equal(missing.res.statusCode, 400);
  assert.equal(missing.res.body.message, MESSAGES.INVALID_ENTERPRISE_ID);

  const { req } = await runMiddleware(
    validateListPayRuns,
    mockReq({
      query: {
        enterprise_id: '1',
        run_type: 'payroll',
        run_status: 'COMPLETED',
        process_year: '2026',
        process_month_no: '8'
      }
    })
  );
  assert.deepEqual(req.validated, {
    enterprise_id: 1,
    run_type: 'PAYROLL',
    run_status: 'COMPLETED',
    process_year: 2026,
    process_month_no: 8,
    page: 1,
    limit: 50
  });
});

test('validateListPayRuns rejects invalid process_month_no', async () => {
  const { res } = await runMiddleware(
    validateListPayRuns,
    mockReq({ query: { enterprise_id: '1', process_month_no: '13' } })
  );
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, MESSAGES.INVALID_PROCESS_MONTH_NO);
});

test('parsePositiveInt accepts numeric strings greater than zero', () => {
  assert.equal(parsePositiveInt('103', MESSAGES.INVALID_PAY_RUN_ID), 103);
  assert.equal(parsePositiveInt(501, MESSAGES.INVALID_EMPLOYEE_ID), 501);
});

test('parsePositiveInt rejects missing, zero, negative, and non-numeric values', () => {
  assert.throws(() => parsePositiveInt(undefined, MESSAGES.INVALID_ENTERPRISE_ID), ValidationError);
  assert.throws(() => parsePositiveInt('0', MESSAGES.INVALID_PAY_RUN_ID), (err) => err.message === MESSAGES.INVALID_PAY_RUN_ID);
  assert.throws(() => parsePositiveInt('-1', MESSAGES.INVALID_EMPLOYEE_ID), (err) => err.message === MESSAGES.INVALID_EMPLOYEE_ID);
  assert.throws(() => parsePositiveInt('abc', MESSAGES.INVALID_EMPLOYEE_ID), (err) => err.message === MESSAGES.INVALID_EMPLOYEE_ID);
  assert.equal(parsePositiveInt('', MESSAGES.INVALID_EMPLOYEE_ID, { required: false }), null);
});

test('validateGetPayRunDetails requires enterprise_id and payRunId', async () => {
  const missingEnt = await runMiddleware(
    validateGetPayRunDetails,
    mockReq({ params: { payRunId: '103' }, query: {} })
  );
  assert.equal(missingEnt.res.statusCode, 400);
  assert.deepEqual(missingEnt.res.body, { success: false, message: MESSAGES.INVALID_ENTERPRISE_ID });

  const badRun = await runMiddleware(
    validateGetPayRunDetails,
    mockReq({ params: { payRunId: 'abc' }, query: { enterprise_id: '1' } })
  );
  assert.equal(badRun.res.statusCode, 400);
  assert.equal(badRun.res.body.message, MESSAGES.INVALID_PAY_RUN_ID);
});

test('validateGetPayRunDetails attaches defaults and optional employee_id', async () => {
  const { req, res } = await runMiddleware(
    validateGetPayRunDetails,
    mockReq({ params: { payRunId: '103' }, query: { enterprise_id: '1', employee_id: '501' } })
  );
  assert.equal(res.body, null);
  assert.deepEqual(req.validated, {
    enterprise_id: 1,
    pay_run_id: 103,
    employee_id: 501,
    page: 1,
    limit: 50
  });
});

test('validateGetPayRunDetails rejects invalid employee_id and caps limit', async () => {
  const badEmp = await runMiddleware(
    validateGetPayRunDetails,
    mockReq({ params: { payRunId: '103' }, query: { enterprise_id: '1', employee_id: '0' } })
  );
  assert.equal(badEmp.res.statusCode, 400);
  assert.equal(badEmp.res.body.message, MESSAGES.INVALID_EMPLOYEE_ID);

  const { req } = await runMiddleware(
    validateGetPayRunDetails,
    mockReq({ params: { payRunId: '103' }, query: { enterprise_id: '1', page: '2', limit: '500' } })
  );
  assert.equal(req.validated.page, 2);
  assert.equal(req.validated.limit, 100);
});

test('validateGetPayRunEmployeeDetails and by-employee require path employeeId', async () => {
  const missing = await runMiddleware(
    validateGetPayRunEmployeeDetails,
    mockReq({ params: { payRunId: '103' }, query: { enterprise_id: '1' } })
  );
  assert.equal(missing.res.statusCode, 400);
  assert.equal(missing.res.body.message, MESSAGES.INVALID_EMPLOYEE_ID);

  const ok = await runMiddleware(
    validateGetPayRunsByEmployee,
    mockReq({ params: { employeeId: '501' }, query: { enterprise_id: '1' } })
  );
  assert.equal(ok.req.validated.employee_id, 501);
  assert.equal(ok.req.validated.enterprise_id, 1);
});

test('validateGetPayRunDetails rejects enterprise mismatch with 403', async () => {
  const { res } = await runMiddleware(
    validateGetPayRunDetails,
    mockReq({
      params: { payRunId: '103' },
      query: { enterprise_id: '2' },
      enterpriseId: 1
    })
  );
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.success, false);
});

test('validateGetPayRunEmployees and failed-lines accept valid input', async () => {
  const employees = await runMiddleware(
    validateGetPayRunEmployees,
    mockReq({ params: { payRunId: '103' }, query: { enterprise_id: '1' } })
  );
  assert.equal(employees.req.validated.pay_run_id, 103);

  const failed = await runMiddleware(
    validateGetFailedPayRunLines,
    mockReq({ params: { payRunId: '103' }, query: { enterprise_id: '1', employee_id: '501' } })
  );
  assert.equal(failed.req.validated.employee_id, 501);
});

test('toNumberOrNull and toApiDateTimeOrNull handle Oracle driver values', () => {
  assert.equal(toNumberOrNull(null), null);
  assert.equal(toNumberOrNull('2500.750'), 2500.75);
  assert.equal(toApiDateTimeOrNull(null), null);
  assert.equal(toApiDateTimeOrNull(new Date(2026, 7, 31, 0, 0, 0)), '2026-08-31T00:00:00');
  assert.equal(toApiDateTimeOrNull('2026-08-11 20:11:39'), '2026-08-11T20:11:39');
});

test('nestPayRunDetails groups lines under employees without repeating the header', () => {
  const nested = nestPayRunDetails(SAMPLE_ROWS);
  assert.equal(nested.payRun.payRunId, 103);
  assert.equal(nested.payRun.planId, 111);
  assert.equal(nested.payRun.runType, 'PAYROLL');
  assert.equal(nested.payRun.processPeriod, 'AUGUST 2026');
  assert.equal(nested.employees.length, 2);
  assert.equal(nested.employees[0].employeeId, 501);
  assert.equal(nested.employees[0].lines.length, 2);
  assert.equal(nested.employees[0].lines[0].componentId, 10);
  assert.equal(nested.employees[0].lines[0].amount, 1500);
  assert.equal(nested.employees[0].lines[1].componentId, 20);
  assert.equal(nested.employees[1].employeeId, 502);
  assert.equal(nested.employees[1].lines[0].processStatus, 'FAILED');
  assert.equal(nested.employees[1].lines[0].errorMessage, 'Missing assignment amount');
  assert.equal(nested.payRun.createdBy, 'enterprise_admin');
});

test('nestPayRunEmployeeDetails returns compact header plus one employee', () => {
  const data = nestPayRunEmployeeDetails(SAMPLE_ROWS.slice(0, 2), 501);
  assert.deepEqual(Object.keys(data.payRun), ['payRunId', 'runType', 'runStatus', 'processPeriod']);
  assert.equal(data.employee.employeeId, 501);
  assert.equal(data.employee.lines.length, 2);
});

test('mapFailedPayRunLine includes employeeId and errorMessage', () => {
  const mapped = mapFailedPayRunLine(SAMPLE_ROWS[2]);
  assert.equal(mapped.employeeId, 502);
  assert.equal(mapped.errorMessage, 'Missing assignment amount');
  assert.equal(mapped.processStatus, 'FAILED');
});

test('mapPayRunEmployeeSummary maps aggregate columns; totalAmount is a line sum', () => {
  const mapped = mapPayRunEmployeeSummary({
    EMPLOYEE_ID: 501,
    TOTAL_LINES: 8,
    TOTAL_AMOUNT: 2500.75,
    COMPLETED_LINES: 8,
    FAILED_LINES: 0
  });
  assert.deepEqual(mapped, {
    employeeId: 501,
    totalLines: 8,
    totalAmount: 2500.75,
    completedLines: 8,
    failedLines: 0
  });
});

test('mapPayRunHeader uses camelCase and nulls empty values', () => {
  const header = mapPayRunHeader({
    PAY_RUN_ID: '103',
    ENTERPRISE_ID: 1,
    RUN_TYPE: 'PAYROLL',
    TOTAL_FAILED: 0,
    RUN_CREATED_BY: ' '
  });
  assert.equal(header.payRunId, 103);
  assert.equal(header.createdBy, null);
  assert.equal(header.totalFailed, 0);
});

test('buildPagination matches compensation GET list pagination', () => {
  assert.deepEqual(buildPagination(1, 50, 125), {
    page: 1,
    limit: 50,
    total: 125,
    total_pages: 3,
    has_next: true,
    has_previous: false
  });
  assert.deepEqual(buildPagination(1, 50, 0), {
    page: 1,
    limit: 50,
    total: 0,
    total_pages: 0,
    has_next: false,
    has_previous: false
  });
});

test('nestPayRunDetails returns null for empty input', () => {
  assert.equal(nestPayRunDetails([]), null);
  assert.equal(nestPayRunDetails(null), null);
});
