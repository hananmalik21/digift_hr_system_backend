/**
 * Formula engine service — orchestrates PAY_FORMULA_ENGINE_PKG / PAY_FORMULA_CONTEXT_PKG
 * against existing formula CRUD (feature/pay/formulas) for GUID → id / body resolution.
 */
import {
  getFormulaByGuid,
  updateFormula
} from '../../../pay/formulas/services/payFormulaService.js';
import {
  assertEnterpriseAccess,
  failOutcome,
  notFoundOutcome,
  okGet,
  okList,
  okMutation,
  optionalPositiveInt,
  requireString
} from '../../shared/index.js';
import {
  buildFormulaContextViaPackage,
  executeFormulaViaPackage,
  evaluateBodyViaPackage,
  getExecutionLogById,
  listExecutionLogs,
  listExecutionSteps,
  validateFormulaViaPackage
} from '../model/payFormulaEngineModel.js';

async function resolveFormula(formulaGuidHex, req) {
  const outcome = await getFormulaByGuid(formulaGuidHex, req);
  if (!outcome?.success || !outcome?.data) {
    return { formula: null, outcome: notFoundOutcome(outcome?.message || 'Formula not found') };
  }
  return { formula: outcome.data, outcome: null };
}

/** POST /:formulaGuid/validate */
export async function validateFormula(formulaGuidHex, req) {
  const { formula, outcome } = await resolveFormula(formulaGuidHex, req);
  if (!formula) return outcome;

  assertEnterpriseAccess(req, formula.enterprise_id);

  const body = formula.formula_body;
  if (!body || !String(body).trim()) {
    return failOutcome('Formula has no body to validate.', 400, { success: false });
  }

  const pkg = await validateFormulaViaPackage(String(body));
  return pkg.success
    ? okMutation(pkg.message, { success: pkg.success }, 200)
    : failOutcome(pkg.message, 400, { success: pkg.success });
}

/**
 * POST /:formulaGuid/test
 * @param {string} formulaGuidHex
 * @param {{ enterprise_id?, employee_id?, run_id?, rel_action_id?, element_entry_id?, payroll_id?, effective_date?, input_values? }} body
 * @param {string} actor
 */
export async function testFormula(formulaGuidHex, body, actor, req) {
  const { formula, outcome } = await resolveFormula(formulaGuidHex, req);
  if (!formula) return outcome;

  const enterpriseId = optionalPositiveInt(body.enterprise_id, 'enterprise_id') ?? formula.enterprise_id;
  assertEnterpriseAccess(req, enterpriseId);

  const employeeId = optionalPositiveInt(body.employee_id, 'employee_id');
  const runId = optionalPositiveInt(body.run_id, 'run_id');
  const relActionId = optionalPositiveInt(body.rel_action_id, 'rel_action_id');
  const elementEntryId = optionalPositiveInt(body.element_entry_id, 'element_entry_id');
  const payrollId = optionalPositiveInt(body.payroll_id, 'payroll_id');
  const inputValues =
    body.input_values && typeof body.input_values === 'object' && !Array.isArray(body.input_values)
      ? body.input_values
      : {};

  let contextObj = { ...inputValues };
  if (runId != null || employeeId != null) {
    const built = await buildFormulaContextViaPackage({
      enterprise_id: enterpriseId,
      element_entry_id: elementEntryId,
      run_id: runId,
      rel_action_id: relActionId,
      employee_id: employeeId,
      payroll_id: payrollId,
      period_start_date: body.period_start_date,
      period_end_date: body.period_end_date
    });
    if (built.success) {
      let parsedBuilt = {};
      try {
        parsedBuilt = JSON.parse(built.data.context_json || '{}');
      } catch (_) {
        parsedBuilt = {};
      }
      contextObj = { ...parsedBuilt, ...inputValues };
    }
  }

  const exec = await executeFormulaViaPackage({
    enterprise_id: enterpriseId,
    formula_id: formula.formula_id,
    effective_date: body.effective_date,
    run_id: runId,
    rel_action_id: relActionId,
    employee_id: employeeId,
    element_entry_id: elementEntryId,
    context_json: JSON.stringify(contextObj),
    executed_by: actor
  });

  let steps = [];
  if (exec.data?.execution_log_id != null) {
    steps = await listExecutionSteps(exec.data.execution_log_id);
  }

  const data = {
    result: {
      result_code: exec.data?.result_code ?? null,
      result_value: exec.data?.result_value ?? null,
      step_count: exec.data?.step_count ?? null
    },
    status: exec.success ? 'SUCCESS' : 'FAILED',
    execution_id: exec.data?.execution_log_id ?? null,
    steps,
    error: exec.success ? null : exec.message
  };

  return exec.success
    ? okMutation(exec.message, data, 200)
    : failOutcome(exec.message || 'Formula test failed.', 400, data);
}

/** PATCH /:formulaGuid/status */
export async function updateFormulaStatus(formulaGuidHex, status, actor, req) {
  const { formula, outcome } = await resolveFormula(formulaGuidHex, req);
  if (!formula) return outcome;

  assertEnterpriseAccess(req, formula.enterprise_id);
  const newStatus = requireString(status, 'status', { max: 20 });

  const payload = {
    enterprise_id: formula.enterprise_id,
    formula_code: formula.formula_code,
    formula_name_en: formula.formula_name_en,
    formula_name_ar: formula.formula_name_ar,
    formula_type_code: formula.formula_type_code,
    formula_engine_code: formula.formula_engine_code,
    return_type_code: formula.return_type_code,
    return_value_code: formula.return_value_code,
    formula_description: formula.formula_description,
    formula_body: formula.formula_body,
    effective_start_date: formula.effective_start_date,
    effective_end_date: formula.effective_end_date,
    status: newStatus
  };

  const result = await updateFormula(formulaGuidHex, payload, actor, req);
  if (!result.success) return result;

  return okMutation('Formula status updated successfully.', {
    formula_guid: formulaGuidHex,
    status: newStatus
  });
}

/** GET /executions */
export async function getExecutions(filters) {
  const { data, total, page, pageSize } = await listExecutionLogs(filters);
  return okList('Formula execution logs retrieved successfully.', data, page, pageSize, total);
}

/** GET /executions/:executionId */
export async function getExecution(executionId) {
  const row = await getExecutionLogById(executionId);
  if (!row) return notFoundOutcome('Formula execution log not found.');
  return okGet('Formula execution log retrieved successfully.', row);
}

/** GET /executions/:executionId/steps */
export async function getExecutionStepsList(executionId) {
  const row = await getExecutionLogById(executionId);
  if (!row) return notFoundOutcome('Formula execution log not found.');
  const steps = await listExecutionSteps(executionId);
  return okGet('Formula execution steps retrieved successfully.', steps);
}
