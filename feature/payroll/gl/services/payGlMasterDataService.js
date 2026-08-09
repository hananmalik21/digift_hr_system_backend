/**
 * Business logic for GL master data (accounts, element mappings, costing
 * overrides). These tables have no Oracle package, so mutations are plain
 * SQL via payrollTableDml — see model files for details.
 */

import {
  okList,
  okMutation,
  notFoundOutcome,
  resolveAuditActor
} from '../../shared/index.js';
import {
  requirePositiveInt,
  optionalPositiveInt,
  requireString,
  optionalString,
  requireDate,
  optionalDate,
  parsePaginationQuery,
  resolveEnterpriseId
} from '../../shared/index.js';
import { ValidationError } from '../../../../utils/errors/index.js';
import * as accountsModel from '../model/payGlAccountsModel.js';
import * as mappingsModel from '../model/payGlElementMappingsModel.js';
import * as overridesModel from '../model/payGlCostingOverridesModel.js';

const STATUS_CODES = ['ACTIVE', 'INACTIVE'];

function requireOneOf(value, field, allowed) {
  const s = requireString(value, field, { max: 30 }).toUpperCase();
  if (!allowed.includes(s)) {
    throw new ValidationError(`${field} must be one of: ${allowed.join(', ')}`, [
      { field, message: `${field} must be one of: ${allowed.join(', ')}` }
    ]);
  }
  return s;
}

function optionalOneOf(value, field, allowed) {
  if (value == null || value === '') return undefined;
  return requireOneOf(value, field, allowed);
}

// ---------------------------------------------------------------------------
// GL Accounts
// ---------------------------------------------------------------------------

const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];
const BALANCE_CODES = ['D', 'C'];

function parseAccountPayload(body, { partial = false } = {}) {
  const payload = {};
  if (!partial || body.account_code !== undefined) {
    payload.account_code = requireString(body.account_code, 'account_code', { max: 100 });
  }
  if (!partial || body.account_name !== undefined) {
    payload.account_name = requireString(body.account_name, 'account_name', { max: 200 });
  }
  if (!partial || body.account_type_code !== undefined) {
    payload.account_type_code = requireOneOf(body.account_type_code, 'account_type_code', ACCOUNT_TYPES);
  }
  if (!partial || body.normal_balance_code !== undefined) {
    payload.normal_balance_code = requireOneOf(body.normal_balance_code, 'normal_balance_code', BALANCE_CODES);
  }
  payload.currency_code = optionalString(body.currency_code, 'currency_code', { max: 10 });
  if (!partial || body.effective_start_date !== undefined) {
    payload.effective_start_date = requireDate(body.effective_start_date, 'effective_start_date');
  }
  payload.effective_end_date = optionalDate(body.effective_end_date, 'effective_end_date');
  payload.status_code = optionalOneOf(body.status_code, 'status_code', STATUS_CODES);
  return payload;
}

export async function listGlAccountsService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const { page, pageSize } = parsePaginationQuery(req.query);
  const { data, total } = await accountsModel.listGlAccounts({
    enterpriseId,
    page,
    pageSize,
    statusCode: req.query.status_code,
    accountTypeCode: req.query.account_type_code,
    sortBy: req.query.sort_by,
    sortOrder: req.query.sort_order,
    search: req.query.search
  });
  return okList('GL accounts retrieved successfully.', data, page, pageSize, total);
}

export async function createGlAccountService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const payload = parseAccountPayload(req.body || {});
  const actor = resolveAuditActor(req);
  const result = await accountsModel.createGlAccount({ ...payload, enterprise_id: enterpriseId, actor });
  const account = await accountsModel.getGlAccountById(enterpriseId, result.id);
  return okMutation('GL account created successfully.', account, 201);
}

export async function updateGlAccountService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const accountId = requirePositiveInt(req.params.accountId, 'accountId');
  const existing = await accountsModel.getGlAccountById(enterpriseId, accountId);
  if (!existing) return notFoundOutcome('GL account not found.');
  const payload = parseAccountPayload(req.body || {}, { partial: true });
  const actor = resolveAuditActor(req);
  await accountsModel.updateGlAccount(accountId, {
    account_code: payload.account_code ?? existing.account_code,
    account_name: payload.account_name ?? existing.account_name,
    account_type_code: payload.account_type_code ?? existing.account_type_code,
    normal_balance_code: payload.normal_balance_code ?? existing.normal_balance_code,
    currency_code: payload.currency_code !== undefined ? payload.currency_code : existing.currency_code,
    effective_start_date: payload.effective_start_date ?? existing.effective_start_date,
    effective_end_date:
      hasBodyField(req, 'effective_end_date') ? payload.effective_end_date : existing.effective_end_date,
    status_code: payload.status_code ?? existing.status_code,
    actor
  });
  const updated = await accountsModel.getGlAccountById(enterpriseId, accountId);
  return okMutation('GL account updated successfully.', updated);
}

