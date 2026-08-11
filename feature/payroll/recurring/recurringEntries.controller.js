/**
 * Recurring element entries controller.
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
  requireDate,
  requirePositiveInt,
  requireString,
  requireYn,
  resolveAuditActor,
  resolveEnterpriseId,
  sendOutcome,
  withPayrollErrorHandling
} from '../shared/index.js';
import * as recurringService from './recurringEntries.service.js';

export async function listRecurringEntriesHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id, { required: false });
    assertEnterpriseAccess(req, enterpriseId);
    const { page, pageSize } = parsePaginationQuery(req.query);

    const { data, total } = await recurringService.listRecurringEntries({
      enterpriseId,
      employeeId: optionalPositiveInt(req.query.employee_id, 'employee_id'),
      payrollId: optionalPositiveInt(req.query.payroll_id, 'payroll_id'),
      elementId: optionalPositiveInt(req.query.element_id, 'element_id'),
      templateCode: optionalString(req.query.template_code, 'template_code'),
      statusCode: optionalString(req.query.status, 'status'),
      approvalStatusCode: optionalString(req.query.approval_status, 'approval_status'),
      search: optionalString(req.query.search, 'search'),
      sortBy: req.query.sort_by,
      sortOrder: req.query.sort_order,
      page,
      pageSize
    });

    return sendOutcome(res, okList('Recurring entries retrieved successfully.', data, page, pageSize, total));
  });
}

export async function getRecurringEntryHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const guid = parseGuidParam(req.params.recurringEntryGuid, 'recurringEntryGuid');
    const entry = await recurringService.getRecurringEntryByGuid(guid);
    if (!entry) return sendOutcome(res, notFoundOutcome('Recurring entry not found.'));
    assertEnterpriseAccess(req, entry.enterprise_id);
    return sendOutcome(res, okGet('Recurring entry retrieved successfully.', entry));
  });
}

export async function createRecurringEntryHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.body.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);
    const actor = resolveAuditActor(req);
    const payload = { ...req.body, enterprise_id: enterpriseId };
    delete payload.recurring_entry_guid;

    const outcome = await recurringService.upsertRecurringEntry(payload, actor);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message));

    const created = await recurringService.getRecurringEntryByGuid(outcome.data.recurring_entry_guid);
    return sendOutcome(res, okMutation(outcome.message, created ?? outcome.data, 201));
  });
}

export async function updateRecurringEntryHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const guid = parseGuidParam(req.params.recurringEntryGuid, 'recurringEntryGuid');
    const existing = await recurringService.getRecurringEntryByGuid(guid);
    if (!existing) return sendOutcome(res, notFoundOutcome('Recurring entry not found.'));
    assertEnterpriseAccess(req, existing.enterprise_id);
    const actor = resolveAuditActor(req);

    const payload = { ...req.body, enterprise_id: existing.enterprise_id, recurring_entry_guid: guid };
    const outcome = await recurringService.upsertRecurringEntry(payload, actor);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message));

    const updated = await recurringService.getRecurringEntryByGuid(guid);
    return sendOutcome(res, okMutation(outcome.message, updated ?? outcome.data));
  });
}

/** No hard-delete package exists; DELETE cancels the recurring entry via SET_STATUS. */
export async function deleteRecurringEntryHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const guid = parseGuidParam(req.params.recurringEntryGuid, 'recurringEntryGuid');
    const existing = await recurringService.getRecurringEntryByGuid(guid);
    if (!existing) return sendOutcome(res, notFoundOutcome('Recurring entry not found.'));
    assertEnterpriseAccess(req, existing.enterprise_id);
    const actor = resolveAuditActor(req);

    const outcome = await recurringService.setRecurringEntryStatus(guid, 'CANCELLED', null, actor);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message));
    return sendOutcome(res, okMutation('Recurring entry cancelled successfully.', outcome.data));
  });
}

export async function setRecurringEntryStatusHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const guid = parseGuidParam(req.params.recurringEntryGuid, 'recurringEntryGuid');
    const existing = await recurringService.getRecurringEntryByGuid(guid);
    if (!existing) return sendOutcome(res, notFoundOutcome('Recurring entry not found.'));
    assertEnterpriseAccess(req, existing.enterprise_id);

    const statusCode = requireString(req.body.status_code, 'status_code', { max: 30 });
    const effectiveEndDate = req.body.effective_end_date ? requireDate(req.body.effective_end_date, 'effective_end_date') : null;
    const actor = resolveAuditActor(req);

    const outcome = await recurringService.setRecurringEntryStatus(guid, statusCode, effectiveEndDate, actor);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message));
    return sendOutcome(res, okMutation(outcome.message, outcome.data));
  });
}

export async function setRecurringEntryProrationHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const guid = parseGuidParam(req.params.recurringEntryGuid, 'recurringEntryGuid');
    const existing = await recurringService.getRecurringEntryByGuid(guid);
    if (!existing) return sendOutcome(res, notFoundOutcome('Recurring entry not found.'));
    assertEnterpriseAccess(req, existing.enterprise_id);

    const prorationFlag = requireYn(req.body.proration_flag, 'proration_flag', 'N');
    const prorationMethodCode = optionalString(req.body.proration_method_code, 'proration_method_code', { max: 30 });
    const actor = resolveAuditActor(req);

    const outcome = await recurringService.setRecurringEntryProration(guid, prorationFlag, prorationMethodCode, actor);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message));
    return sendOutcome(res, okMutation(outcome.message, outcome.data));
  });
}

