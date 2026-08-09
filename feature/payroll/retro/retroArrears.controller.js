/**
 * Retro + overpayment/arrears controller.
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
  parsePaginationQuery,
  requirePositiveInt,
  requireString,
  resolveAuditActor,
  resolveEnterpriseId,
  sendOutcome,
  withPayrollErrorHandling
} from '../shared/index.js';
import * as retroService from './retroArrears.service.js';

// --- Retro events --------------------------------------------------------------------------

export async function listRetroEventsHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id, { required: false });
    assertEnterpriseAccess(req, enterpriseId);
    const { page, pageSize } = parsePaginationQuery(req.query);

    const { data, total } = await retroService.listRetroEvents({
      enterpriseId,
      payrollId: optionalPositiveInt(req.query.payroll_id, 'payroll_id'),
      employeeId: optionalPositiveInt(req.query.employee_id, 'employee_id'),
      sourceRunId: optionalPositiveInt(req.query.source_run_id ?? req.query.run_id, 'run_id'),
      targetRunId: optionalPositiveInt(req.query.target_run_id, 'target_run_id'),
      statusCode: optionalString(req.query.status, 'status'),
      search: optionalString(req.query.search, 'search'),
      sortBy: req.query.sort_by,
      sortOrder: req.query.sort_order,
      page,
      pageSize
    });

    return sendOutcome(res, okList('Retro events retrieved successfully.', data, page, pageSize, total));
  });
}

export async function getRetroEventHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const retroEventId = requirePositiveInt(req.params.retroEventId, 'retroEventId');
    const event = await retroService.getRetroEventById(retroEventId);
    if (!event) return sendOutcome(res, notFoundOutcome('Retro event not found.'));
    assertEnterpriseAccess(req, event.enterprise_id);
    return sendOutcome(res, okGet('Retro event retrieved successfully.', event));
  });
}

export async function listRetroEventLinesHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const retroEventId = requirePositiveInt(req.params.retroEventId, 'retroEventId');
    const event = await retroService.getRetroEventById(retroEventId);
    if (!event) return sendOutcome(res, notFoundOutcome('Retro event not found.'));
    assertEnterpriseAccess(req, event.enterprise_id);

    const lines = await retroService.listRetroEventLines(retroEventId);
    return sendOutcome(res, okGet('Retro event lines retrieved successfully.', lines));
  });
}

export async function createRetroEventLineHandler(req, res) {
  return sendOutcome(res, failOutcome(retroService.addRetroEventLineUnsupportedMessage(), 400));
}

export async function createRetroEventHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.body.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);
    requirePositiveInt(req.body.payroll_id, 'payroll_id');
    requirePositiveInt(req.body.employee_id, 'employee_id');
    requirePositiveInt(req.body.source_run_id, 'source_run_id');
    requirePositiveInt(req.body.source_element_id, 'source_element_id');
    requireString(req.body.reason_code, 'reason_code', { max: 100 });
    const actor = resolveAuditActor(req);

    const outcome = await retroService.processCorrection({ ...req.body, enterprise_id: enterpriseId }, actor);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message));

    const event = await retroService.getRetroEventById(outcome.data.retro_event_id);
    return sendOutcome(res, okMutation(outcome.message, event ?? outcome.data, 201));
  });
}

export async function calculateRetroEventHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const retroEventId = requirePositiveInt(req.params.retroEventId, 'retroEventId');
    const comparison = await retroService.calculateRetroComparison(retroEventId);
    if (!comparison) return sendOutcome(res, notFoundOutcome('Retro event not found.'));
    assertEnterpriseAccess(req, comparison.event.enterprise_id);
    return sendOutcome(res, okGet('Retro event delta calculated from processed values.', comparison));
  });
}

/** PROCESS_CORRECTION already creates and processes the event atomically. */
export async function processRetroEventHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const retroEventId = requirePositiveInt(req.params.retroEventId, 'retroEventId');
    const result = await retroService.ensureRetroEventProcessed(retroEventId);
    if (!result) return sendOutcome(res, notFoundOutcome('Retro event not found.'));
    assertEnterpriseAccess(req, result.event.enterprise_id);

    if (result.already_processed) {
      return sendOutcome(res, okMutation('Retro event is already processed.', result.event));
    }
    return sendOutcome(
      res,
      failOutcome(
        'Retro events are processed atomically by PAY_RETRO_PROCESSING_PKG.PROCESS_CORRECTION at creation time.',
        400,
        result.event
      )
    );
  });
}