export async function deleteGlAccountService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const accountId = requirePositiveInt(req.params.accountId, 'accountId');
  const existing = await accountsModel.getGlAccountById(enterpriseId, accountId);
  if (!existing) return notFoundOutcome('GL account not found.');
  await accountsModel.deleteGlAccount(accountId);
  return okMutation('GL account deleted successfully.', null);
}

// ---------------------------------------------------------------------------
// GL Element Mappings
// ---------------------------------------------------------------------------

const DEBIT_CREDIT_CODES = ['D', 'C'];

function parseMappingPayload(body, { partial = false } = {}) {
  const payload = {};
  if (!partial || body.element_id !== undefined) {
    payload.element_id = requirePositiveInt(body.element_id, 'element_id');
  }
  if (!partial || body.gl_account_id !== undefined) {
    payload.gl_account_id = requirePositiveInt(body.gl_account_id, 'gl_account_id');
  }
  if (!partial || body.debit_credit_code !== undefined) {
    payload.debit_credit_code = requireOneOf(body.debit_credit_code, 'debit_credit_code', DEBIT_CREDIT_CODES);
  }
  if (!partial || body.accounting_class_code !== undefined) {
    payload.accounting_class_code = requireString(body.accounting_class_code, 'accounting_class_code', { max: 50 });
  }
  payload.line_description = optionalString(body.line_description, 'line_description', { max: 500 });
  if (!partial || body.effective_start_date !== undefined) {
    payload.effective_start_date = requireDate(body.effective_start_date, 'effective_start_date');
  }
  payload.effective_end_date = optionalDate(body.effective_end_date, 'effective_end_date');
  payload.status_code = optionalOneOf(body.status_code, 'status_code', STATUS_CODES);
  return payload;
}

export async function listGlElementMappingsService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const { page, pageSize } = parsePaginationQuery(req.query);
  const { data, total } = await mappingsModel.listGlElementMappings({
    enterpriseId,
    page,
    pageSize,
    statusCode: req.query.status_code,
    elementId: optionalPositiveInt(req.query.element_id, 'element_id'),
    glAccountId: optionalPositiveInt(req.query.gl_account_id, 'gl_account_id'),
    sortBy: req.query.sort_by,
    sortOrder: req.query.sort_order,
    search: req.query.search
  });
  return okList('GL element mappings retrieved successfully.', data, page, pageSize, total);
}

export async function createGlElementMappingService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const payload = parseMappingPayload(req.body || {});
  const actor = resolveAuditActor(req);
  const result = await mappingsModel.createGlElementMapping({ ...payload, enterprise_id: enterpriseId, actor });
  const mapping = await mappingsModel.getGlElementMappingById(enterpriseId, result.id);
  return okMutation('GL element mapping created successfully.', mapping, 201);
}

export async function updateGlElementMappingService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const mappingId = requirePositiveInt(req.params.mappingId, 'mappingId');
  const existing = await mappingsModel.getGlElementMappingById(enterpriseId, mappingId);
  if (!existing) return notFoundOutcome('GL element mapping not found.');
  const payload = parseMappingPayload(req.body || {}, { partial: true });
  const actor = resolveAuditActor(req);
  await mappingsModel.updateGlElementMapping(mappingId, {
    element_id: payload.element_id ?? existing.element_id,
    gl_account_id: payload.gl_account_id ?? existing.gl_account_id,
    debit_credit_code: payload.debit_credit_code ?? existing.debit_credit_code,
    accounting_class_code: payload.accounting_class_code ?? existing.accounting_class_code,
    line_description:
      hasBodyField(req, 'line_description') ? payload.line_description : existing.line_description,
    effective_start_date: payload.effective_start_date ?? existing.effective_start_date,
    effective_end_date:
      hasBodyField(req, 'effective_end_date') ? payload.effective_end_date : existing.effective_end_date,
    status_code: payload.status_code ?? existing.status_code,
    actor
  });
  const updated = await mappingsModel.getGlElementMappingById(enterpriseId, mappingId);
  return okMutation('GL element mapping updated successfully.', updated);
}

export async function deleteGlElementMappingService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const mappingId = requirePositiveInt(req.params.mappingId, 'mappingId');
  const existing = await mappingsModel.getGlElementMappingById(enterpriseId, mappingId);
  if (!existing) return notFoundOutcome('GL element mapping not found.');
  await mappingsModel.deleteGlElementMapping(mappingId);
  return okMutation('GL element mapping deleted successfully.', null);
}

// ---------------------------------------------------------------------------
// GL Costing Overrides
// ---------------------------------------------------------------------------

const SCOPE_TYPES = ['EMPLOYEE', 'ORG_UNIT', 'PAYROLL', 'DEFAULT'];

