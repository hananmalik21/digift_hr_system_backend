/**
 * PAY.PAY_GL_COSTING_OVERRIDES — master data table, no Oracle package.
 * ORG_UNIT_ID is a RAW(16) GUID column (not a numeric ID) — bound/read as hex.
 */

import oracledb from 'oracledb';
import { queryPayList, queryPayOne, executePayDml, outIdGuidBinds } from '../../shared/index.js';
import { hexToRawBuffer } from '@digifyhr/common';

const FROM = 'PAY.PAY_GL_COSTING_OVERRIDES v';

const SORT = {
  priority_number: 'v.PRIORITY_NUMBER',
  status_code: 'v.STATUS_CODE',
  creation_date: 'v.CREATION_DATE'
};

const MAP_OPTIONS = { guids: ['ORG_UNIT_ID'] };

export function listGlCostingOverrides({
  enterpriseId,
  page,
  pageSize,
  statusCode,
  scopeTypeCode,
  employeeId,
  payrollId,
  elementId,
  sortBy,
  sortOrder
}) {
  return queryPayList({
    fromSql: FROM,
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: enterpriseId },
      { sql: 'v.STATUS_CODE = :status_code', bind: 'status_code', value: statusCode },
      { sql: 'v.SCOPE_TYPE_CODE = :scope_type_code', bind: 'scope_type_code', value: scopeTypeCode },
      { sql: 'v.EMPLOYEE_ID = :employee_id', bind: 'employee_id', value: employeeId },
      { sql: 'v.PAYROLL_ID = :payroll_id', bind: 'payroll_id', value: payrollId },
      { sql: 'v.ELEMENT_ID = :element_id', bind: 'element_id', value: elementId }
    ],
    allowedSort: SORT,
    defaultSort: 'v.PRIORITY_NUMBER ASC',
    sortBy,
    sortOrder,
    page,
    pageSize,
    mapOptions: MAP_OPTIONS,
    logTag: 'payGlCostingOverrides'
  });
}

export function getGlCostingOverrideById(enterpriseId, costingOverrideId) {
  return queryPayOne({
    fromSql: FROM,
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: enterpriseId },
      { sql: 'v.COSTING_OVERRIDE_ID = :costing_override_id', bind: 'costing_override_id', value: costingOverrideId }
    ],
    mapOptions: MAP_OPTIONS,
    logTag: 'payGlCostingOverrides'
  });
}

export async function createGlCostingOverride(payload) {
  const sql = `
    INSERT INTO PAY.PAY_GL_COSTING_OVERRIDES (
      COSTING_OVERRIDE_GUID, ENTERPRISE_ID, SCOPE_TYPE_CODE, PAYROLL_ID, EMPLOYEE_ID,
      ORG_UNIT_ID, ELEMENT_ID, OVERRIDE_GL_ACCOUNT_ID, COMPANY_CODE, DEPARTMENT_CODE,
      COST_CENTER_CODE, PROJECT_CODE, PRIORITY_NUMBER, EFFECTIVE_START_DATE,
      EFFECTIVE_END_DATE, STATUS_CODE, CREATED_BY, CREATION_DATE, LAST_UPDATED_BY, LAST_UPDATE_DATE
    ) VALUES (
      SYS_GUID(), :enterprise_id, :scope_type_code, :payroll_id, :employee_id,
      :org_unit_id, :element_id, :override_gl_account_id, :company_code, :department_code,
      :cost_center_code, :project_code, :priority_number, :effective_start_date,
      :effective_end_date, :status_code, :actor, SYSDATE, :actor, SYSDATE
    )
    RETURNING COSTING_OVERRIDE_ID, RAWTOHEX(COSTING_OVERRIDE_GUID) INTO :id, :guid
  `;
  const binds = {
    enterprise_id: { val: payload.enterprise_id, type: oracledb.NUMBER },
    scope_type_code: { val: payload.scope_type_code, type: oracledb.STRING, maxSize: 30 },
    payroll_id: { val: payload.payroll_id ?? null, type: oracledb.NUMBER },
    employee_id: { val: payload.employee_id ?? null, type: oracledb.NUMBER },
    org_unit_id: { val: hexToRawBuffer(payload.org_unit_id ?? null), type: oracledb.BUFFER, maxSize: 16 },
    element_id: { val: payload.element_id ?? null, type: oracledb.NUMBER },
    override_gl_account_id: { val: payload.override_gl_account_id ?? null, type: oracledb.NUMBER },
    company_code: { val: payload.company_code ?? null, type: oracledb.STRING, maxSize: 100 },
    department_code: { val: payload.department_code ?? null, type: oracledb.STRING, maxSize: 100 },
    cost_center_code: { val: payload.cost_center_code ?? null, type: oracledb.STRING, maxSize: 100 },
    project_code: { val: payload.project_code ?? null, type: oracledb.STRING, maxSize: 100 },
    priority_number: { val: payload.priority_number, type: oracledb.NUMBER },
    effective_start_date: { val: payload.effective_start_date, type: oracledb.DATE },
    effective_end_date: { val: payload.effective_end_date ?? null, type: oracledb.DATE },
    status_code: { val: payload.status_code ?? 'ACTIVE', type: oracledb.STRING, maxSize: 30 },
    actor: { val: payload.actor, type: oracledb.STRING, maxSize: 100 },
    ...outIdGuidBinds()
  };
  return executePayDml(sql, binds, { genericError: 'Unable to create GL costing override.' });
}

