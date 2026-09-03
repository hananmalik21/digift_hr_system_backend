/**
 * Payroll flow definition controllers.
 */

import { payrollHandler } from '../../shared/index.js';
import * as flowsService from '../services/payPayrollFlows.service.js';
import {
  validateCreateFlow,
  validateDeleteFlow,
  validateGetFlow,
  validateListFlows,
  validateSetFlowStatus,
  validateUpdateFlow
} from '../middleware/payPayrollFlows.validation.js';

export const listFlowsHandler = [validateListFlows, payrollHandler((req) => flowsService.listFlows(req.validated))];
export const getFlowHandler = [validateGetFlow, payrollHandler((req) => flowsService.getFlow(req.validated))];
export const createFlowHandler = [validateCreateFlow, payrollHandler((req) => flowsService.createFlow(req.validated))];
export const updateFlowHandler = [validateUpdateFlow, payrollHandler((req) => flowsService.updateFlow(req.validated))];
export const setFlowStatusHandler = [
  validateSetFlowStatus,
  payrollHandler((req) => flowsService.setFlowStatus(req.validated))
];
export const deleteFlowHandler = [validateDeleteFlow, payrollHandler((req) => flowsService.deleteFlow(req.validated))];
