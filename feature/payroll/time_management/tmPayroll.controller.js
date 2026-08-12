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

/** First non-nullish value across request body + existing-row defaults (supports REST aliases). */
function pickField(body, defaults, ...keys) {
  for (const key of keys) {
    if (body?.[key] != null && body[key] !== '') return body[key];
  }
  for (const key of keys) {
    if (defaults?.[key] != null && defaults[key] !== '') return defaults[key];
  }
  return null;
}

/** Prefer body date; otherwise coerce an existing ISO/date default. */
function dateFromBodyOrDefault(body, defaults, field) {
  if (body?.[field] != null && body[field] !== '') {
    return requireDate(body[field], field);
  }
  const fallback = defaults?.[field];
  if (fallback == null || fallback === '') return null;
  if (fallback instanceof Date) return fallback;
  return requireDate(fallback, field);
}

function requirePolicyWriteFields(payload) {
  requireString(payload.policyCode, 'policy_code');
  requireString(payload.policyName, 'policy_name');
  requirePositiveInt(payload.payrollId, 'payroll_id');
  requirePositiveInt(payload.sourcePayrollElementId, 'source_payroll_element_id');
  requireString(payload.divisorMethodCode, 'divisor_method_code');
}

function requireMappingWriteFields(payload) {
  requireString(payload.sourceTypeCode, 'source_type_code');
  requirePositiveInt(payload.payrollElementId, 'payroll_element_id');
  requireString(payload.transferUnitCode, 'transfer_unit_code');
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
    enterpriseId: pickField(body, defaults, 'enterprise_id'),
    payrollId: pickField(body, defaults, 'payroll_id'),
    policyCode: pickField(body, defaults, 'policy_code'),
    policyName: pickField(body, defaults, 'policy_name'),
    sourcePayrollElementId: pickField(body, defaults, 'source_payroll_element_id'),
    sourceValueCode: pickField(body, defaults, 'source_value_code') ?? 'PAY_VALUE',
    divisorMethodCode: pickField(body, defaults, 'divisor_method_code'),
    fixedDivisor: pickField(body, defaults, 'fixed_divisor'),
    standardHoursPerWeek: pickField(body, defaults, 'standard_hours_per_week'),
    weeksPerYear: pickField(body, defaults, 'weeks_per_year'),
    monthsPerYear: pickField(body, defaults, 'months_per_year'),
    roundingScale: pickField(body, defaults, 'rounding_scale'),
    effectiveStartDate: dateFromBodyOrDefault(body, defaults, 'effective_start_date'),
    effectiveEndDate: dateFromBodyOrDefault(body, defaults, 'effective_end_date'),
    statusCode: pickField(body, defaults, 'status_code', 'status') ?? 'DRAFT',
    description: pickField(body, defaults, 'description'),
    actor
  };
}

