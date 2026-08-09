/**
 * Approval workflow routes.
 * Mounted at /api/payroll → /approvals
 */

import express from 'express';
import {
  approveStepHandler,
  assertApprovedHandler,
  createApprovalRequestHandler,
  createRoleAssignmentHandler,
  getApprovalRequestHandler,
  getPolicyHandler,
  isApprovedHandler,
  listApprovalActionsHandler,
  listApprovalRequestsHandler,
  listApprovalStepsHandler,
  listPendingApprovalsHandler,
  listPoliciesHandler,
  listPolicyStepsHandler,
  listRoleAssignmentsHandler,
  rejectRequestHandler,
  setRoleAssignmentStatusHandler,
  updateRoleAssignmentHandler,
  withdrawRequestHandler
} from './approvals.controller.js';

const router = express.Router();
const approvalsRouter = express.Router({ mergeParams: true });

// Roles
approvalsRouter.get('/roles', listRoleAssignmentsHandler);
approvalsRouter.post('/roles', createRoleAssignmentHandler);
approvalsRouter.put('/roles/:roleAssignmentGuid', updateRoleAssignmentHandler);
approvalsRouter.patch('/roles/:roleAssignmentGuid/status', setRoleAssignmentStatusHandler);

// Policies
approvalsRouter.get('/policies', listPoliciesHandler);
approvalsRouter.get('/policies/:policyId', getPolicyHandler);
approvalsRouter.get('/policies/:policyId/steps', listPolicyStepsHandler);

// Requests
approvalsRouter.post('/requests', createApprovalRequestHandler);
approvalsRouter.get('/requests', listApprovalRequestsHandler);
approvalsRouter.get('/requests/:requestId', getApprovalRequestHandler);
approvalsRouter.get('/requests/:requestId/steps', listApprovalStepsHandler);
approvalsRouter.get('/requests/:requestId/actions', listApprovalActionsHandler);
approvalsRouter.post('/requests/:requestId/approve', approveStepHandler);
approvalsRouter.post('/requests/:requestId/reject', rejectRequestHandler);
approvalsRouter.post('/requests/:requestId/withdraw', withdrawRequestHandler);

// Status helpers
approvalsRouter.get('/pending', listPendingApprovalsHandler);
approvalsRouter.get('/status', isApprovedHandler);
approvalsRouter.post('/assert', assertApprovedHandler);

router.use('/approvals', approvalsRouter);

export default router;
