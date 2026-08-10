/**
 * TM → PAY payroll integration controllers.
 */

import { ValidationError } from '../../../utils/errors/index.js';
import {
  assertEnterpriseAccess,
  failOutcome,
  notFoundOutcome,
  okGet,
  okList,
  okMutation,
  optionalPositiveInt,
  optionalString,
  parsePaginationQuery,
  requireDate,
  requirePositiveInt,
  requireString,
  resolveAuditActor,
  resolveEnterpriseId,
  sendOutcome,
  withPayrollErrorHandling
} from '../shared/index.js';
import * as tm from './tmPayroll.service.js';

function mutationResult(outcome, httpStatus = 200) {
  if (!outcome.success) return failOutcome(outcome.message, 400, outcome.data);
  return okMutation(outcome.message, outcome.data, httpStatus, outcome.status);
}

// =====================================================================================
// Hourly rate policies
// =====================================================================================

export async function listHourlyRatePoliciesHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id, { required: false });
    assertEnterpriseAccess(req, enterpriseId);
    const { page, pageSize } = parsePaginationQuery(req.query);
    const { data, total } = await tm.listHourlyRatePolicies({
      enterpriseId,
      payrollId: optionalPositiveInt(req.query.payroll_id, 'payroll_id'),
      statusCode: optionalString(req.query.status, 'status'),
      sourceElementId: optionalPositiveInt(req.query.element_id, 'element_id'),
      search: optionalString(req.query.search, 'search'),
      sortBy: req.query.sort_by,
      sortOrder: req.query.sort_order,
      page,
      pageSize
    });
    return sendOutcome(res, okList('Hourly rate policies retrieved successfully.', data, page, pageSize, total));
  });
}

export async function getHourlyRatePolicyHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const policyId = requirePositiveInt(req.params.policyId, 'policyId');
    const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id, { required: false });
    const row = await tm.getHourlyRatePolicyById(policyId, enterpriseId);
    if (!row) return sendOutcome(res, notFoundOutcome('Hourly rate policy not found.'));
    assertEnterpriseAccess(req, row.enterprise_id);
    return sendOutcome(res, okGet('Hourly rate policy retrieved successfully.', row));
  });
}

function policyPayloadFromBody(body, { policyId = null, actor, defaults = {} } = {}) {
  return {
    hourlyRatePolicyId: policyId,
    enterpriseId: body.enterprise_id ?? defaults.enterprise_id,
    payrollId: body.payroll_id ?? defaults.payroll_id,
    policyCode: body.policy_code ?? defaults.policy_code,
    policyName: body.policy_name ?? defaults.policy_name,
    sourcePayrollElementId: body.source_payroll_element_id ?? defaults.source_payroll_element_id,
    sourceValueCode: body.source_value_code ?? defaults.source_value_code ?? 'PAY_VALUE',
    divisorMethodCode: body.divisor_method_code ?? defaults.divisor_method_code,
    fixedDivisor: body.fixed_divisor ?? defaults.fixed_divisor,
    standardHoursPerWeek: body.standard_hours_per_week ?? defaults.standard_hours_per_week,
    weeksPerYear: body.weeks_per_year ?? defaults.weeks_per_year,
    monthsPerYear: body.months_per_year ?? defaults.months_per_year,
    roundingScale: body.rounding_scale ?? defaults.rounding_scale,
    effectiveStartDate: body.effective_start_date
      ? requireDate(body.effective_start_date, 'effective_start_date')
      : defaults.effective_start_date
        ? new Date(defaults.effective_start_date)
        : null,
    effectiveEndDate: body.effective_end_date
      ? requireDate(body.effective_end_date, 'effective_end_date')
      : defaults.effective_end_date
        ? new Date(defaults.effective_end_date)
        : null,
    statusCode: body.status_code ?? body.status ?? defaults.status_code ?? 'DRAFT',
    description: body.description ?? defaults.description,
    actor
  };
}

