/**
 * Payroll audit trail service.
 */
import { okGet, okList } from '../../shared/index.js';
import {
  getRunAuditTrail,
  listApprovalActions,
  listGlHistory,
  listOperationEvents,
  listPayrollCloseHistory,
  listPaymentHistory,
  listStatutoryAudit
} from '../model/payAuditModel.js';

export async function getPaymentHistory(filters) {
  const { data, total, page, pageSize } = await listPaymentHistory(filters);
  return okList('Payment status history retrieved successfully.', data, page, pageSize, total);
}

export async function getGlHistory(filters) {
  const { data, total, page, pageSize } = await listGlHistory(filters);
  return okList('GL journal status history retrieved successfully.', data, page, pageSize, total);
}

export async function getPayrollCloseHistory(filters) {
  const { data, total, page, pageSize } = await listPayrollCloseHistory(filters);
  return okList('Payroll close history retrieved successfully.', data, page, pageSize, total);
}

export async function getApprovalActions(filters) {
  const { data, total, page, pageSize } = await listApprovalActions(filters);
  return okList('Approval actions retrieved successfully.', data, page, pageSize, total);
}

export async function getStatutoryHistory(filters) {
  const { data, total, page, pageSize } = await listStatutoryAudit(filters);
  return okList('Statutory audit history retrieved successfully.', data, page, pageSize, total);
}

export async function getOperationEvents(filters) {
  const { data, total, page, pageSize } = await listOperationEvents(filters);
  return okList('Operation events retrieved successfully.', data, page, pageSize, total);
}

export async function getRunAudit(runId) {
  const data = await getRunAuditTrail(runId);
  return okGet('Run audit trail retrieved successfully.', data);
}
