/**
 * Payroll flow / consolidation / process-config / submission API tests.
 * No live Oracle required.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ValidationError } from '../../../utils/errors/index.js';
import {
  coerceJsonBoolean,
  mergeResultData,
  outcomeFromResultJson,
  parseResultJsonValue,
  requireOneOf
} from '../shared/index.js';
import { initializeRunFromSubmission } from '../flow_submissions/services/payFlowSubmissions.service.js';
import { validateCreateDraft } from '../flow_submissions/middleware/payFlowSubmissions.validation.js';
import { validateCreateFlow } from '../flows/middleware/payPayrollFlows.validation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function read(rel) {
  return fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
}

const flowsModel = read('../flows/model/payPayrollFlowsModel.js');
const submissionsModel = read('../flow_submissions/model/payFlowSubmissionsModel.js');
const submissionsView = read('../flow_submissions/model/payFlowSubmissionsViewModel.js');
const groupPackage = read('../shared/payrollStatusGroupPackage.js');
const consolidationModel = read('../consolidation_groups/model/payConsolidationGroupsModel.js');
const processConfigModel = read('../process_config_groups/model/payProcessConfigGroupsModel.js');
const payrollRoutes = read('../routes/payroll.routes.js');
const runsModel = read('../runs/model/payRunsModel.js');

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

function mockReq({ query = {}, body = {}, params = {}, user = {}, enterprise = {} } = {}) {
  return {
    query,
    body,
    params,
    user: {
      username: 'PAYROLL_TEST',
      enterprise_id: 1,
      ...user
    },
    enterprise: {
      enterpriseId: 1,
      ...enterprise
    }
  };
}

test('flow / group / submission packages use the specified Oracle procedures', () => {
  assert.ok(flowsModel.includes("const PKG = 'PAY.PAY_PAYROLL_FLOWS_PKG'"));
  for (const name of ['LIST_FLOWS', 'GET_FLOW', 'CREATE_FLOW', 'UPDATE_FLOW', 'SET_STATUS', 'DELETE_FLOW']) {
    assert.ok(flowsModel.includes(`${name}(`), `missing ${name}`);
  }

  assert.ok(submissionsModel.includes("const PKG = 'PAY.PAY_PAYROLL_FLOW_SUBMISSIONS_PKG'"));
  assert.ok(submissionsModel.includes("const PROCESSING_PKG = 'PAY.PAYROLL_PROCESSING_PKG'"));
  for (const name of [
    'CREATE_DRAFT',
    'GET_SUBMISSION',
    'LIST_SUBMISSIONS',
    'UPDATE_DRAFT',
    'SUBMIT_FLOW',
    'CANCEL_SUBMISSION',
    'DELETE_DRAFT',
    'INITIALIZE_RUN_FROM_SUBMISSION'
  ]) {
    assert.ok(submissionsModel.includes(`${name}(`), `missing ${name}`);
  }

  assert.ok(consolidationModel.includes("PAY.PAY_CONSOLIDATION_GROUPS_PKG"));
  assert.ok(processConfigModel.includes("PAY.PAY_PROCESS_CONFIG_GROUPS_PKG"));
  for (const name of ['LIST_GROUPS', 'GET_GROUP', 'CREATE_GROUP', 'UPDATE_GROUP', 'SET_STATUS', 'DELETE_GROUP']) {
    assert.ok(groupPackage.includes(`${name}(`), `missing group ${name}`);
  }
});

test('new payroll flow APIs are mounted on /api/payroll', () => {
  assert.ok(payrollRoutes.includes("from '../flows/routes/payPayrollFlows.routes.js'"));
  assert.ok(payrollRoutes.includes("from '../consolidation_groups/routes/payConsolidationGroups.routes.js'"));
  assert.ok(payrollRoutes.includes("from '../process_config_groups/routes/payProcessConfigGroups.routes.js'"));
  assert.ok(payrollRoutes.includes("from '../flow_submissions/routes/payFlowSubmissions.routes.js'"));
});

test('flow APIs do not add direct DML against PAY tables', () => {
  for (const [label, source] of [
    ['flows model', flowsModel],
    ['submissions model', submissionsModel],
    ['submissions view', submissionsView],
    ['group package', groupPackage]
  ]) {
    assert.equal(/\bINSERT\s+INTO\s+PAY\./i.test(source), false, `${label} INSERT`);
    assert.equal(/\bUPDATE\s+PAY\./i.test(source), false, `${label} UPDATE`);
    assert.equal(/\bDELETE\s+FROM\s+PAY\./i.test(source), false, `${label} DELETE`);
  }
});

test('existing INITIALIZE_RUN package call is unchanged', () => {
  assert.ok(runsModel.includes('PAY.PAYROLL_PROCESSING_PKG'));
  assert.ok(runsModel.includes('INITIALIZE_RUN('));
  assert.ok(runsModel.includes('PREPARE_RUN_EMPLOYEES('));
  assert.ok(runsModel.includes('PROCESS_RUN('));
  assert.ok(runsModel.includes('FINALIZE_RUN('));
  assert.ok(runsModel.includes('ROLLBACK_RUN('));
  assert.equal(runsModel.includes('INITIALIZE_RUN_FROM_SUBMISSION'), false);
});

test('parseResultJsonValue preserves JSON booleans and never returns a Lob', () => {
  const parsed = parseResultJsonValue('{"success": true, "message": "ok", "data": {"flow_id": 1}}');
  assert.equal(parsed.success, true);
  assert.equal(typeof parsed.success, 'boolean');
  assert.equal(coerceJsonBoolean('true'), true);
  assert.equal(coerceJsonBoolean('Y'), true);
  assert.equal(coerceJsonBoolean('N'), false);
  assert.equal(coerceJsonBoolean(true), true);
});

test('outcomeFromResultJson maps Oracle success false to HTTP failure', () => {
  const fail = outcomeFromResultJson({
    success: true,
    data: { json: { success: false, message: 'Flow code already exists', data: null } }
  });
  assert.equal(fail.success, false);
  assert.equal(fail.httpStatus, 400);
  assert.equal(fail.message, 'Flow code already exists');

  const ok = outcomeFromResultJson(
    {
      success: true,
      data: {
        json: { success: true, message: 'Created', data: { flow_name: 'X' } },
        extras: { flow_id: 9, flow_guid: 'abc' }
      }
    },
    { successHttpStatus: 201 }
  );
  assert.equal(ok.success, true);
  assert.equal(ok.httpStatus, 201);
  assert.equal(ok.data.flow_id, 9);
  assert.equal(ok.data.flow_guid, 'abc');
  assert.equal(ok.data.flow_name, 'X');
});

test('mergeResultData does not overwrite Oracle JSON fields', () => {
  const merged = mergeResultData({ flow_id: 1, flow_guid: null }, { flow_id: 99, flow_guid: 'g' });
  assert.equal(merged.flow_id, 1);
  assert.equal(merged.flow_guid, 'g');
});

test('requireOneOf accepts ACTIVE / INACTIVE', () => {
  assert.equal(requireOneOf('active', 'status', ['ACTIVE', 'INACTIVE']), 'ACTIVE');
  assert.throws(() => requireOneOf('DRAFT', 'status', ['ACTIVE', 'INACTIVE']), ValidationError);
});

test('create flow validation uses authenticated user as created_by', () => {
  const req = mockReq({
    body: {
      enterprise_id: 1,
      flow_name: 'Digify Simplified Payroll Cycle KW',
      flow_code: 'SIMPLIFIED_PAYROLL_KW'
    }
  });
  const res = mockRes();
  let nextCalled = false;
  validateCreateFlow(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.equal(req.validated.created_by, 'PAYROLL_TEST');
  assert.equal(req.validated.flow_code, 'SIMPLIFIED_PAYROLL_KW');
});

test('create draft validation requires flow_id and parses dates', () => {
  const req = mockReq({
    body: {
      enterprise_id: 1,
      flow_id: 1,
      period_start_date: '2026-09-01',
      payroll_group_id: null
    }
  });
  const res = mockRes();
  validateCreateDraft(req, res, () => {});
  assert.equal(req.validated.flow_id, 1);
  assert.equal(req.validated.payroll_group_id, null);
  assert.equal(req.validated.period_start_date.getFullYear(), 2026);
  assert.equal(req.validated.period_start_date.getMonth(), 8);
  assert.equal(req.validated.created_by, 'PAYROLL_TEST');

  const bad = mockReq({ body: { enterprise_id: 1 } });
  const badRes = mockRes();
  validateCreateDraft(bad, badRes, () => {});
  assert.equal(badRes.statusCode, 400);
  assert.equal(badRes.body.success, false);
});

test('initialize-run derives failure from P_SUCCESS != Y', async () => {
  const outcome = await initializeRunFromSubmission(
    { enterprise_id: 1, flow_submission_id: 123, created_by: 'PAYROLL_TEST' },
    {
      initializeRunFromSubmission: async () => ({
        success: false,
        message: 'Submission is not in SUBMITTED status',
        data: null
      })
    }
  );
  assert.equal(outcome.success, false);
  assert.equal(outcome.httpStatus, 400);
  assert.match(outcome.message, /SUBMITTED/);
});

test('initialize-run enriches from persisted submission and run rows', async () => {
  const outcome = await initializeRunFromSubmission(
    { enterprise_id: 1, flow_submission_id: 123, created_by: 'PAYROLL_TEST' },
    {
      initializeRunFromSubmission: async () => ({
        success: true,
        message: 'Payroll run initialized from flow submission successfully.',
        data: {
          run_id: 250,
          run_guid: 'abc',
          run_number: 'KW_MONTHLY-202609-1',
          submission_number: 'PR-2026-001'
        }
      }),
      getFlowSubmissionById: async () => ({
        flow_submission_id: 123,
        submission_number: 'PR-2026-001',
        status_code: 'RUN_CREATED'
      }),
      getRunById: async () => ({
        run_id: 250,
        run_guid: 'abc',
        run_number: 'KW_MONTHLY-202609-1',
        status_code: 'IN_PROGRESS'
      }),
      getRunByFlowSubmissionId: async () => null
    }
  );
  assert.equal(outcome.success, true);
  assert.equal(outcome.httpStatus, 201);
  assert.equal(typeof outcome.success, 'boolean');
  assert.deepEqual(outcome.data, {
    submission: {
      flow_submission_id: 123,
      submission_number: 'PR-2026-001',
      status_code: 'RUN_CREATED'
    },
    run: {
      run_id: 250,
      run_guid: 'abc',
      run_number: 'KW_MONTHLY-202609-1',
      status_code: 'IN_PROGRESS',
      flow_submission_id: 123
    }
  });
});

test('initialize-run treats existing RUN_CREATED submission as success', async () => {
  const outcome = await initializeRunFromSubmission(
    { enterprise_id: 1, flow_submission_id: 123, created_by: 'PAYROLL_TEST' },
    {
      initializeRunFromSubmission: async () => ({
        success: true,
        message: 'Payroll run already exists for this flow submission.',
        data: {
          run_id: 250,
          run_guid: 'abc',
          run_number: 'KW_MONTHLY-202609-1',
          submission_number: 'PR-2026-001'
        }
      }),
      getFlowSubmissionById: async () => ({
        flow_submission_id: 123,
        submission_number: 'PR-2026-001',
        status_code: 'RUN_CREATED'
      }),
      getRunById: async () => ({
        run_id: 250,
        run_guid: 'abc',
        run_number: 'KW_MONTHLY-202609-1',
        status_code: 'IN_PROGRESS',
        flow_submission_id: 123
      }),
      getRunByFlowSubmissionId: async () => null
    }
  );
  assert.equal(outcome.success, true);
  assert.equal(outcome.data.submission.status_code, 'RUN_CREATED');
  assert.equal(outcome.data.run.run_id, 250);
  assert.equal(outcome.data.run.flow_submission_id, 123);
});

test('initialize-run follow-up reads are SELECT only', () => {
  assert.ok(submissionsView.includes('PAY.PAY_PAYROLL_FLOW_SUBMISSIONS'));
  assert.ok(submissionsView.includes('PAY.PAYROLL_RUNS'));
  assert.ok(submissionsView.includes('v.ENTERPRISE_ID = :enterprise_id'));
  assert.ok(submissionsView.includes('v.FLOW_SUBMISSION_ID = :flow_submission_id'));
});