export async function createHourlyRatePolicyHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.body.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);
    const actor = resolveAuditActor(req);
    const payload = policyPayloadFromBody(req.body, { actor });
    payload.enterpriseId = enterpriseId;
    requireString(payload.policyCode, 'policy_code');
    requireString(payload.policyName, 'policy_name');
    requirePositiveInt(payload.payrollId, 'payroll_id');
    requirePositiveInt(payload.sourcePayrollElementId, 'source_payroll_element_id');
    requireString(payload.divisorMethodCode, 'divisor_method_code');
    requireDate(payload.effectiveStartDate, 'effective_start_date');

    const outcome = await tm.upsertHourlyRatePolicy(payload);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message, 400, outcome.data));
    const created = await tm.getHourlyRatePolicyById(outcome.data.hourly_rate_policy_id);
    return sendOutcome(
      res,
      okMutation(outcome.message || 'Hourly rate policy saved successfully.', created ?? outcome.data, 201)
    );
  });
}

export async function updateHourlyRatePolicyHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const policyId = requirePositiveInt(req.params.policyId, 'policyId');
    const existing = await tm.getHourlyRatePolicyById(policyId);
    if (!existing) return sendOutcome(res, notFoundOutcome('Hourly rate policy not found.'));
    assertEnterpriseAccess(req, existing.enterprise_id);
    const actor = resolveAuditActor(req);
    const payload = policyPayloadFromBody(req.body, { policyId, actor, defaults: existing });
    payload.enterpriseId = existing.enterprise_id;
    requireString(payload.policyCode, 'policy_code');
    requireString(payload.policyName, 'policy_name');
    requirePositiveInt(payload.payrollId, 'payroll_id');
    requirePositiveInt(payload.sourcePayrollElementId, 'source_payroll_element_id');
    requireString(payload.divisorMethodCode, 'divisor_method_code');
    if (!payload.effectiveStartDate) {
      throw new ValidationError('effective_start_date is required', [
        { field: 'effective_start_date', message: 'effective_start_date is required' }
      ]);
    }

    const outcome = await tm.upsertHourlyRatePolicy(payload);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message, 400, outcome.data));
    const updated = await tm.getHourlyRatePolicyById(policyId);
    return sendOutcome(res, okMutation(outcome.message || 'Hourly rate policy updated successfully.', updated ?? outcome.data));
  });
}

export async function patchHourlyRatePolicyStatusHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const policyId = requirePositiveInt(req.params.policyId, 'policyId');
    const existing = await tm.getHourlyRatePolicyById(policyId);
    if (!existing) return sendOutcome(res, notFoundOutcome('Hourly rate policy not found.'));
    assertEnterpriseAccess(req, existing.enterprise_id);
    const statusCode = requireString(req.body.status_code ?? req.body.status, 'status_code');
    const actor = resolveAuditActor(req);
    const payload = policyPayloadFromBody(
      { ...existing, status_code: statusCode },
      { policyId, actor, defaults: existing }
    );
    payload.enterpriseId = existing.enterprise_id;
    payload.statusCode = statusCode;
    payload.effectiveStartDate = existing.effective_start_date
      ? new Date(existing.effective_start_date)
      : null;
    payload.effectiveEndDate = existing.effective_end_date
      ? new Date(existing.effective_end_date)
      : null;

    const outcome = await tm.upsertHourlyRatePolicy(payload);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message, 400, outcome.data));
    const updated = await tm.getHourlyRatePolicyById(policyId);
    return sendOutcome(res, okMutation(outcome.message || 'Hourly rate policy status updated.', updated ?? outcome.data));
  });
}

export async function resolveHourlyRateHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const policyId = requirePositiveInt(req.params.policyId, 'policyId');
    const existing = await tm.getHourlyRatePolicyById(policyId);
    if (!existing) return sendOutcome(res, notFoundOutcome('Hourly rate policy not found.'));
    assertEnterpriseAccess(req, existing.enterprise_id);
    const employeeId = requirePositiveInt(req.body.employee_id, 'employee_id');
    const effectiveDate = req.body.effective_date
      ? requireDate(req.body.effective_date, 'effective_date')
      : new Date();
    const outcome = await tm.previewEmployeeHourlyRate(policyId, employeeId, effectiveDate);
    return sendOutcome(res, mutationResult(outcome));
  });
}