export async function reverseRetroEventHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const retroEventId = requirePositiveInt(req.params.retroEventId, 'retroEventId');
    const event = await retroService.getRetroEventById(retroEventId);
    if (!event) return sendOutcome(res, notFoundOutcome('Retro event not found.'));
    assertEnterpriseAccess(req, event.enterprise_id);

    const reason = requireString(req.body.reason, 'reason', { max: 4000 });
    const actor = resolveAuditActor(req);

    const outcome = await retroService.reverseRetroEvent(event.enterprise_id, retroEventId, reason, actor);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message));
    return sendOutcome(res, okMutation(outcome.message, outcome.data));
  });
}

export async function getRetroEventComparisonHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const retroEventId = requirePositiveInt(req.params.retroEventId, 'retroEventId');
    const event = await retroService.getRetroEventById(retroEventId);
    if (!event) return sendOutcome(res, notFoundOutcome('Retro event not found.'));
    assertEnterpriseAccess(req, event.enterprise_id);

    const comparison = {
      source_run_id: event.source_run_id,
      source_run_number: event.source_run_number,
      target_run_id: event.target_run_id,
      target_run_number: event.target_run_number,
      original_value: event.original_value,
      corrected_value: event.corrected_value,
      source_delta_value: event.source_delta_value,
      gross_delta_value: event.gross_delta_value,
      deduction_delta_value: event.deduction_delta_value,
      net_delta_value: event.net_delta_value,
      status_code: event.status_code
    };
    return sendOutcome(res, okGet('Retro event comparison retrieved successfully.', comparison));
  });
}

// --- Arrears --------------------------------------------------------------------------------

export async function listArrearsHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id, { required: false });
    assertEnterpriseAccess(req, enterpriseId);
    const { page, pageSize } = parsePaginationQuery(req.query);

    const { data, total } = await retroService.listArrears({
      enterpriseId,
      payrollId: optionalPositiveInt(req.query.payroll_id, 'payroll_id'),
      employeeId: optionalPositiveInt(req.params.employeeId ?? req.query.employee_id, 'employee_id'),
      retroEventId: optionalPositiveInt(req.query.retro_event_id, 'retro_event_id'),
      statusCode: optionalString(req.query.status, 'status'),
      sortBy: req.query.sort_by,
      sortOrder: req.query.sort_order,
      page,
      pageSize
    });

    return sendOutcome(res, okList('Arrears retrieved successfully.', data, page, pageSize, total));
  });
}

export async function getArrearHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const arrearId = requirePositiveInt(req.params.arrearId, 'arrearId');
    const arrear = await retroService.getArrearById(arrearId);
    if (!arrear) return sendOutcome(res, notFoundOutcome('Arrear not found.'));
    assertEnterpriseAccess(req, arrear.enterprise_id);
    return sendOutcome(res, okGet('Arrear retrieved successfully.', arrear));
  });
}

export async function createArrearHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.body.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);
    requirePositiveInt(req.body.payroll_id, 'payroll_id');
    requirePositiveInt(req.body.employee_id, 'employee_id');
    requirePositiveInt(req.body.original_source_run_id, 'original_source_run_id');
    requirePositiveInt(req.body.source_element_id, 'source_element_id');
    requireString(req.body.reason_code, 'reason_code', { max: 100 });
    const actor = resolveAuditActor(req);

    const outcome = await retroService.processNegativeRevision({ ...req.body, enterprise_id: enterpriseId }, actor);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message));

    const arrear = await retroService.getArrearById(outcome.data.arrear_id);
    return sendOutcome(res, okMutation(outcome.message, arrear ?? outcome.data, 201));
  });
}

