/**
 * Follow-up reads after INITIALIZE_RUN_FROM_SUBMISSION.
 * Enterprise-scoped SELECTs only — no DML.
 */

import { queryPayOne } from '../../shared/index.js';
import { getRunById } from '../../runs/model/payRunsViewModel.js';

const LOG_TAG = 'payFlowSubmissionsView';

/**
 * @param {number} enterpriseId
 * @param {number} flowSubmissionId
 */
export async function getFlowSubmissionById(enterpriseId, flowSubmissionId) {
  return queryPayOne({
    fromSql: 'PAY.PAY_PAYROLL_FLOW_SUBMISSIONS v',
    alias: 'v',
    filters: [
      { sql: 'v.FLOW_SUBMISSION_ID = :flow_submission_id', bind: 'flow_submission_id', value: flowSubmissionId },
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: enterpriseId }
    ],
    logTag: LOG_TAG
  });
}

/**
 * @param {number} enterpriseId
 * @param {number} flowSubmissionId
 */
export async function getRunByFlowSubmissionId(enterpriseId, flowSubmissionId) {
  return queryPayOne({
    fromSql: 'PAY.PAYROLL_RUNS v',
    alias: 'v',
    filters: [
      { sql: 'v.FLOW_SUBMISSION_ID = :flow_submission_id', bind: 'flow_submission_id', value: flowSubmissionId },
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: enterpriseId }
    ],
    logTag: LOG_TAG
  });
}

export { getRunById };
