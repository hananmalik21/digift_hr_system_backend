/**
 * Business logic for payslips.
 *
 * IMPORTANT: PAY.PAY_PAYROLL_CLOSE_PKG only exposes run-level PUBLISH_PAYSLIPS
 * — there is no single-payslip publish procedure in Oracle. The
 * `POST /payslips/:payslipId/publish` endpoint below resolves the payslip's
 * RUN_ID and republishes the whole run on its behalf; the response message
 * makes this explicit so callers aren't surprised by the broader side effect.
 */

import { okList, okGet, okMutation, failOutcome, notFoundOutcome, resolveAuditActor } from '../../shared/index.js';
import { requirePositiveInt, parsePaginationQuery, resolveEnterpriseId } from '../../shared/index.js';
import * as model from '../model/payPayslipModel.js';

function packageOutcome(result, { successStatus = 200, failureStatus = 400 } = {}) {
  if (result.success) return okMutation(result.message, result.data, successStatus);
  return failOutcome(result.message, failureStatus, result.data);
}

export async function listPayslipsService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const { page, pageSize } = parsePaginationQuery(req.query);
  const { data, total } = await model.listPayslips({
    enterpriseId,
    page,
    pageSize,
    runId: req.query.run_id,
    employeeId: req.query.employee_id,
    statusCode: req.query.status_code,
    paymentStatusCode: req.query.payment_status_code,
    sortBy: req.query.sort_by,
    sortOrder: req.query.sort_order,
    search: req.query.search
  });
  return okList('Payslips retrieved successfully.', data, page, pageSize, total);
}

export async function getPayslipService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const payslipId = requirePositiveInt(req.params.payslipId, 'payslipId');
  const payslip = await model.getPayslipById(enterpriseId, payslipId);
  if (!payslip) return notFoundOutcome('Payslip not found.');
  return okGet('Payslip retrieved successfully.', payslip);
}

export async function listPayslipLinesService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const payslipId = requirePositiveInt(req.params.payslipId, 'payslipId');
  const payslip = await model.getPayslipById(enterpriseId, payslipId);
  if (!payslip) return notFoundOutcome('Payslip not found.');
  const { page, pageSize } = parsePaginationQuery(req.query);
  const { data, total } = await model.listPayslipLines({ payslipId, page, pageSize });
  return okList('Payslip lines retrieved successfully.', data, page, pageSize, total);
}

export async function getPayslipDocumentDataService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const payslipId = requirePositiveInt(req.params.payslipId, 'payslipId');
  const payslip = await model.getPayslipById(enterpriseId, payslipId);
  if (!payslip) return notFoundOutcome('Payslip not found.');
  return okGet('Payslip document data retrieved successfully.', {
    payslip_id: payslip.payslip_id,
    payslip_number: payslip.payslip_number,
    document_data: payslip.payslip_snapshot_json
  });
}

export async function generatePayslipsService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const runId = requirePositiveInt(req.params.runId, 'runId');
  const generatedBy = resolveAuditActor(req);
  const result = await model.generatePayslips({ enterpriseId, runId, generatedBy });
  return packageOutcome(result, { successStatus: 201 });
}

export async function publishRunPayslipsService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const runId = requirePositiveInt(req.params.runId, 'runId');
  const publishedBy = resolveAuditActor(req);
  const result = await model.publishPayslips({ enterpriseId, runId, publishedBy });
  return packageOutcome(result);
}

export async function publishSinglePayslipService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const payslipId = requirePositiveInt(req.params.payslipId, 'payslipId');
  const payslip = await model.getPayslipById(enterpriseId, payslipId);
  if (!payslip) return notFoundOutcome('Payslip not found.');
  const publishedBy = resolveAuditActor(req);
  const result = await model.publishPayslips({ enterpriseId, runId: payslip.run_id, publishedBy });
  // Oracle only supports run-level publish; be explicit that the whole run was published.
  const message = result.success
    ? `Published all payslips for run ${payslip.run_number ?? payslip.run_id} (Oracle has no single-payslip publish). ${result.message}`
    : result.message;
  return packageOutcome({ ...result, message });
}

export async function listEmployeePayslipsService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const employeeId = requirePositiveInt(req.params.employeeId, 'employeeId');
  const { page, pageSize } = parsePaginationQuery(req.query);
  const { data, total } = await model.listEmployeePayslips({
    enterpriseId,
    employeeId,
    page,
    pageSize,
    sortBy: req.query.sort_by,
    sortOrder: req.query.sort_order
  });
  return okList('Employee payslips retrieved successfully.', data, page, pageSize, total);
}