export async function listArrearRecoveriesHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const arrearId = requirePositiveInt(req.params.arrearId, 'arrearId');
    const arrear = await retroService.getArrearById(arrearId);
    if (!arrear) return sendOutcome(res, notFoundOutcome('Arrear not found.'));
    assertEnterpriseAccess(req, arrear.enterprise_id);
    const { page, pageSize } = parsePaginationQuery(req.query);

    const { data, total } = await retroService.listArrearRecoveries(arrearId, { page, pageSize });
    return sendOutcome(res, okList('Arrears recoveries retrieved successfully.', data, page, pageSize, total));
  });
}

export async function createArrearRecoveryHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const arrearId = requirePositiveInt(req.params.arrearId, 'arrearId');
    const arrear = await retroService.getArrearById(arrearId);
    if (!arrear) return sendOutcome(res, notFoundOutcome('Arrear not found.'));
    assertEnterpriseAccess(req, arrear.enterprise_id);

    const runId = requirePositiveInt(req.body.run_id, 'run_id');
    const availableNetPay = req.body.available_net_pay;
    if (availableNetPay == null || Number.isNaN(Number(availableNetPay))) {
      return sendOutcome(res, failOutcome('available_net_pay is required and must be a number.'));
    }
    const actor = resolveAuditActor(req);

    const outcome = await retroService.createRecoveryEntry(arrear.enterprise_id, arrearId, runId, Number(availableNetPay), actor);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message));
    return sendOutcome(res, okMutation(outcome.message, outcome.data, 201));
  });
}

export async function finalizeArrearRecoveryHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const arrearId = requirePositiveInt(req.params.arrearId, 'arrearId');
    const recoveryId = requirePositiveInt(req.params.recoveryId, 'recoveryId');
    const arrear = await retroService.getArrearById(arrearId);
    if (!arrear) return sendOutcome(res, notFoundOutcome('Arrear not found.'));
    assertEnterpriseAccess(req, arrear.enterprise_id);
    const actor = resolveAuditActor(req);

    const outcome = await retroService.finalizeRecovery(arrear.enterprise_id, recoveryId, actor);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message));
    return sendOutcome(res, okMutation(outcome.message, outcome.data));
  });
}

/** recover = CREATE_RECOVERY_ENTRY then FINALIZE_RECOVERY in a single convenience call. */
export async function recoverArrearHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const arrearId = requirePositiveInt(req.params.arrearId, 'arrearId');
    const arrear = await retroService.getArrearById(arrearId);
    if (!arrear) return sendOutcome(res, notFoundOutcome('Arrear not found.'));
    assertEnterpriseAccess(req, arrear.enterprise_id);

    const runId = requirePositiveInt(req.body.run_id, 'run_id');
    const availableNetPay = req.body.available_net_pay;
    if (availableNetPay == null || Number.isNaN(Number(availableNetPay))) {
      return sendOutcome(res, failOutcome('available_net_pay is required and must be a number.'));
    }
    const actor = resolveAuditActor(req);

    const outcome = await retroService.recoverArrear(arrear.enterprise_id, arrearId, runId, Number(availableNetPay), actor);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message));
    return sendOutcome(res, okMutation(outcome.message, outcome.data));
  });
}

export async function reverseArrearRecoveryHandler(req, res) {
  return sendOutcome(res, failOutcome(retroService.noRecoveryReversalPackageMessage(), 400));
}

export async function closeArrearHandler(req, res) {
  return sendOutcome(res, failOutcome(retroService.noArrearCloseWithoutRecoveryPackageMessage(), 400));
}