export async function applyPolicyToMappingHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const policyId = requirePositiveInt(req.params.policyId, 'policyId');
    const existing = await tm.getHourlyRatePolicyById(policyId);
    if (!existing) return sendOutcome(res, notFoundOutcome('Hourly rate policy not found.'));
    assertEnterpriseAccess(req, existing.enterprise_id);
    const mappingId = requirePositiveInt(
      req.body.payroll_source_mapping_id ?? req.body.mapping_id,
      'payroll_source_mapping_id'
    );
    const mapping = await tm.getSourceMappingById(mappingId);
    if (!mapping) return sendOutcome(res, notFoundOutcome('Payroll source mapping not found.'));
    assertEnterpriseAccess(req, mapping.enterprise_id);
    const outcome = await tm.applyPolicyToSourceMapping(policyId, mappingId, resolveAuditActor(req));
    return sendOutcome(res, mutationResult(outcome));
  });
}

export async function validateHourlyRatePolicyHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const policyId = requirePositiveInt(req.params.policyId, 'policyId');
    const existing = await tm.getHourlyRatePolicyById(policyId);
    if (!existing) return sendOutcome(res, notFoundOutcome('Hourly rate policy not found.'));
    assertEnterpriseAccess(req, existing.enterprise_id);
    const effectiveDate = req.body.effective_date
      ? requireDate(req.body.effective_date, 'effective_date')
      : new Date();
    const outcome = await tm.validateHourlyRatePolicy(policyId, effectiveDate);
    return sendOutcome(res, mutationResult(outcome));
  });
}

// =====================================================================================
// Source mappings
// =====================================================================================

export async function listSourceMappingsHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id, { required: false });
    assertEnterpriseAccess(req, enterpriseId);
    const { page, pageSize } = parsePaginationQuery(req.query);
    const { data, total } = await tm.listSourceMappings({
      enterpriseId,
      payrollId: optionalPositiveInt(req.query.payroll_id, 'payroll_id'),
      sourceTypeCode: optionalString(req.query.source_type_code, 'source_type_code'),
      elementId: optionalPositiveInt(req.query.element_id, 'element_id'),
      statusCode: optionalString(req.query.status, 'status'),
      hourlyRatePolicyId: optionalPositiveInt(req.query.hourly_rate_policy_id, 'hourly_rate_policy_id'),
      search: optionalString(req.query.search, 'search'),
      sortBy: req.query.sort_by,
      sortOrder: req.query.sort_order,
      page,
      pageSize
    });
    return sendOutcome(res, okList('Payroll source mappings retrieved successfully.', data, page, pageSize, total));
  });
}

export async function getSourceMappingHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const mappingId = requirePositiveInt(req.params.mappingId, 'mappingId');
    const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id, { required: false });
    const row = await tm.getSourceMappingById(mappingId, enterpriseId);
    if (!row) return sendOutcome(res, notFoundOutcome('Payroll source mapping not found.'));
    assertEnterpriseAccess(req, row.enterprise_id);
    return sendOutcome(res, okGet('Payroll source mapping retrieved successfully.', row));
  });
}

