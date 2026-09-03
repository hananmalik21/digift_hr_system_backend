/**
 * Payroll flow submission controllers.
 */

import { payrollHandler } from '../../shared/index.js';
import * as submissionsService from '../services/payFlowSubmissions.service.js';
import {
  validateCancelSubmission,
  validateCreateDraft,
  validateDeleteDraft,
  validateGetSubmission,
  validateInitializeRunFromSubmission,
  validateListSubmissions,
  validateSubmitFlow,
  validateUpdateDraft
} from '../middleware/payFlowSubmissions.validation.js';

export const listSubmissionsHandler = [
  validateListSubmissions,
  payrollHandler((req) => submissionsService.listSubmissions(req.validated))
];
export const getSubmissionHandler = [
  validateGetSubmission,
  payrollHandler((req) => submissionsService.getSubmission(req.validated))
];
export const createDraftHandler = [
  validateCreateDraft,
  payrollHandler((req) => submissionsService.createDraft(req.validated))
];
export const updateDraftHandler = [
  validateUpdateDraft,
  payrollHandler((req) => submissionsService.updateDraft(req.validated))
];
export const submitFlowHandler = [
  validateSubmitFlow,
  payrollHandler((req) => submissionsService.submitFlow(req.validated))
];
export const cancelSubmissionHandler = [
  validateCancelSubmission,
  payrollHandler((req) => submissionsService.cancelSubmission(req.validated))
];
export const deleteDraftHandler = [
  validateDeleteDraft,
  payrollHandler((req) => submissionsService.deleteDraft(req.validated))
];
export const initializeRunFromSubmissionHandler = [
  validateInitializeRunFromSubmission,
  payrollHandler((req) => submissionsService.initializeRunFromSubmission(req.validated))
];
