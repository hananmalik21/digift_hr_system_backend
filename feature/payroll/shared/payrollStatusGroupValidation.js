/**
 * Request validation for payroll named status-group APIs
 * (consolidation groups and process configuration groups).
 */

import {
  PAYROLL_STATUS_VALUES,
  optionalOneOf,
  requireOneOf,
  requirePositiveInt,
  requireString,
  optionalString,
  resolveOptionalActor,
  runPayrollValidation,
  scopedEnterpriseId
} from './payrollValidation.js';

function groupIdParam(req) {
  return requirePositiveInt(req.params.groupId, 'group_id');
}

function groupFields(body) {
  return {
    group_name: requireString(body.group_name, 'group_name', { max: 200 }),
    group_code: requireString(body.group_code, 'group_code', { max: 50 }),
    description: optionalString(body.description, 'description', { max: 4000 }),
    status: optionalOneOf(body.status, 'status', PAYROLL_STATUS_VALUES)
  };
}

export function validateListGroups(req, res, next) {
  return runPayrollValidation(res, next, () => {
    req.validated = {
      enterprise_id: scopedEnterpriseId(req),
      status: optionalOneOf(req.query.status, 'status', PAYROLL_STATUS_VALUES)
    };
  });
}

export function validateGetGroup(req, res, next) {
  return runPayrollValidation(res, next, () => {
    req.validated = { enterprise_id: scopedEnterpriseId(req), group_id: groupIdParam(req) };
  });
}

export function validateCreateGroup(req, res, next) {
  return runPayrollValidation(res, next, () => {
    const body = req.body || {};
    req.validated = {
      enterprise_id: scopedEnterpriseId(req, body.enterprise_id),
      ...groupFields(body),
      created_by: resolveOptionalActor(req, body, 'created_by')
    };
  });
}

export function validateUpdateGroup(req, res, next) {
  return runPayrollValidation(res, next, () => {
    const body = req.body || {};
    req.validated = {
      enterprise_id: scopedEnterpriseId(req, body.enterprise_id),
      group_id: groupIdParam(req),
      ...groupFields(body),
      updated_by: resolveOptionalActor(req, body, 'updated_by')
    };
  });
}

export function validateSetGroupStatus(req, res, next) {
  return runPayrollValidation(res, next, () => {
    const body = req.body || {};
    req.validated = {
      enterprise_id: scopedEnterpriseId(req, body.enterprise_id),
      group_id: groupIdParam(req),
      status: requireOneOf(body.status, 'status', PAYROLL_STATUS_VALUES),
      updated_by: resolveOptionalActor(req, body, 'updated_by')
    };
  });
}

export function validateDeleteGroup(req, res, next) {
  return runPayrollValidation(res, next, () => {
    req.validated = {
      enterprise_id: scopedEnterpriseId(req, req.body?.enterprise_id),
      group_id: groupIdParam(req)
    };
  });
}