function mappingPayloadFromBody(body, { mappingId = null, actor, defaults = {} } = {}) {
  return {
    payrollSourceMappingId: mappingId,
    enterpriseId: body.enterprise_id ?? defaults.enterprise_id,
    sourceTypeCode: body.source_type_code ?? defaults.source_type_code,
    sourceSubtypeCode: body.source_subtype_code ?? defaults.source_subtype_code,
    payrollId: body.payroll_id ?? defaults.payroll_id,
    payrollElementId: body.payroll_element_id ?? defaults.payroll_element_id,
    payrollSourceCode: body.payroll_source_code ?? defaults.payroll_source_code,
    calculationOwnerCode: body.calculation_owner_code ?? defaults.calculation_owner_code,
    transferUnitCode: body.transfer_unit_code ?? defaults.transfer_unit_code,
    hoursInputValueName: body.hours_input_value_name ?? defaults.hours_input_value_name,
    daysInputValueName: body.days_input_value_name ?? defaults.days_input_value_name,
    multiplierInputName: body.multiplier_input_name ?? defaults.multiplier_input_name,
    rateTypeInputName: body.rate_type_input_name ?? defaults.rate_type_input_name,
    sourceDateInputName: body.source_date_input_name ?? defaults.source_date_input_name,
    signMultiplier: body.sign_multiplier ?? defaults.sign_multiplier,
    defaultCurrencyCode: body.default_currency_code ?? defaults.default_currency_code,
    effectiveStartDate: body.effective_start_date
      ? requireDate(body.effective_start_date, 'effective_start_date')
      : defaults.effective_start_date
        ? new Date(defaults.effective_start_date)
        : null,
    effectiveEndDate: body.effective_end_date
      ? requireDate(body.effective_end_date, 'effective_end_date')
      : defaults.effective_end_date
        ? new Date(defaults.effective_end_date)
        : null,
    statusCode: body.status_code ?? body.status ?? defaults.status_code ?? 'ACTIVE',
    description: body.description ?? defaults.description,
    actor,
    hourlyRateInputValueName: body.hourly_rate_input_value_name ?? defaults.hourly_rate_input_value_name,
    hourlyRateSourceCode: body.hourly_rate_source_code ?? defaults.hourly_rate_source_code,
    hourlyRateFixedValue: body.hourly_rate_fixed_value ?? defaults.hourly_rate_fixed_value,
    hourlyRateSourceElementId: body.hourly_rate_source_element_id ?? defaults.hourly_rate_source_element_id,
    hourlyRateSourceValueCode: body.hourly_rate_source_value_code ?? defaults.hourly_rate_source_value_code,
    hourlyRateDivisor: body.hourly_rate_divisor ?? defaults.hourly_rate_divisor
  };
}

export async function createSourceMappingHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.body.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);
    const actor = resolveAuditActor(req);
    const payload = mappingPayloadFromBody(req.body, { actor });
    payload.enterpriseId = enterpriseId;
    requireString(payload.sourceTypeCode, 'source_type_code');
    requirePositiveInt(payload.payrollElementId, 'payroll_element_id');
    requireString(payload.transferUnitCode, 'transfer_unit_code');
    requireDate(payload.effectiveStartDate, 'effective_start_date');

    const outcome = await tm.upsertSourceMapping(payload);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message, 400, outcome.data));
    const created = await tm.getSourceMappingById(outcome.data.payroll_source_mapping_id);
    return sendOutcome(
      res,
      okMutation(outcome.message || 'Payroll source mapping saved successfully.', created ?? outcome.data, 201)
    );
  });
}

export async function updateSourceMappingHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const mappingId = requirePositiveInt(req.params.mappingId, 'mappingId');
    const existing = await tm.getSourceMappingById(mappingId);
    if (!existing) return sendOutcome(res, notFoundOutcome('Payroll source mapping not found.'));
    assertEnterpriseAccess(req, existing.enterprise_id);
    const actor = resolveAuditActor(req);
    const payload = mappingPayloadFromBody(req.body, { mappingId, actor, defaults: existing });
    payload.enterpriseId = existing.enterprise_id;
    requireString(payload.sourceTypeCode, 'source_type_code');
    requirePositiveInt(payload.payrollElementId, 'payroll_element_id');
    requireString(payload.transferUnitCode, 'transfer_unit_code');
    if (!payload.effectiveStartDate) {
      payload.effectiveStartDate = existing.effective_start_date
        ? new Date(existing.effective_start_date)
        : null;
    }

    const outcome = await tm.upsertSourceMapping(payload);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message, 400, outcome.data));
    const updated = await tm.getSourceMappingById(mappingId);
    return sendOutcome(res, okMutation(outcome.message || 'Payroll source mapping updated successfully.', updated ?? outcome.data));
  });
}

