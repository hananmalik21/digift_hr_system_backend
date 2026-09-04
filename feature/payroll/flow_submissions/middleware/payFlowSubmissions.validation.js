/**
 * Request validation for PAY.PAY_PAYROLL_FLOW_SUBMISSIONS_PKG APIs.
 * Lightweight type/presence checks only — Oracle owns lifecycle and business rules.
 */

import {
  optionalDate,
  optionalOneOf,
  optionalPositiveInt,
  optionalString,
  requirePositiveInt,
  resolveOptionalActor,
  runPayrollValidation,
  scopedEnterpriseId,
  PAYROLL_RUN_TYPE_CODES
} from '../../shared/index.js';

function flowSubmissionIdParam(req) {
  return requirePositiveInt(req.params.flowSubmissionId, 'flow_submission_id');
}

function draftFields(body) {
  return {
    flow_id: requirePositiveInt(body.flow_id, 'flow_id'),
    schedule_code: optionalString(body.schedule_code, 'schedule_code', { max: 30 }),
    scheduled_date: optionalDate(body.scheduled_date, 'scheduled_date'),
    scope_code: optionalString(body.scope_code, 'scope_code', { max: 30 }),
    payroll_id: optionalPositiveInt(body.payroll_id, 'payroll_id'),
    period_start_date: optionalDate(body.period_start_date, 'period_start_date'),
    period_end_date: optionalDate(body.period_end_date, 'period_end_date'),
    payment_date: optionalDate(body.payment_date, 'payment_date'),
    consolidation_group_id: optionalPositiveInt(body.consolidation_group_id, 'consolidation_group_id'),
    run_type_code: optionalOneOf(body.run_type_code, 'run_type_code', PAYROLL_RUN_TYPE_CODES),
    payroll_group_id: optionalPositiveInt(body.payroll_group_id, 'payroll_group_id'),
    process_start_date: optionalDate(body.process_start_date, 'process_start_date'),
    process_end_date: optionalDate(body.process_end_date, 'process_end_date'),
    date_earned: optionalDate(body.date_earned, 'date_earned'),
    element_group_code: optionalString(body.element_group_code, 'element_group_code', { max: 50 }),
    report_category_code: optionalString(body.report_category_code, 'report_category_code', { max: 50 }),
    process_config_group_id: optionalPositiveInt(body.process_config_group_id, 'process_config_group_id'),
    run_mode_code: optionalString(body.run_mode_code, 'run_mode_code', { max: 30 })
  };
}

export function validateListSubmissions(req, res, next) {
  return runPayrollValidation(res, next, () => {
    req.validated = {
      enterprise_id: scopedEnterpriseId(req),
      // Oracle statuses include DRAFT, SUBMITTED, RUN_CREATED, COMPLETED, ROLLED_BACK, CANCELLED, ERROR.
      status_code: optionalString(req.query.status_code, 'status_code', { max: 30 }),
      payroll_id: req.query.payroll_id ? requirePositiveInt(req.query.payroll_id, 'payroll_id') : null
    };
  });
}

export function validateGetSubmission(req, res, next) {
  return runPayrollValidation(res, next, () => {
    req.validated = {
      enterprise_id: scopedEnterpriseId(req),
      flow_submission_id: flowSubmissionIdParam(req)
    };
  });
}

export function validateCreateDraft(req, res, next) {
  return runPayrollValidation(res, next, () => {
    const body = req.body || {};
    req.validated = {
      enterprise_id: scopedEnterpriseId(req, body.enterprise_id),
      ...draftFields(body),
      created_by: resolveOptionalActor(req, body, 'created_by')
    };
  });
}

export function validateUpdateDraft(req, res, next) {
  return runPayrollValidation(res, next, () => {
    const body = req.body || {};
    req.validated = {
      enterprise_id: scopedEnterpriseId(req, body.enterprise_id),
      flow_submission_id: flowSubmissionIdParam(req),
      ...draftFields(body),
      updated_by: resolveOptionalActor(req, body, 'updated_by')
    };
  });
}

export function validateSubmitFlow(req, res, next) {
  return runPayrollValidation(res, next, () => {
    const body = req.body || {};
    req.validated = {
      enterprise_id: scopedEnterpriseId(req, body.enterprise_id),
      flow_submission_id: flowSubmissionIdParam(req),
      submitted_by: resolveOptionalActor(req, body, 'submitted_by')
    };
  });
}

export function validateCancelSubmission(req, res, next) {
  return runPayrollValidation(res, next, () => {
    const body = req.body || {};
    req.validated = {
      enterprise_id: scopedEnterpriseId(req, body.enterprise_id),
      flow_submission_id: flowSubmissionIdParam(req),
      cancelled_by: resolveOptionalActor(req, body, 'cancelled_by')
    };
  });
}

export function validateDeleteDraft(req, res, next) {
  return runPayrollValidation(res, next, () => {
    req.validated = {
      enterprise_id: scopedEnterpriseId(req, req.body?.enterprise_id),
      flow_submission_id: flowSubmissionIdParam(req)
    };
  });
}

export function validateInitializeRunFromSubmission(req, res, next) {
  return runPayrollValidation(res, next, () => {
    const body = req.body || {};
    req.validated = {
      enterprise_id: scopedEnterpriseId(req, body.enterprise_id),
      flow_submission_id: flowSubmissionIdParam(req),
      created_by: resolveOptionalActor(req, body, 'created_by')
    };
  });
}