export async function previewGenerationHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.body.enterprise_id ?? req.query.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);
    const payrollId = optionalPositiveInt(req.body.payroll_id ?? req.query.payroll_id, 'payroll_id');

    const { data, total } = await recurringService.previewGeneration({ enterpriseId, payrollId });
    return sendOutcome(res, okList('Preview candidates retrieved successfully.', data, 1, data.length || 1, total));
  });
}

export async function generateForRunHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.body.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);
    const runId = requirePositiveInt(req.body.run_id, 'run_id');
    const actor = resolveAuditActor(req);

    const outcome = await recurringService.generateForRun(enterpriseId, runId, actor);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message));
    return sendOutcome(res, okMutation(outcome.message, outcome.data));
  });
}

export async function listGenerationLogsHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id, { required: false });
    assertEnterpriseAccess(req, enterpriseId);
    const { page, pageSize } = parsePaginationQuery(req.query);

    const { data, total } = await recurringService.listGenerationLogs({
      enterpriseId,
      runId: optionalPositiveInt(req.query.run_id, 'run_id'),
      recurringEntryId: optionalPositiveInt(req.query.recurring_entry_id, 'recurring_entry_id'),
      employeeId: optionalPositiveInt(req.query.employee_id, 'employee_id'),
      outcomeCode: optionalString(req.query.outcome, 'outcome'),
      sortBy: req.query.sort_by,
      sortOrder: req.query.sort_order,
      page,
      pageSize
    });

    return sendOutcome(res, okList('Generation logs retrieved successfully.', data, page, pageSize, total));
  });
}

export async function getGenerationLogHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const logId = requirePositiveInt(req.params.logId, 'logId');
    const log = await recurringService.getGenerationLogById(logId);
    if (!log) return sendOutcome(res, notFoundOutcome('Generation log not found.'));
    assertEnterpriseAccess(req, log.enterprise_id);
    return sendOutcome(res, okGet('Generation log retrieved successfully.', log));
  });
}

export async function listRecurringEntryInputsHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const guid = parseGuidParam(req.params.recurringEntryGuid, 'recurringEntryGuid');
    const entry = await recurringService.getRecurringEntryByGuid(guid);
    if (!entry) return sendOutcome(res, notFoundOutcome('Recurring entry not found.'));
    assertEnterpriseAccess(req, entry.enterprise_id);

    const inputs = await recurringService.listRecurringEntryInputs(guid);
    return sendOutcome(res, okGet('Recurring entry input values retrieved successfully.', inputs));
  });
}

export async function createRecurringEntryInputHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const guid = parseGuidParam(req.params.recurringEntryGuid, 'recurringEntryGuid');
    const entry = await recurringService.getRecurringEntryByGuid(guid);
    if (!entry) return sendOutcome(res, notFoundOutcome('Recurring entry not found.'));
    assertEnterpriseAccess(req, entry.enterprise_id);

    requirePositiveInt(req.body.input_value_id, 'input_value_id');
    requireString(req.body.input_value_name, 'input_value_name', { max: 100 });
    const actor = resolveAuditActor(req);

    const result = await recurringService.createRecurringEntryInput(guid, req.body, actor);
    if (result == null) return sendOutcome(res, notFoundOutcome('Recurring entry not found.'));
    return sendOutcome(res, okMutation('Recurring entry input value added successfully.', result, 201));
  });
}

export async function updateRecurringEntryInputHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const guid = parseGuidParam(req.params.recurringEntryGuid, 'recurringEntryGuid');
    const entry = await recurringService.getRecurringEntryByGuid(guid);
    if (!entry) return sendOutcome(res, notFoundOutcome('Recurring entry not found.'));
    assertEnterpriseAccess(req, entry.enterprise_id);

    const inputId = requirePositiveInt(req.params.inputId, 'inputId');
    const actor = resolveAuditActor(req);

    const result = await recurringService.updateRecurringEntryInput(guid, inputId, req.body, actor);
    if (result == null) return sendOutcome(res, notFoundOutcome('Recurring entry not found.'));
    if (!result.updated) return sendOutcome(res, notFoundOutcome('Recurring entry input value not found.'));
    return sendOutcome(res, okMutation('Recurring entry input value updated successfully.', result));
  });
}

export async function deleteRecurringEntryInputHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const guid = parseGuidParam(req.params.recurringEntryGuid, 'recurringEntryGuid');
    const entry = await recurringService.getRecurringEntryByGuid(guid);
    if (!entry) return sendOutcome(res, notFoundOutcome('Recurring entry not found.'));
    assertEnterpriseAccess(req, entry.enterprise_id);

    const inputId = requirePositiveInt(req.params.inputId, 'inputId');
    const result = await recurringService.deleteRecurringEntryInput(guid, inputId);
    if (result == null) return sendOutcome(res, notFoundOutcome('Recurring entry not found.'));
    if (!result.deleted) return sendOutcome(res, notFoundOutcome('Recurring entry input value not found.'));
    return sendOutcome(res, okMutation('Recurring entry input value deleted successfully.', result));
  });
}