export async function patchSourceMappingStatusHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const mappingId = requirePositiveInt(req.params.mappingId, 'mappingId');
    const existing = await tm.getSourceMappingById(mappingId);
    if (!existing) return sendOutcome(res, notFoundOutcome('Payroll source mapping not found.'));
    assertEnterpriseAccess(req, existing.enterprise_id);
    const statusCode = requireString(req.body.status_code ?? req.body.status, 'status_code');
    const actor = resolveAuditActor(req);
    const payload = mappingPayloadFromBody(
      { status_code: statusCode },
      { mappingId, actor, defaults: existing }
    );
    payload.enterpriseId = existing.enterprise_id;
    payload.statusCode = statusCode;
    payload.effectiveStartDate = existing.effective_start_date
      ? new Date(existing.effective_start_date)
      : null;
    payload.effectiveEndDate = existing.effective_end_date
      ? new Date(existing.effective_end_date)
      : null;

    const outcome = await tm.upsertSourceMapping(payload);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message, 400, outcome.data));
    const updated = await tm.getSourceMappingById(mappingId);
    return sendOutcome(res, okMutation(outcome.message || 'Payroll source mapping status updated.', updated ?? outcome.data));
  });
}

// =====================================================================================
// Production hourly rate on mappings
// =====================================================================================

export async function productionReadinessHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const mappingId = requirePositiveInt(req.params.mappingId, 'mappingId');
    const mapping = await tm.getSourceMappingById(mappingId);
    if (!mapping) return sendOutcome(res, notFoundOutcome('Payroll source mapping not found.'));
    assertEnterpriseAccess(req, mapping.enterprise_id);
    const outcome = await tm.validateProductionReadiness({
      payrollSourceMappingId: mappingId,
      hourlyRatePolicyId: optionalPositiveInt(
        req.body.hourly_rate_policy_id ?? mapping.hourly_rate_policy_id,
        'hourly_rate_policy_id'
      ),
      referenceEmployeeId: requirePositiveInt(req.body.reference_employee_id ?? req.body.employee_id, 'reference_employee_id'),
      effectiveDate: req.body.effective_date
        ? requireDate(req.body.effective_date, 'effective_date')
        : new Date(),
      actor: resolveAuditActor(req)
    });
    return sendOutcome(res, mutationResult(outcome));
  });
}

export async function activateProductionHourlyRateHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const mappingId = requirePositiveInt(req.params.mappingId, 'mappingId');
    const mapping = await tm.getSourceMappingById(mappingId);
    if (!mapping) return sendOutcome(res, notFoundOutcome('Payroll source mapping not found.'));
    assertEnterpriseAccess(req, mapping.enterprise_id);
    const outcome = await tm.activateProductionHourlyRate({
      payrollSourceMappingId: mappingId,
      hourlyRatePolicyId: optionalPositiveInt(
        req.body.hourly_rate_policy_id ?? mapping.hourly_rate_policy_id,
        'hourly_rate_policy_id'
      ),
      referenceEmployeeId: requirePositiveInt(req.body.reference_employee_id ?? req.body.employee_id, 'reference_employee_id'),
      effectiveDate: req.body.effective_date
        ? requireDate(req.body.effective_date, 'effective_date')
        : new Date(),
      actor: resolveAuditActor(req)
    });
    return sendOutcome(res, mutationResult(outcome));
  });
}

export async function deactivateProductionHourlyRateHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const mappingId = requirePositiveInt(req.params.mappingId, 'mappingId');
    const mapping = await tm.getSourceMappingById(mappingId);
    if (!mapping) return sendOutcome(res, notFoundOutcome('Payroll source mapping not found.'));
    assertEnterpriseAccess(req, mapping.enterprise_id);
    const reason = requireString(req.body.reason ?? req.body.reversal_reason, 'reason');
    const outcome = await tm.deactivateProductionHourlyRate(mappingId, reason, resolveAuditActor(req));
    return sendOutcome(res, mutationResult(outcome));
  });
}

