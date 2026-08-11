/**
 * Approval workflow controller.
 */

import {
  assertEnterpriseAccess,
  failOutcome,
  notFoundOutcome,
  okGet,
  okList,
  okMutation,
  optionalPositiveInt,
  optionalString,
  parseGuidParam,
  parsePaginationQuery,
  requirePositiveInt,
  requireString,
  resolveAuditActor,
  resolveEnterpriseId,
  sendOutcome,
  withPayrollErrorHandling
} from '../shared/index.js';
import * as approvalsService from './approvals.service.js';

// --- Requests -------------------------------------------------------------------------------

export async function listApprovalRequestsHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id, { required: false });
    assertEnterpriseAccess(req, enterpriseId);
    const { page, pageSize } = parsePaginationQuery(req.query);

    const { data, total } = await approvalsService.listApprovalRequests({
      enterpriseId,
      objectTypeCode: optionalString(req.query.object_type, 'object_type'),
      objectId: optionalPositiveInt(req.query.object_id, 'object_id'),
      statusCode: optionalString(req.query.status, 'status'),
      requestedBy: optionalString(req.query.requested_by, 'requested_by'),
      search: optionalString(req.query.search, 'search'),
      sortBy: req.query.sort_by,
      sortOrder: req.query.sort_order,
      page,
      pageSize
    });

    return sendOutcome(res, okList('Approval requests retrieved successfully.', data, page, pageSize, total));
  });
}

export async function getApprovalRequestHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const requestId = requirePositiveInt(req.params.requestId, 'requestId');
    const request = await approvalsService.getApprovalRequestById(requestId);
    if (!request) return sendOutcome(res, notFoundOutcome('Approval request not found.'));
    assertEnterpriseAccess(req, request.enterprise_id);
    return sendOutcome(res, okGet('Approval request retrieved successfully.', request));
  });
}

export async function listApprovalStepsHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const requestId = requirePositiveInt(req.params.requestId, 'requestId');
    const request = await approvalsService.getApprovalRequestById(requestId);
    if (!request) return sendOutcome(res, notFoundOutcome('Approval request not found.'));
    assertEnterpriseAccess(req, request.enterprise_id);

    const steps = await approvalsService.listApprovalSteps(requestId);
    return sendOutcome(res, okGet('Approval steps retrieved successfully.', steps));
  });
}

export async function listApprovalActionsHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const requestId = requirePositiveInt(req.params.requestId, 'requestId');
    const request = await approvalsService.getApprovalRequestById(requestId);
    if (!request) return sendOutcome(res, notFoundOutcome('Approval request not found.'));
    assertEnterpriseAccess(req, request.enterprise_id);

    const actions = await approvalsService.listApprovalActions(requestId);
    return sendOutcome(res, okGet('Approval actions retrieved successfully.', actions));
  });
}

export async function createApprovalRequestHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.body.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);
    requireString(req.body.object_type_code, 'object_type_code', { max: 50 });
    requirePositiveInt(req.body.object_id, 'object_id');
    const actor = resolveAuditActor(req);

    const outcome = await approvalsService.createApprovalRequest({ ...req.body, enterprise_id: enterpriseId }, actor);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message));

    const request = await approvalsService.getApprovalRequestById(outcome.data.approval_request_id);
    return sendOutcome(res, okMutation(outcome.message, request ?? outcome.data, 201));
  });
}

export async function approveStepHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const requestId = requirePositiveInt(req.params.requestId, 'requestId');
    const request = await approvalsService.getApprovalRequestById(requestId);
    if (!request) return sendOutcome(res, notFoundOutcome('Approval request not found.'));
    assertEnterpriseAccess(req, request.enterprise_id);

    const actorCode = requireString(req.body.actor_code, 'actor_code', { max: 100 });
    const outcome = await approvalsService.approveStep(request.enterprise_id, requestId, actorCode, req.body.comments);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message));
    return sendOutcome(res, okMutation(outcome.message, outcome.data));
  });
}

export async function rejectRequestHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const requestId = requirePositiveInt(req.params.requestId, 'requestId');
    const request = await approvalsService.getApprovalRequestById(requestId);
    if (!request) return sendOutcome(res, notFoundOutcome('Approval request not found.'));
    assertEnterpriseAccess(req, request.enterprise_id);

    const actorCode = requireString(req.body.actor_code, 'actor_code', { max: 100 });
    const reason = requireString(req.body.reason, 'reason', { max: 4000 });
    const outcome = await approvalsService.rejectRequest(request.enterprise_id, requestId, actorCode, reason);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message));
    return sendOutcome(res, okMutation(outcome.message, outcome.data));
  });
}

export async function withdrawRequestHandler(req, res) {
  return sendOutcome(res, failOutcome(approvalsService.withdrawNotSupportedMessage(), 400));
}

export async function isApprovedHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);
    const objectTypeCode = requireString(req.query.object_type, 'object_type', { max: 50 });
    const objectId = requirePositiveInt(req.query.object_id, 'object_id');

    const result = await approvalsService.isApproved(enterpriseId, objectTypeCode, objectId);
    return sendOutcome(res, okGet('Approval status retrieved successfully.', result));
  });
}

