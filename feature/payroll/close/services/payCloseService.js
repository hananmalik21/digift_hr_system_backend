/**
 * Business logic for payroll period close.
 *
 * There is no standalone "validate" package procedure — VALIDATE_AND_CLOSE
 * both validates and closes in one call. `POST /runs/:runId/close/validate`
 * therefore does not call Oracle at all; it just returns the current
 * (read-only) state of V_PAY_PAYROLL_CLOSE_CHECKS so callers can preview
 * whether a close would currently pass. Only `POST /runs/:runId/close`
 * actually invokes VALIDATE_AND_CLOSE.
 */

import { okList, okMutation, failOutcome, resolveAuditActor } from '../../shared/index.js';
import { requirePositiveInt, requireString, parsePaginationQuery, resolveEnterpriseId } from '../../shared/index.js';
import * as model from '../model/payCloseModel.js';

function packageOutcome(result, { successStatus = 200, failureStatus = 400 } = {}) {
  if (result.success) return okMutation(result.message, result.data, successStatus);
  return failOutcome(result.message, failureStatus, result.data);
}

export async function previewCloseChecksService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const runId = requirePositiveInt(req.params.runId, 'runId');
  const { page, pageSize } = parsePaginationQuery(req.query);
  const { data, total } = await model.listCloseChecks({ enterpriseId, runId, page, pageSize });
  const failing = data.filter((check) => String(check.result_code).toUpperCase() !== 'PASS');
  return okList(
    failing.length
      ? `${failing.length} close check(s) currently failing for this run.`
      : 'All recorded close checks currently pass for this run.',
    data,
    page,
    pageSize,
    total
  );
}

export async function listCloseChecksService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const runId = requirePositiveInt(req.params.runId, 'runId');
  const { page, pageSize } = parsePaginationQuery(req.query);
  const { data, total } = await model.listCloseChecks({ enterpriseId, runId, page, pageSize });
  return okList('Payroll close checks retrieved successfully.', data, page, pageSize, total);
}

export async function closeRunService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const runId = requirePositiveInt(req.params.runId, 'runId');
  const closeReference = requireString(req.body?.close_reference, 'close_reference', { max: 200 });
  const closedBy = resolveAuditActor(req);
  const result = await model.validateAndClose({ enterpriseId, runId, closeReference, closedBy });
  return packageOutcome(result);
}

export async function reopenRunService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const runId = requirePositiveInt(req.params.runId, 'runId');
  const reason = requireString(req.body?.reason, 'reason', { max: 4000 });
  const approvalReference = requireString(req.body?.approval_reference, 'approval_reference', { max: 200 });
  const reopenedBy = resolveAuditActor(req);
  const result = await model.reopenRun({ enterpriseId, runId, reason, approvalReference, reopenedBy });
  return packageOutcome(result);
}

export async function getCloseHistoryService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const runId = requirePositiveInt(req.params.runId, 'runId');
  const { page, pageSize } = parsePaginationQuery(req.query);
  const { data, total } = await model.listCloseHistory({ enterpriseId, runId, page, pageSize });
  return okList('Payroll close history retrieved successfully.', data, page, pageSize, total);
}