export async function listHourlyRateHistoryHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const mappingId = requirePositiveInt(req.params.mappingId, 'mappingId');
    const mapping = await tm.getSourceMappingById(mappingId);
    if (!mapping) return sendOutcome(res, notFoundOutcome('Payroll source mapping not found.'));
    assertEnterpriseAccess(req, mapping.enterprise_id);
    const { page, pageSize } = parsePaginationQuery(req.query);
    const { data, total } = await tm.listHourlyRateActivationHistory({
      enterpriseId: mapping.enterprise_id,
      payrollSourceMappingId: mappingId,
      actionCode: optionalString(req.query.action_code, 'action_code'),
      page,
      pageSize
    });
    return sendOutcome(
      res,
      okList('Hourly rate activation history retrieved successfully.', data, page, pageSize, total)
    );
  });
}

// =====================================================================================
// Transfer batches / lines
// =====================================================================================

export async function listTransferBatchesHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id, { required: false });
    assertEnterpriseAccess(req, enterpriseId);
    const { page, pageSize } = parsePaginationQuery(req.query);
    const { data, total } = await tm.listTransferBatches({
      enterpriseId,
      payrollId: optionalPositiveInt(req.query.payroll_id, 'payroll_id'),
      runId: optionalPositiveInt(req.query.run_id, 'run_id'),
      statusCode: optionalString(req.query.status, 'status'),
      reconciliationStatusCode: optionalString(req.query.reconciliation_status, 'reconciliation_status'),
      dateFrom: req.query.date_from ? requireDate(req.query.date_from, 'date_from') : null,
      dateTo: req.query.date_to ? requireDate(req.query.date_to, 'date_to') : null,
      search: optionalString(req.query.search, 'search'),
      sortBy: req.query.sort_by,
      sortOrder: req.query.sort_order,
      page,
      pageSize
    });
    return sendOutcome(res, okList('Transfer batches retrieved successfully.', data, page, pageSize, total));
  });
}

export async function getTransferBatchHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const batchId = requirePositiveInt(req.params.batchId, 'batchId');
    const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id, { required: false });
    const row = await tm.getTransferBatchById(batchId, enterpriseId);
    if (!row) return sendOutcome(res, notFoundOutcome('Transfer batch not found.'));
    assertEnterpriseAccess(req, row.enterprise_id);
    return sendOutcome(res, okGet('Transfer batch retrieved successfully.', row));
  });
}

export async function createTransferBatchHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.body.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);
    const outcome = await tm.createTransferBatch({
      enterpriseId,
      payrollId: requirePositiveInt(req.body.payroll_id, 'payroll_id'),
      periodStartDate: requireDate(req.body.period_start_date, 'period_start_date'),
      periodEndDate: requireDate(req.body.period_end_date, 'period_end_date'),
      transferBatchNumber: optionalString(req.body.transfer_batch_number, 'transfer_batch_number'),
      actor: resolveAuditActor(req)
    });
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message, 400, outcome.data));
    const created = await tm.getTransferBatchById(outcome.data.payroll_transfer_batch_id);
    return sendOutcome(
      res,
      okMutation(outcome.message || 'Transfer batch created successfully.', created ?? outcome.data, 201)
    );
  });
}

async function withBatchTenant(batchId, req) {
  const batch = await tm.getTransferBatchById(batchId);
  if (!batch) return { error: notFoundOutcome('Transfer batch not found.') };
  assertEnterpriseAccess(req, batch.enterprise_id);
  return { batch };
}

export async function previewTransferBatchHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const batchId = requirePositiveInt(req.params.batchId, 'batchId');
    const { error } = await withBatchTenant(batchId, req);
    if (error) return sendOutcome(res, error);
    const outcome = await tm.previewTransferBatch(batchId, resolveAuditActor(req));
    return sendOutcome(res, mutationResult(outcome));
  });
}

export async function validateTransferBatchHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const batchId = requirePositiveInt(req.params.batchId, 'batchId');
    const { error } = await withBatchTenant(batchId, req);
    if (error) return sendOutcome(res, error);
    const outcome = await tm.validateTransferBatch(batchId, resolveAuditActor(req));
    return sendOutcome(res, mutationResult(outcome));
  });
}

