/**
 * Request validation for PAY.PAY_PAYROLL_FLOWS_PKG APIs.
 */

import {
  PAYROLL_STATUS_VALUES,
  optionalOneOf,
  optionalString,
  requireOneOf,
  requirePositiveInt,
  requireString,
  resolveOptionalActor,
  runPayrollValidation,
  scopedEnterpriseId
} from '../../shared/index.js';

function flowIdParam(req) {
  return requirePositiveInt(req.params.flowId, 'flow_id');
}

function flowFields(body) {
  return {
    flow_name: requireString(body.flow_name, 'flow_name', { max: 200 }),
    flow_code: requireString(body.flow_code, 'flow_code', { max: 50 }),
    description: optionalString(body.description, 'description', { max: 4000 }),
    default_run_type_code: optionalString(body.default_run_type_code, 'default_run_type_code', { max: 30 }),
    default_run_mode_code: optionalString(body.default_run_mode_code, 'default_run_mode_code', { max: 30 }),
    default_schedule_code: optionalString(body.default_schedule_code, 'default_schedule_code', { max: 30 }),
    status: optionalOneOf(body.status, 'status', PAYROLL_STATUS_VALUES)
  };
}

export function validateListFlows(req, res, next) {
  return runPayrollValidation(res, next, () => {
    req.validated = {
      enterprise_id: scopedEnterpriseId(req),
      status: optionalOneOf(req.query.status, 'status', PAYROLL_STATUS_VALUES)
    };
  });
}

export function validateGetFlow(req, res, next) {
  return runPayrollValidation(res, next, () => {
    req.validated = { enterprise_id: scopedEnterpriseId(req), flow_id: flowIdParam(req) };
  });
}

export function validateCreateFlow(req, res, next) {
  return runPayrollValidation(res, next, () => {
    const body = req.body || {};
    req.validated = {
      enterprise_id: scopedEnterpriseId(req, body.enterprise_id),
      ...flowFields(body),
      created_by: resolveOptionalActor(req, body, 'created_by')
    };
  });
}

export function validateUpdateFlow(req, res, next) {
  return runPayrollValidation(res, next, () => {
    const body = req.body || {};
    req.validated = {
      enterprise_id: scopedEnterpriseId(req, body.enterprise_id),
      flow_id: flowIdParam(req),
      ...flowFields(body),
      updated_by: resolveOptionalActor(req, body, 'updated_by')
    };
  });
}

export function validateSetFlowStatus(req, res, next) {
  return runPayrollValidation(res, next, () => {
    const body = req.body || {};
    req.validated = {
      enterprise_id: scopedEnterpriseId(req, body.enterprise_id),
      flow_id: flowIdParam(req),
      status: requireOneOf(body.status, 'status', PAYROLL_STATUS_VALUES),
      updated_by: resolveOptionalActor(req, body, 'updated_by')
    };
  });
}

export function validateDeleteFlow(req, res, next) {
  return runPayrollValidation(res, next, () => {
    req.validated = {
      enterprise_id: scopedEnterpriseId(req, req.body?.enterprise_id),
      flow_id: flowIdParam(req)
    };
  });
}