export async function updateGlCostingOverride(costingOverrideId, payload) {
  const sql = `
    UPDATE PAY.PAY_GL_COSTING_OVERRIDES SET
      SCOPE_TYPE_CODE = :scope_type_code,
      PAYROLL_ID = :payroll_id,
      EMPLOYEE_ID = :employee_id,
      ORG_UNIT_ID = :org_unit_id,
      ELEMENT_ID = :element_id,
      OVERRIDE_GL_ACCOUNT_ID = :override_gl_account_id,
      COMPANY_CODE = :company_code,
      DEPARTMENT_CODE = :department_code,
      COST_CENTER_CODE = :cost_center_code,
      PROJECT_CODE = :project_code,
      PRIORITY_NUMBER = :priority_number,
      EFFECTIVE_START_DATE = :effective_start_date,
      EFFECTIVE_END_DATE = :effective_end_date,
      STATUS_CODE = :status_code,
      LAST_UPDATED_BY = :actor,
      LAST_UPDATE_DATE = SYSDATE
    WHERE COSTING_OVERRIDE_ID = :costing_override_id
    RETURNING COSTING_OVERRIDE_ID, RAWTOHEX(COSTING_OVERRIDE_GUID) INTO :id, :guid
  `;
  const binds = {
    costing_override_id: { val: costingOverrideId, type: oracledb.NUMBER },
    scope_type_code: { val: payload.scope_type_code, type: oracledb.STRING, maxSize: 30 },
    payroll_id: { val: payload.payroll_id ?? null, type: oracledb.NUMBER },
    employee_id: { val: payload.employee_id ?? null, type: oracledb.NUMBER },
    org_unit_id: { val: hexToRawBuffer(payload.org_unit_id ?? null), type: oracledb.BUFFER, maxSize: 16 },
    element_id: { val: payload.element_id ?? null, type: oracledb.NUMBER },
    override_gl_account_id: { val: payload.override_gl_account_id ?? null, type: oracledb.NUMBER },
    company_code: { val: payload.company_code ?? null, type: oracledb.STRING, maxSize: 100 },
    department_code: { val: payload.department_code ?? null, type: oracledb.STRING, maxSize: 100 },
    cost_center_code: { val: payload.cost_center_code ?? null, type: oracledb.STRING, maxSize: 100 },
    project_code: { val: payload.project_code ?? null, type: oracledb.STRING, maxSize: 100 },
    priority_number: { val: payload.priority_number, type: oracledb.NUMBER },
    effective_start_date: { val: payload.effective_start_date, type: oracledb.DATE },
    effective_end_date: { val: payload.effective_end_date ?? null, type: oracledb.DATE },
    status_code: { val: payload.status_code, type: oracledb.STRING, maxSize: 30 },
    actor: { val: payload.actor, type: oracledb.STRING, maxSize: 100 },
    ...outIdGuidBinds()
  };
  return executePayDml(sql, binds, { genericError: 'Unable to update GL costing override.' });
}

export async function deleteGlCostingOverride(costingOverrideId) {
  const sql = `DELETE FROM PAY.PAY_GL_COSTING_OVERRIDES WHERE COSTING_OVERRIDE_ID = :costing_override_id`;
  return executePayDml(
    sql,
    { costing_override_id: { val: costingOverrideId, type: oracledb.NUMBER } },
    {
      genericError: 'Unable to delete GL costing override.',
      mapOut: () => ({ costing_override_id: costingOverrideId })
    }
  );
}