export async function assertApprovedHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.body.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);
    const objectTypeCode = requireString(req.body.object_type_code, 'object_type_code', { max: 50 });
    const objectId = requirePositiveInt(req.body.object_id, 'object_id');

    const result = await approvalsService.assertApproved(enterpriseId, objectTypeCode, objectId);
    if (!result.approved) return sendOutcome(res, failOutcome(result.message, 400));
    return sendOutcome(res, okMutation(result.message, result));
  });
}

export async function listPendingApprovalsHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);
    const { page, pageSize } = parsePaginationQuery(req.query);

    const { data, total } = await approvalsService.listPendingApprovalsForActor({
      enterpriseId,
      roleCode: optionalString(req.query.role_code, 'role_code'),
      objectTypeCode: optionalString(req.query.object_type, 'object_type'),
      page,
      pageSize
    });

    return sendOutcome(res, okList('Pending approvals retrieved successfully.', data, page, pageSize, total));
  });
}

// --- Role assignments -----------------------------------------------------------------------

export async function listRoleAssignmentsHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id, { required: false });
    assertEnterpriseAccess(req, enterpriseId);
    const { page, pageSize } = parsePaginationQuery(req.query);

    const { data, total } = await approvalsService.listRoleAssignments({
      enterpriseId,
      actorCode: optionalString(req.query.actor_code, 'actor_code'),
      roleCode: optionalString(req.query.role_code, 'role_code'),
      activeFlag: optionalString(req.query.active_flag, 'active_flag'),
      sortBy: req.query.sort_by,
      sortOrder: req.query.sort_order,
      page,
      pageSize
    });

    return sendOutcome(res, okList('Approval role assignments retrieved successfully.', data, page, pageSize, total));
  });
}

export async function createRoleAssignmentHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.body.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);
    requireString(req.body.actor_code, 'actor_code', { max: 100 });
    requireString(req.body.role_code, 'role_code', { max: 100 });
    const actor = resolveAuditActor(req);

    const result = await approvalsService.createRoleAssignment({ ...req.body, enterprise_id: enterpriseId }, actor);
    return sendOutcome(res, okMutation('Approval role assignment created successfully.', result, 201));
  });
}

export async function updateRoleAssignmentHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const guid = parseGuidParam(req.params.roleAssignmentGuid, 'roleAssignmentGuid');
    const existing = await approvalsService.getRoleAssignmentByGuid(guid);
    if (!existing) return sendOutcome(res, notFoundOutcome('Approval role assignment not found.'));
    assertEnterpriseAccess(req, existing.enterprise_id);
    const actor = resolveAuditActor(req);

    const result = await approvalsService.updateRoleAssignment(guid, req.body, actor);
    if (!result.updated) return sendOutcome(res, notFoundOutcome('Approval role assignment not found.'));
    return sendOutcome(res, okMutation('Approval role assignment updated successfully.', result));
  });
}

export async function setRoleAssignmentStatusHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const guid = parseGuidParam(req.params.roleAssignmentGuid, 'roleAssignmentGuid');
    const existing = await approvalsService.getRoleAssignmentByGuid(guid);
    if (!existing) return sendOutcome(res, notFoundOutcome('Approval role assignment not found.'));
    assertEnterpriseAccess(req, existing.enterprise_id);

    const activeFlag = req.body.active_flag ?? (req.body.active === false ? 'N' : 'Y');
    const actor = resolveAuditActor(req);

    const result = await approvalsService.setRoleAssignmentActiveFlag(guid, activeFlag, actor);
    if (!result.updated) return sendOutcome(res, notFoundOutcome('Approval role assignment not found.'));
    return sendOutcome(res, okMutation('Approval role assignment status updated successfully.', result));
  });
}

// --- Policies ---------------------------------------------------------------------------------

export async function listPoliciesHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id, { required: false });
    assertEnterpriseAccess(req, enterpriseId);
    const { page, pageSize } = parsePaginationQuery(req.query);

    const { data, total } = await approvalsService.listPolicies({
      enterpriseId,
      objectTypeCode: optionalString(req.query.object_type, 'object_type'),
      activeFlag: optionalString(req.query.active_flag, 'active_flag'),
      search: optionalString(req.query.search, 'search'),
      page,
      pageSize
    });

    return sendOutcome(res, okList('Approval policies retrieved successfully.', data, page, pageSize, total));
  });
}

export async function getPolicyHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const policyId = requirePositiveInt(req.params.policyId, 'policyId');
    const policy = await approvalsService.getPolicyById(policyId);
    if (!policy) return sendOutcome(res, notFoundOutcome('Approval policy not found.'));
    assertEnterpriseAccess(req, policy.enterprise_id);
    return sendOutcome(res, okGet('Approval policy retrieved successfully.', policy));
  });
}

export async function listPolicyStepsHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const policyId = requirePositiveInt(req.params.policyId, 'policyId');
    const policy = await approvalsService.getPolicyById(policyId);
    if (!policy) return sendOutcome(res, notFoundOutcome('Approval policy not found.'));
    assertEnterpriseAccess(req, policy.enterprise_id);

    const steps = await approvalsService.listPolicySteps(policyId);
    return sendOutcome(res, okGet('Approval policy steps retrieved successfully.', steps));
  });
}