function parseOverridePayload(body, { partial = false } = {}) {
  const payload = {};
  if (!partial || body.scope_type_code !== undefined) {
    payload.scope_type_code = requireOneOf(body.scope_type_code, 'scope_type_code', SCOPE_TYPES);
  }
  payload.payroll_id = optionalPositiveInt(body.payroll_id, 'payroll_id');
  payload.employee_id = optionalPositiveInt(body.employee_id, 'employee_id');
  payload.org_unit_id = optionalString(body.org_unit_id, 'org_unit_id', { max: 32, min: 32 });
  payload.element_id = optionalPositiveInt(body.element_id, 'element_id');
  payload.override_gl_account_id = optionalPositiveInt(body.override_gl_account_id, 'override_gl_account_id');
  payload.company_code = optionalString(body.company_code, 'company_code', { max: 100 });
  payload.department_code = optionalString(body.department_code, 'department_code', { max: 100 });
  payload.cost_center_code = optionalString(body.cost_center_code, 'cost_center_code', { max: 100 });
  payload.project_code = optionalString(body.project_code, 'project_code', { max: 100 });
  if (!partial || body.priority_number !== undefined) {
    payload.priority_number = requirePositiveInt(body.priority_number, 'priority_number');
  }
  if (!partial || body.effective_start_date !== undefined) {
    payload.effective_start_date = requireDate(body.effective_start_date, 'effective_start_date');
  }
  payload.effective_end_date = optionalDate(body.effective_end_date, 'effective_end_date');
  payload.status_code = optionalOneOf(body.status_code, 'status_code', STATUS_CODES);
  return payload;
}

export async function listGlCostingOverridesService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const { page, pageSize } = parsePaginationQuery(req.query);
  const { data, total } = await overridesModel.listGlCostingOverrides({
    enterpriseId,
    page,
    pageSize,
    statusCode: req.query.status_code,
    scopeTypeCode: req.query.scope_type_code,
    employeeId: optionalPositiveInt(req.query.employee_id, 'employee_id'),
    payrollId: optionalPositiveInt(req.query.payroll_id, 'payroll_id'),
    elementId: optionalPositiveInt(req.query.element_id, 'element_id'),
    sortBy: req.query.sort_by,
    sortOrder: req.query.sort_order
  });
  return okList('GL costing overrides retrieved successfully.', data, page, pageSize, total);
}

export async function createGlCostingOverrideService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const payload = parseOverridePayload(req.body || {});
  const actor = resolveAuditActor(req);
  const result = await overridesModel.createGlCostingOverride({ ...payload, enterprise_id: enterpriseId, actor });
  const override = await overridesModel.getGlCostingOverrideById(enterpriseId, result.id);
  return okMutation('GL costing override created successfully.', override, 201);
}

export async function updateGlCostingOverrideService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const overrideId = requirePositiveInt(req.params.overrideId, 'overrideId');
  const existing = await overridesModel.getGlCostingOverrideById(enterpriseId, overrideId);
  if (!existing) return notFoundOutcome('GL costing override not found.');
  const payload = parseOverridePayload(req.body || {}, { partial: true });
  const actor = resolveAuditActor(req);
  await overridesModel.updateGlCostingOverride(overrideId, {
    scope_type_code: payload.scope_type_code ?? existing.scope_type_code,
    payroll_id: hasBodyField(req, 'payroll_id') ? payload.payroll_id : existing.payroll_id,
    employee_id: hasBodyField(req, 'employee_id') ? payload.employee_id : existing.employee_id,
    org_unit_id: hasBodyField(req, 'org_unit_id') ? payload.org_unit_id : existing.org_unit_id,
    element_id: hasBodyField(req, 'element_id') ? payload.element_id : existing.element_id,
    override_gl_account_id: hasBodyField(req, 'override_gl_account_id')
      ? payload.override_gl_account_id
      : existing.override_gl_account_id,
    company_code: hasBodyField(req, 'company_code') ? payload.company_code : existing.company_code,
    department_code: hasBodyField(req, 'department_code') ? payload.department_code : existing.department_code,
    cost_center_code: hasBodyField(req, 'cost_center_code') ? payload.cost_center_code : existing.cost_center_code,
    project_code: hasBodyField(req, 'project_code') ? payload.project_code : existing.project_code,
    priority_number: payload.priority_number ?? existing.priority_number,
    effective_start_date: payload.effective_start_date ?? existing.effective_start_date,
    effective_end_date:
      hasBodyField(req, 'effective_end_date') ? payload.effective_end_date : existing.effective_end_date,
    status_code: payload.status_code ?? existing.status_code,
    actor
  });
  const updated = await overridesModel.getGlCostingOverrideById(enterpriseId, overrideId);
  return okMutation('GL costing override updated successfully.', updated);
}

export async function deleteGlCostingOverrideService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const overrideId = requirePositiveInt(req.params.overrideId, 'overrideId');
  const existing = await overridesModel.getGlCostingOverrideById(enterpriseId, overrideId);
  if (!existing) return notFoundOutcome('GL costing override not found.');
  await overridesModel.deleteGlCostingOverride(overrideId);
  return okMutation('GL costing override deleted successfully.', null);
}

/** True when `field` was explicitly present on the request body (for PATCH-style partial updates). */
function hasBodyField(req, field) {
  return req.body != null && Object.prototype.hasOwnProperty.call(req.body, field);
}
