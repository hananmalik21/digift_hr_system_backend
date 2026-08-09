/**
 * HTTP handlers for GL master data (accounts, element mappings, costing overrides).
 */

import { sendOutcome, withPayrollErrorHandling } from '../../shared/index.js';
import * as service from '../services/payGlMasterDataService.js';

export function listGlAccountsHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.listGlAccountsService(req)));
}

export function createGlAccountHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.createGlAccountService(req)));
}

export function updateGlAccountHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.updateGlAccountService(req)));
}

export function deleteGlAccountHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.deleteGlAccountService(req)));
}

export function listGlElementMappingsHandler(req, res) {
  return withPayrollErrorHandling(res, async () =>
    sendOutcome(res, await service.listGlElementMappingsService(req))
  );
}

export function createGlElementMappingHandler(req, res) {
  return withPayrollErrorHandling(res, async () =>
    sendOutcome(res, await service.createGlElementMappingService(req))
  );
}

export function updateGlElementMappingHandler(req, res) {
  return withPayrollErrorHandling(res, async () =>
    sendOutcome(res, await service.updateGlElementMappingService(req))
  );
}

export function deleteGlElementMappingHandler(req, res) {
  return withPayrollErrorHandling(res, async () =>
    sendOutcome(res, await service.deleteGlElementMappingService(req))
  );
}

export function listGlCostingOverridesHandler(req, res) {
  return withPayrollErrorHandling(res, async () =>
    sendOutcome(res, await service.listGlCostingOverridesService(req))
  );
}

export function createGlCostingOverrideHandler(req, res) {
  return withPayrollErrorHandling(res, async () =>
    sendOutcome(res, await service.createGlCostingOverrideService(req))
  );
}

export function updateGlCostingOverrideHandler(req, res) {
  return withPayrollErrorHandling(res, async () =>
    sendOutcome(res, await service.updateGlCostingOverrideService(req))
  );
}

export function deleteGlCostingOverrideHandler(req, res) {
  return withPayrollErrorHandling(res, async () =>
    sendOutcome(res, await service.deleteGlCostingOverrideService(req))
  );
}