export async function createHourlyRatePolicyHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.body.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);
    const payload = policyPayloadFromBody(req.body, { actor: resolveAuditActor(req) });
    payload.enterpriseId = enterpriseId;
    requirePolicyWriteFields(payload);
    requireDate(payload.effectiveStartDate, 'effective_start_date');

    const outcome = await tm.createOrUpdateHourlyRatePolicy(payload);
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
    const payload = policyPayloadFromBody(req.body, {
      policyId,
      actor: resolveAuditActor(req),
      defaults: existing
    });
    payload.enterpriseId = existing.enterprise_id;
    requirePolicyWriteFields(payload);
    if (!payload.effectiveStartDate) {
      throw new ValidationError('effective_start_date is required', [
        { field: 'effective_start_date', message: 'effective_start_date is required' }
      ]);
    }

    const outcome = await tm.createOrUpdateHourlyRatePolicy(payload);
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
    const payload = policyPayloadFromBody(
      { ...existing, status_code: statusCode },
      { policyId, actor: resolveAuditActor(req), defaults: existing }
    );
    payload.enterpriseId = existing.enterprise_id;
    payload.statusCode = statusCode;
    payload.effectiveStartDate = dateFromBodyOrDefault({}, existing, 'effective_start_date');
    payload.effectiveEndDate = dateFromBodyOrDefault({}, existing, 'effective_end_date');

    const outcome = await tm.createOrUpdateHourlyRatePolicy(payload);
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
    enterpriseId: pickField(body, defaults, 'enterprise_id'),
    sourceTypeCode: pickField(body, defaults, 'source_type_code'),
    sourceSubtypeCode: pickField(body, defaults, 'source_subtype_code'),
    payrollId: pickField(body, defaults, 'payroll_id'),
    payrollElementId: pickField(body, defaults, 'payroll_element_id'),
    payrollSourceCode: pickField(body, defaults, 'payroll_source_code'),
    calculationOwnerCode: pickField(body, defaults, 'calculation_owner_code'),
    transferUnitCode: pickField(body, defaults, 'transfer_unit_code'),
    hoursInputValueName: pickField(body, defaults, 'hours_input_value_name'),
    daysInputValueName: pickField(body, defaults, 'days_input_value_name'),
    // REST/view: *_input_value_name → Oracle: P_*_INPUT_NAME
    multiplierInputName: pickField(
      body,
      defaults,
      'multiplier_input_name',
      'multiplier_input_value_name'
    ),
    rateTypeInputName: pickField(body, defaults, 'rate_type_input_name', 'rate_type_input_value_name'),
    sourceDateInputName: pickField(
      body,
      defaults,
      'source_date_input_name',
      'source_date_input_value_name'
    ),
    signMultiplier: pickField(body, defaults, 'sign_multiplier'),
    defaultCurrencyCode: pickField(body, defaults, 'default_currency_code'),
    effectiveStartDate: dateFromBodyOrDefault(body, defaults, 'effective_start_date'),
    effectiveEndDate: dateFromBodyOrDefault(body, defaults, 'effective_end_date'),
    statusCode: pickField(body, defaults, 'status_code', 'status') ?? 'ACTIVE',
    description: pickField(body, defaults, 'description'),
    actor,
    hourlyRateInputValueName: pickField(body, defaults, 'hourly_rate_input_value_name'),
    hourlyRateSourceCode: pickField(body, defaults, 'hourly_rate_source_code'),
    hourlyRateFixedValue: pickField(body, defaults, 'hourly_rate_fixed_value'),
    hourlyRateSourceElementId: pickField(body, defaults, 'hourly_rate_source_element_id'),
    hourlyRateSourceValueCode: pickField(body, defaults, 'hourly_rate_source_value_code'),
    hourlyRateDivisor: pickField(body, defaults, 'hourly_rate_divisor')
  };
}

export async function createSourceMappingHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.body.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);
    const payload = mappingPayloadFromBody(req.body, { actor: resolveAuditActor(req) });
    payload.enterpriseId = enterpriseId;
    requireMappingWriteFields(payload);
    requireDate(payload.effectiveStartDate, 'effective_start_date');

    const outcome = await tm.createOrUpdateSourceMapping(payload);
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
    const payload = mappingPayloadFromBody(req.body, {
      mappingId,
      actor: resolveAuditActor(req),
      defaults: existing
    });
    payload.enterpriseId = existing.enterprise_id;
    requireMappingWriteFields(payload);
    if (!payload.effectiveStartDate) {
      payload.effectiveStartDate = dateFromBodyOrDefault({}, existing, 'effective_start_date');
    }

    const outcome = await tm.createOrUpdateSourceMapping(payload);
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
    const payload = mappingPayloadFromBody(
      { status_code: statusCode },
      { mappingId, actor: resolveAuditActor(req), defaults: existing }
    );
    payload.enterpriseId = existing.enterprise_id;
    payload.statusCode = statusCode;
    payload.effectiveStartDate = dateFromBodyOrDefault({}, existing, 'effective_start_date');
    payload.effectiveEndDate = dateFromBodyOrDefault({}, existing, 'effective_end_date');

    const outcome = await tm.createOrUpdateSourceMapping(payload);
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