export async function transferBatchHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const batchId = requirePositiveInt(req.params.batchId, 'batchId');
    const { error } = await withBatchTenant(batchId, req);
    if (error) return sendOutcome(res, error);
    const outcome = await tm.transferBatchToPayroll(batchId, resolveAuditActor(req));
    return sendOutcome(res, mutationResult(outcome));
  });
}

export async function reconcileTransferBatchHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const batchId = requirePositiveInt(req.params.batchId, 'batchId');
    const { error } = await withBatchTenant(batchId, req);
    if (error) return sendOutcome(res, error);
    const outcome = await tm.reconcileTransferBatch(batchId, resolveAuditActor(req));
    return sendOutcome(res, mutationResult(outcome));
  });
}

export async function lockTransferBatchHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const batchId = requirePositiveInt(req.params.batchId, 'batchId');
    const { error } = await withBatchTenant(batchId, req);
    if (error) return sendOutcome(res, error);
    const outcome = await tm.lockTransferBatch(batchId, resolveAuditActor(req));
    return sendOutcome(res, mutationResult(outcome));
  });
}

export async function reverseTransferBatchHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const batchId = requirePositiveInt(req.params.batchId, 'batchId');
    const { error } = await withBatchTenant(batchId, req);
    if (error) return sendOutcome(res, error);
    const reason = requireString(req.body.reversal_reason ?? req.body.reason, 'reversal_reason');
    const outcome = await tm.reverseTransferBatch(batchId, reason, resolveAuditActor(req));
    return sendOutcome(res, mutationResult(outcome));
  });
}

export async function listTransferBatchLinesHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const batchId = requirePositiveInt(req.params.batchId, 'batchId');
    const { batch, error } = await withBatchTenant(batchId, req);
    if (error) return sendOutcome(res, error);
    const { page, pageSize } = parsePaginationQuery(req.query);
    const { data, total } = await tm.listTransferLines({
      enterpriseId: batch.enterprise_id,
      payrollTransferBatchId: batchId,
      employeeId: optionalPositiveInt(req.query.employee_id, 'employee_id'),
      statusCode: optionalString(req.query.status, 'status'),
      search: optionalString(req.query.search, 'search'),
      page,
      pageSize
    });
    return sendOutcome(res, okList('Transfer lines retrieved successfully.', data, page, pageSize, total));
  });
}

export async function listTransferBatchHistoryHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const batchId = requirePositiveInt(req.params.batchId, 'batchId');
    const { error } = await withBatchTenant(batchId, req);
    if (error) return sendOutcome(res, error);
    const { page, pageSize } = parsePaginationQuery(req.query);
    const { data, total } = await tm.listTransferHistory({
      payrollTransferBatchId: batchId,
      actionCode: optionalString(req.query.action_code, 'action_code'),
      page,
      pageSize
    });
    return sendOutcome(res, okList('Transfer history retrieved successfully.', data, page, pageSize, total));
  });
}

export async function getTransferLineHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const lineId = requirePositiveInt(req.params.lineId, 'lineId');
    const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id, { required: false });
    const row = await tm.getTransferLineById(lineId, enterpriseId);
    if (!row) return sendOutcome(res, notFoundOutcome('Transfer line not found.'));
    assertEnterpriseAccess(req, row.enterprise_id);
    return sendOutcome(res, okGet('Transfer line retrieved successfully.', row));
  });
}

export async function retryTransferLineHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const lineId = requirePositiveInt(req.params.lineId, 'lineId');
    const line = await tm.getTransferLineById(lineId);
    if (!line) return sendOutcome(res, notFoundOutcome('Transfer line not found.'));
    assertEnterpriseAccess(req, line.enterprise_id);
    const outcome = await tm.retryTransferLine(lineId, resolveAuditActor(req));
    return sendOutcome(res, mutationResult(outcome));
  });
}

