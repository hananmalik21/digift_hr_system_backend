/**
 * Formula engine API.
 * Mounted at /api/payroll/formulas (engine ops only — CRUD lives at feature/pay/formulas).
 */
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  parseGuidParam,
  parsePaginationQuery,
  pickFilters,
  requirePositiveInt,
  resolveAuditActor,
  resolveEnterpriseId,
  sendOutcome,
  withPayrollErrorHandling
} from '../../shared/index.js';
import {
  getExecution,
  getExecutionStepsList,
  getExecutions,
  testFormula,
  updateFormulaStatus,
  validateFormula
} from '../services/payFormulaEngine.service.js';

/** POST /api/payroll/formulas/:formulaGuid/validate */
export const validateFormulaHandler = [
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () => {
      const formulaGuid = parseGuidParam(req.params.formulaGuid, 'formulaGuid');
      return sendOutcome(res, await validateFormula(formulaGuid, req));
    })
  )
];

/** POST /api/payroll/formulas/:formulaGuid/test */
export const testFormulaHandler = [
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () => {
      const formulaGuid = parseGuidParam(req.params.formulaGuid, 'formulaGuid');
      const actor = resolveAuditActor(req);
      return sendOutcome(res, await testFormula(formulaGuid, req.body || {}, actor, req));
    })
  )
];

/** PATCH /api/payroll/formulas/:formulaGuid/status */
export const updateFormulaStatusHandler = [
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () => {
      const formulaGuid = parseGuidParam(req.params.formulaGuid, 'formulaGuid');
      const actor = resolveAuditActor(req);
      return sendOutcome(res, await updateFormulaStatus(formulaGuid, req.body?.status, actor, req));
    })
  )
];

/** GET /api/payroll/formulas/executions */
export const listExecutionsHandler = [
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () => {
      const { page, pageSize } = parsePaginationQuery(req.query);
      const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id, { required: false });
      const filters = {
        ...pickFilters(req.query, ['formula_id', 'run_id', 'employee_id', 'element_entry_id', 'status_code', 'sort_by', 'sort_order']),
        enterprise_id: enterpriseId,
        page,
        pageSize
      };
      return sendOutcome(res, await getExecutions(filters));
    })
  )
];

/** GET /api/payroll/formulas/executions/:executionId */
export const getExecutionHandler = [
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () => {
      const executionId = requirePositiveInt(req.params.executionId, 'executionId');
      return sendOutcome(res, await getExecution(executionId));
    })
  )
];

/** GET /api/payroll/formulas/executions/:executionId/steps */
export const getExecutionStepsHandler = [
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () => {
      const executionId = requirePositiveInt(req.params.executionId, 'executionId');
      return sendOutcome(res, await getExecutionStepsList(executionId));
    })
  )
];
