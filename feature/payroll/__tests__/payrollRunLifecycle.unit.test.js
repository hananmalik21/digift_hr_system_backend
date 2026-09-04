/**
 * Payroll run lifecycle tests for PAY.PAYROLL_PROCESSING_PKG behavior.
 * No live Oracle required.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PAYROLL_FLOW_SUBMISSION_STATUS_CODES, PAYROLL_RUN_STATUS_CODES } from '../shared/payrollValidation.js';
import {
  createRunInitialization,
  finalizeRun,
  processRun,
  retryRunEmployee,
  rollbackRun,
  withPersistedRunStatus
} from '../runs/services/payRunsService.js';
import { initializeRunFromSubmission } from '../flow_submissions/services/payFlowSubmissions.service.js';
import { validateListRuns } from '../runs/middleware/payRunsValidation.js';
import {
  validateInitializeRunFromSubmission,
  validateListSubmissions
} from '../flow_submissions/middleware/payFlowSubmissions.validation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function read(rel) {
  return fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
}

const runsModel = read('../runs/model/payRunsModel.js');
const runsService = read('../runs/services/payRunsService.js');
const runsView = read('../runs/model/payRunsViewModel.js');
const runsValidation = read('../runs/middleware/payRunsValidation.js');
const submissionsService = read('../flow_submissions/services/payFlowSubmissions.service.js');
const submissionsModel = read('../flow_submissions/model/payFlowSubmissionsModel.js');
const dashboardService = read('../dashboard/services/payDashboard.service.js');
const dashboardModel = read('../dashboard/model/payDashboardModel.js');
const swagger = read('../runs/swagger/payRuns.swagger.js');
const submissionsSwagger = read('../flow_submissions/swagger/payFlowSubmissions.swagger.js');
const initializeValidation = read('../flow_submissions/middleware/payFlowSubmissions.validation.js');
const submissionsView = read('../flow_submissions/model/payFlowSubmissionsViewModel.js');

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

test('PAYROLL_RUN_STATUS_CODES includes READY_TO_FINALIZE', () => {
  for (const code of [
    'IN_PROGRESS',
    'READY_TO_FINALIZE',
    'COMPLETED_WITH_ERRORS',
    'COMPLETED',
    'ROLLED_BACK',
    'ERROR'
  ]) {
    assert.ok(PAYROLL_RUN_STATUS_CODES.includes(code), code);
  }
  assert.ok(swagger.includes('READY_TO_FINALIZE'));
  assert.ok(swagger.includes('flow_submission_id'));
});

test('withPersistedRunStatus prefers persisted STATUS_CODE over OUT P_STATUS', () => {
  const mapped = withPersistedRunStatus(
    { status: 'IN_PROGRESS', employee_success_count: 10 },
    { run_id: 123, status_code: 'READY_TO_FINALIZE' }
  );
  assert.equal(mapped.status, 'READY_TO_FINALIZE');
  assert.equal(mapped.run.status_code, 'READY_TO_FINALIZE');
  assert.equal(mapped.employee_success_count, 10);
});

test('processRun returns persisted READY_TO_FINALIZE and does not remap to IN_PROGRESS', async () => {
  const outcome = await processRun(1, 123, { processed_by: 'PAYROLL_TEST' }, {
    getRunById: async () => ({
      run_id: 123,
      status_code: 'READY_TO_FINALIZE',
      flow_submission_id: 99
    }),
    processRun: async () => ({
      success: true,
      message: 'Payroll run processing completed.',
      data: { status: 'IN_PROGRESS', employee_success_count: 2 }
    })
  });
  assert.equal(outcome.success, true);
  assert.equal(outcome.data.status, 'READY_TO_FINALIZE');
  assert.equal(outcome.data.run.status_code, 'READY_TO_FINALIZE');
  assert.notEqual(outcome.data.status, 'IN_PROGRESS');
});

test('processRun exposes COMPLETED_WITH_ERRORS exactly', async () => {
  const outcome = await processRun(1, 123, { processed_by: 'PAYROLL_TEST' }, {
    getRunById: async () => ({ run_id: 123, status_code: 'COMPLETED_WITH_ERRORS' }),
    processRun: async () => ({
      success: true,
      message: 'Payroll run processing completed with errors.',
      data: { status: 'COMPLETED_WITH_ERRORS', employee_error_count: 1 }
    })
  });
  assert.equal(outcome.data.status, 'COMPLETED_WITH_ERRORS');
});

test('PAYROLL_FLOW_SUBMISSION_STATUS_CODES includes ROLLED_BACK', () => {
  for (const code of [
    'DRAFT',
    'SUBMITTED',
    'RUN_CREATED',
    'COMPLETED',
    'ROLLED_BACK',
    'CANCELLED',
    'ERROR'
  ]) {
    assert.ok(PAYROLL_FLOW_SUBMISSION_STATUS_CODES.includes(code), code);
  }
  assert.ok(submissionsSwagger.includes('ROLLED_BACK'));
});

test('retry employee without flow_submission_id omits submission', async () => {
  const outcome = await retryRunEmployee(1, 123, 45, { retry_reason: 'fix', retried_by: 'PAYROLL_TEST' }, {
    getRunById: async () => ({ run_id: 123, status_code: 'READY_TO_FINALIZE' }),
    retryEmployee: async () => ({
      success: true,
      message: 'Employee retried successfully.',
      data: { status: 'SUCCESS', reversed_result_count: 1 }
    }),
    getFlowSubmissionById: async () => {
      throw new Error('must not load submission for unlinked run');
    }
  });
  assert.equal(outcome.success, true);
  assert.equal(outcome.data.status, 'READY_TO_FINALIZE');
  assert.equal(outcome.data.run.status_code, 'READY_TO_FINALIZE');
  assert.equal(outcome.data.reversed_result_count, 1);
  assert.equal(outcome.data.submission, undefined);
});

test('retry linked flow run returns authoritative submission (COMPLETED may become RUN_CREATED)', async () => {
  const outcome = await retryRunEmployee(1, 250, 45, { retry_reason: 'reopen', retried_by: 'PAYROLL_TEST' }, {
    getRunById: async () => ({
      run_id: 250,
      status_code: 'READY_TO_FINALIZE',
      flow_submission_id: 12
    }),
    retryEmployee: async () => ({
      success: true,
      message: 'Employee retried successfully.',
      data: { status: 'SUCCESS', reversed_result_count: 2 }
    }),
    getFlowSubmissionById: async (enterpriseId, flowSubmissionId) => {
      assert.equal(enterpriseId, 1);
      assert.equal(flowSubmissionId, 12);
      return {
        flow_submission_id: 12,
        submission_number: 'PR-2026-001',
        status_code: 'RUN_CREATED'
      };
    }
  });
  assert.equal(outcome.data.run.status_code, 'READY_TO_FINALIZE');
  assert.equal(outcome.data.run.flow_submission_id, 12);
  assert.equal(outcome.data.submission.flow_submission_id, 12);
  assert.equal(outcome.data.submission.submission_number, 'PR-2026-001');
  assert.equal(outcome.data.submission.status_code, 'RUN_CREATED');
  assert.equal(outcome.data.reversed_result_count, 2);
});

test('retry does not reload submission when Oracle returns failure', async () => {
  let loaded = false;
  const outcome = await retryRunEmployee(1, 250, 45, { retry_reason: 'fix', retried_by: 'PAYROLL_TEST' }, {
    getRunById: async () => ({ run_id: 250, status_code: 'COMPLETED', flow_submission_id: 12 }),
    retryEmployee: async () => ({
      success: false,
      message: 'Employee cannot be retried in the current state.'
    }),
    getFlowSubmissionById: async () => {
      loaded = true;
      return { status_code: 'RUN_CREATED' };
    }
  });
  assert.equal(outcome.success, false);
  assert.equal(loaded, false);
});

test('finalizeRun reads back run COMPLETED and linked flow submission COMPLETED', async () => {
  const outcome = await finalizeRun(1, 123, { finalized_by: 'PAYROLL_TEST' }, {
    getRunById: async () => ({
      run_id: 123,
      status_code: 'COMPLETED',
      flow_submission_id: 99
    }),
    finalizeRun: async () => ({
      success: true,
      message: 'Payroll run finalized successfully.',
      data: { status: 'COMPLETED' }
    }),
    getFlowSubmissionById: async () => ({
      flow_submission_id: 99,
      status_code: 'COMPLETED'
    })
  });
  assert.equal(outcome.data.status, 'COMPLETED');
  assert.equal(outcome.data.run.status_code, 'COMPLETED');
  assert.equal(outcome.data.submission.status_code, 'COMPLETED');
  assert.equal(outcome.data.submission.flow_submission_id, 99);
});

test('rollbackRun without flow_submission_id omits submission', async () => {
  const outcome = await rollbackRun(1, 123, { rollback_reason: 'wrong inputs', rolled_back_by: 'PAYROLL_TEST' }, {
    getRunById: async () => ({ run_id: 123, status_code: 'ROLLED_BACK' }),
    rollbackRun: async () => ({
      success: true,
      message: 'Payroll run rolled back successfully.',
      data: { status: 'ROLLED_BACK', rolled_back_action_count: 3 }
    }),
    getFlowSubmissionById: async () => {
      throw new Error('must not load submission for unlinked run');
    }
  });
  assert.equal(outcome.data.status, 'ROLLED_BACK');
  assert.equal(outcome.data.run.status_code, 'ROLLED_BACK');
  assert.equal(outcome.data.rolled_back_action_count, 3);
  assert.equal(outcome.data.submission, undefined);
});

test('rollback linked flow run returns run and submission ROLLED_BACK', async () => {
  const outcome = await rollbackRun(1, 250, { rollback_reason: 'wrong inputs', rolled_back_by: 'PAYROLL_TEST' }, {
    getRunById: async () => ({
      run_id: 250,
      status_code: 'ROLLED_BACK',
      flow_submission_id: 12
    }),
    rollbackRun: async () => ({
      success: true,
      message: 'Payroll run rolled back successfully.',
      data: { status: 'ROLLED_BACK' }
    }),
    getFlowSubmissionById: async (enterpriseId, flowSubmissionId) => {
      assert.equal(enterpriseId, 1);
      assert.equal(flowSubmissionId, 12);
      return {
        flow_submission_id: 12,
        submission_number: 'PR-2026-001',
        status_code: 'ROLLED_BACK'
      };
    }
  });
  assert.equal(outcome.data.run.status_code, 'ROLLED_BACK');
  assert.equal(outcome.data.run.flow_submission_id, 12);
  assert.equal(outcome.data.submission.status_code, 'ROLLED_BACK');
  assert.equal(outcome.data.submission.flow_submission_id, 12);
});

test('list flow submissions validation accepts status_code=ROLLED_BACK', () => {
  const req = authReq({ query: { enterprise_id: '1', status_code: 'ROLLED_BACK' } });
  let nextCalled = false;
  validateListSubmissions(req, mockRes(), () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.equal(req.validated.status_code, 'ROLLED_BACK');
});

test('list runs validation accepts READY_TO_FINALIZE via status or status_code', () => {
  const req = authReq({ query: { enterprise_id: '1', status: 'READY_TO_FINALIZE' } });
  let nextCalled = false;
  validateListRuns(req, mockRes(), () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.equal(req.validated.status_code, 'READY_TO_FINALIZE');

  const req2 = authReq({ query: { enterprise_id: '1', status_code: 'COMPLETED_WITH_ERRORS' } });
  validateListRuns(req2, mockRes(), () => {});
  assert.equal(req2.validated.status_code, 'COMPLETED_WITH_ERRORS');
});

test('initialize-from-submission validation does not accept payroll dates or run type', () => {
  const req = authReq({
    params: { flowSubmissionId: '123' },
    body: {
      enterprise_id: 1,
      payroll_id: 15,
      period_end_date: '4712-12-31',
      run_type_code: 'REGULAR',
      payment_date: '2026-08-31'
    }
  });
  validateInitializeRunFromSubmission(req, mockRes(), () => {});
  assert.equal(req.validated.enterprise_id, 1);
  assert.equal(req.validated.flow_submission_id, 123);
  assert.equal(req.validated.created_by, 'PAYROLL_TEST');
  assert.equal(Object.hasOwn(req.validated, 'payroll_id'), false);
  assert.equal(Object.hasOwn(req.validated, 'period_end_date'), false);
  assert.equal(Object.hasOwn(req.validated, 'run_type_code'), false);
  assert.equal(Object.hasOwn(req.validated, 'payment_date'), false);
});

test('initialize-from-submission validation source does not bind payroll_id or dates', () => {
  const start = initializeValidation.indexOf('export function validateInitializeRunFromSubmission');
  const next = initializeValidation.indexOf('\nexport function', start + 1);
  const fn = initializeValidation.slice(start, next === -1 ? undefined : next);
  assert.equal(fn.includes('payroll_id'), false);
  assert.equal(fn.includes('period_end_date'), false);
  assert.equal(fn.includes('run_type_code'), false);
});

test('run APIs do not UPDATE PAYROLL_RUNS or PAY_PAYROLL_FLOW_SUBMISSIONS', () => {
  for (const [label, source] of [
    ['runs model', runsModel],
    ['runs service', runsService],
    ['runs view', runsView],
    ['runs validation', runsValidation],
    ['submissions service', submissionsService],
    ['submissions model', submissionsModel]
  ]) {
    assert.equal(/\bUPDATE\s+PAY\.PAYROLL_RUNS\b/i.test(source), false, `${label} UPDATE PAYROLL_RUNS`);
    assert.equal(/\bUPDATE\s+PAY\.PAY_PAYROLL_FLOW_SUBMISSIONS\b/i.test(source), false, `${label} UPDATE submissions`);
    assert.equal(/\bSET\s+STATUS_CODE\s*=/i.test(source), false, `${label} SET STATUS_CODE`);
  }
  assert.ok(submissionsView.includes('v.ENTERPRISE_ID = :enterprise_id'));
  assert.ok(submissionsView.includes('getLinkedFlowSubmission'));
  assert.equal(runsValidation.includes('4712'), false);
  assert.equal(runsModel.includes('4712'), false);
});

test('existing processing routes remain in the runs router', () => {
  const routes = read('../runs/routes/payRuns.routes.js');
  for (const path of [
    '/initialize',
    '/:runId/prepare-employees',
    '/:runId/process',
    '/:runId/finalize',
    '/:runId/rollback',
    '/:runId/employees/:employeeId/retry'
  ]) {
    assert.ok(routes.includes(path), path);
  }
});

test('dashboard counts include READY_TO_FINALIZE and COMPLETED_WITH_ERRORS', () => {
  assert.ok(dashboardService.includes("'READY_TO_FINALIZE'"));
  assert.ok(dashboardService.includes("'COMPLETED_WITH_ERRORS'"));
  assert.ok(dashboardModel.includes('COMPLETED_WITH_ERRORS'));
});

const INIT_RUN_PAYLOAD = {
  enterprise_id: 1,
  payroll_id: 15,
  run_type_code: 'REGULAR',
  period_start_date: '2026-09-01',
  period_end_date: '2026-09-30',
  payment_date: '2026-09-30',
  run_number: 'PAY-TEST-002',
  created_by: 'PAYROLL_TEST'
};

const INIT_FROM_SUBMISSION_PAYLOAD = {
  enterprise_id: 1,
  flow_submission_id: 123,
  created_by: 'PAYROLL_TEST'
};

function mockInitializeRunDeps(oracleResult, overlappingStatus) {
  let oracleCalled = false;
  return {
    deps: {
      initializeRun: async (payload) => {
        oracleCalled = true;
        assert.equal(payload.payroll_id, INIT_RUN_PAYLOAD.payroll_id);
        return oracleResult;
      },
      getRunById: async () => ({
        run_id: oracleResult.data?.run_id ?? 251,
        status_code: 'IN_PROGRESS',
        period_end_date: overlappingStatus === 'COMPLETED' ? '4712-12-31' : '2026-08-31'
      })
    },
    wasOracleCalled: () => oracleCalled
  };
}

function mockInitializeFromSubmissionDeps(oracleResult) {
  let oracleCalled = false;
  return {
    deps: {
      initializeRunFromSubmission: async () => {
        oracleCalled = true;
        return oracleResult;
      },
      getFlowSubmissionById: async () => ({
        flow_submission_id: 123,
        submission_number: 'PR-2026-001',
        status_code: 'RUN_CREATED'
      }),
      getRunById: async () => ({
        run_id: oracleResult.data?.run_id ?? 251,
        status_code: 'IN_PROGRESS',
        flow_submission_id: 123
      }),
      getRunByFlowSubmissionId: async () => null
    },
    wasOracleCalled: () => oracleCalled
  };
}

test('initialize paths do not perform Node-side payroll run overlap validation', () => {
  const initRunFn = runsService.slice(runsService.indexOf('export async function createRunInitialization'));
  const initFromSubmissionFn = submissionsService.slice(
    submissionsService.indexOf('export async function initializeRunFromSubmission')
  );

  for (const [label, source] of [
    ['initialize run service fn', initRunFn],
    ['initialize-from-submission service fn', initFromSubmissionFn],
    ['runs validation', runsValidation],
    ['initialize-from-submission validation', initializeValidation]
  ]) {
    assert.equal(/overlap/i.test(source), false, `${label} overlap check`);
    assert.equal(/blocking.*status/i.test(source), false, `${label} blocking status check`);
    assert.equal(/duplicate.*payroll run/i.test(source), false, `${label} duplicate run check`);
  }

  assert.equal(initRunFn.includes('listRuns'), false);
  assert.equal(initFromSubmissionFn.includes('listRuns'), false);
  assert.ok(runsModel.includes('Overlapping-run blocking is also Oracle-owned'));
});

test('TEST A: initializeRun does not pre-reject when overlapping COMPLETED run exists', async () => {
  const { deps, wasOracleCalled } = mockInitializeRunDeps(
    {
      success: true,
      message: 'Payroll run initialized successfully.',
      data: { run_id: 251, run_guid: 'new-guid' }
    },
    'COMPLETED'
  );

  const outcome = await createRunInitialization(INIT_RUN_PAYLOAD, deps);
  assert.equal(wasOracleCalled(), true);
  assert.equal(outcome.success, true);
  assert.equal(outcome.httpStatus, 201);
  assert.equal(outcome.data.status_code, 'IN_PROGRESS');
});

test('TEST B: initializeRun does not pre-reject when overlapping ROLLED_BACK run exists', async () => {
  const { deps, wasOracleCalled } = mockInitializeRunDeps({
    success: true,
    message: 'Payroll run initialized successfully.',
    data: { run_id: 252, run_guid: 'new-guid-2' }
  });

  const outcome = await createRunInitialization(INIT_RUN_PAYLOAD, deps);
  assert.equal(wasOracleCalled(), true);
  assert.equal(outcome.success, true);
  assert.equal(outcome.httpStatus, 201);
});

test('TEST C: initializeRun does not pre-reject when overlapping ERROR run exists', async () => {
  const { deps, wasOracleCalled } = mockInitializeRunDeps({
    success: true,
    message: 'Payroll run initialized successfully.',
    data: { run_id: 253, run_guid: 'new-guid-3' }
  });

  const outcome = await createRunInitialization(INIT_RUN_PAYLOAD, deps);
  assert.equal(wasOracleCalled(), true);
  assert.equal(outcome.success, true);
});

test('TEST D: initializeRun propagates Oracle failure for overlapping IN_PROGRESS run', async () => {
  const { deps, wasOracleCalled } = mockInitializeRunDeps({
    success: false,
    message: 'Duplicate payroll run for period.',
    data: null
  });

  const outcome = await createRunInitialization(INIT_RUN_PAYLOAD, deps);
  assert.equal(wasOracleCalled(), true);
  assert.equal(outcome.success, false);
  assert.equal(outcome.httpStatus, 400);
  assert.match(outcome.message, /duplicate payroll run/i);
});

test('TEST E: initializeRun propagates Oracle failure for overlapping READY_TO_FINALIZE run', async () => {
  const { deps, wasOracleCalled } = mockInitializeRunDeps({
    success: false,
    message: 'An overlapping payroll run is already READY_TO_FINALIZE.',
    data: null
  });

  const outcome = await createRunInitialization(INIT_RUN_PAYLOAD, deps);
  assert.equal(wasOracleCalled(), true);
  assert.equal(outcome.success, false);
  assert.equal(outcome.httpStatus, 400);
});

test('TEST F: initializeRun propagates Oracle failure for overlapping COMPLETED_WITH_ERRORS run', async () => {
  const { deps, wasOracleCalled } = mockInitializeRunDeps({
    success: false,
    message: 'Duplicate payroll run for period.',
    data: null
  });

  const outcome = await createRunInitialization(INIT_RUN_PAYLOAD, deps);
  assert.equal(wasOracleCalled(), true);
  assert.equal(outcome.success, false);
  assert.equal(outcome.httpStatus, 400);
});

test('initialize-run-from-submission delegates overlap blocking to Oracle for active runs', async () => {
  const blocking = mockInitializeFromSubmissionDeps({
    success: false,
    message: 'Duplicate payroll run for period.',
    data: null
  });
  const blockingOutcome = await initializeRunFromSubmission(INIT_FROM_SUBMISSION_PAYLOAD, blocking.deps);
  assert.equal(blocking.wasOracleCalled(), true);
  assert.equal(blockingOutcome.success, false);
  assert.equal(blockingOutcome.httpStatus, 400);

  const nonBlocking = mockInitializeFromSubmissionDeps({
    success: true,
    message: 'Payroll run initialized from flow submission successfully.',
    data: { run_id: 251, run_guid: 'abc', run_number: 'KW-001', submission_number: 'PR-2026-001' }
  });
  const okOutcome = await initializeRunFromSubmission(INIT_FROM_SUBMISSION_PAYLOAD, nonBlocking.deps);
  assert.equal(nonBlocking.wasOracleCalled(), true);
  assert.equal(okOutcome.success, true);
  assert.equal(okOutcome.httpStatus, 201);
  assert.equal(okOutcome.data.run.status_code, 'IN_PROGRESS');
});