export async function reverseTransferLineHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const lineId = requirePositiveInt(req.params.lineId, 'lineId');
    const line = await tm.getTransferLineById(lineId);
    if (!line) return sendOutcome(res, notFoundOutcome('Transfer line not found.'));
    assertEnterpriseAccess(req, line.enterprise_id);
    const reason = requireString(req.body.reversal_reason ?? req.body.reason, 'reversal_reason');
    const outcome = await tm.reverseTransferLine(lineId, reason, resolveAuditActor(req));
    return sendOutcome(res, mutationResult(outcome));
  });
}

// Dashboard / audit helpers (also mounted under /dashboard and /audit)
export async function dashboardTransfersHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);
    const { page, pageSize } = parsePaginationQuery(req.query);
    const { data, total } = await tm.dashboardTransferSummary({
      enterpriseId,
      payrollId: optionalPositiveInt(req.query.payroll_id, 'payroll_id'),
      statusCode: optionalString(req.query.status, 'status'),
      page,
      pageSize
    });
    return sendOutcome(res, okList('Time-payroll transfers retrieved successfully.', data, page, pageSize, total));
  });
}

export async function dashboardTransferExceptionsHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);
    const { page, pageSize } = parsePaginationQuery(req.query);
    const { data, total } = await tm.dashboardTransferExceptions({
      enterpriseId,
      payrollId: optionalPositiveInt(req.query.payroll_id, 'payroll_id'),
      page,
      pageSize
    });
    return sendOutcome(res, okList('Transfer exceptions retrieved successfully.', data, page, pageSize, total));
  });
}

export async function dashboardHourlyRateReadinessHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);
    const { page, pageSize } = parsePaginationQuery(req.query);
    const { data, total } = await tm.dashboardHourlyRateReadiness({
      enterpriseId,
      payrollId: optionalPositiveInt(req.query.payroll_id, 'payroll_id'),
      statusCode: optionalString(req.query.status, 'status'),
      page,
      pageSize
    });
    return sendOutcome(res, okList('Hourly rate readiness retrieved successfully.', data, page, pageSize, total));
  });
}

export async function auditTransferHistoryHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const { page, pageSize } = parsePaginationQuery(req.query);
    let batchId = optionalPositiveInt(req.query.transfer_batch_id ?? req.query.batch_id, 'transfer_batch_id');
    const runId = optionalPositiveInt(req.params.runId ?? req.query.run_id, 'runId');

    // When scoped by payroll run, resolve matching TM transfer batches first.
    if (!batchId && runId) {
      const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id, { required: false });
      const { data: batches } = await tm.listTransferBatches({
        enterpriseId,
        runId,
        page: 1,
        pageSize: 100
      });
      if (!batches.length) {
        return sendOutcome(res, okList('Time-payroll transfer history retrieved successfully.', [], page, pageSize, 0));
      }
      // Return history for the first matching batch when a single batch is typical;
      // clients can also pass transfer_batch_id explicitly.
      batchId = batches[0].payroll_transfer_batch_id;
    }

    const { data, total } = await tm.listTransferHistory({
      payrollTransferBatchId: batchId,
      payrollTransferLineId: optionalPositiveInt(req.query.transfer_line_id ?? req.query.line_id, 'transfer_line_id'),
      actionCode: optionalString(req.query.action_code, 'action_code'),
      page,
      pageSize
    });
    return sendOutcome(res, okList('Time-payroll transfer history retrieved successfully.', data, page, pageSize, total));
  });
}

export async function auditHourlyRateActivationHistoryHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id, { required: false });
    assertEnterpriseAccess(req, enterpriseId);
    const { page, pageSize } = parsePaginationQuery(req.query);
    const { data, total } = await tm.listHourlyRateActivationHistory({
      enterpriseId,
      payrollSourceMappingId: optionalPositiveInt(req.query.mapping_id, 'mapping_id'),
      hourlyRatePolicyId: optionalPositiveInt(req.query.hourly_rate_policy_id, 'hourly_rate_policy_id'),
      actionCode: optionalString(req.query.action_code, 'action_code'),
      page,
      pageSize
    });
    return sendOutcome(
      res,
      okList('Hourly rate activation history retrieved successfully.', data, page, pageSize, total)
    );
  });
}
