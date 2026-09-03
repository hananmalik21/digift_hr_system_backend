/**
 * Payroll flow definition service. Oracle owns all business rules.
 */

import { outcomeFromResultJson } from '../../shared/index.js';
import * as flowsModel from '../model/payPayrollFlowsModel.js';

export async function listFlows(payload) {
  const pkg = await flowsModel.listFlows(payload);
  return outcomeFromResultJson(pkg, {
    successMessage: 'Payroll flows retrieved successfully.',
    asList: true
  });
}

export async function getFlow(payload) {
  const pkg = await flowsModel.getFlow(payload);
  return outcomeFromResultJson(pkg, { successMessage: 'Payroll flow retrieved successfully.' });
}

export async function createFlow(payload) {
  const pkg = await flowsModel.createFlow(payload);
  return outcomeFromResultJson(pkg, {
    successMessage: 'Payroll flow created successfully.',
    successHttpStatus: 201
  });
}

export async function updateFlow(payload) {
  const pkg = await flowsModel.updateFlow(payload);
  return outcomeFromResultJson(pkg, { successMessage: 'Payroll flow updated successfully.' });
}

export async function setFlowStatus(payload) {
  const pkg = await flowsModel.setFlowStatus(payload);
  return outcomeFromResultJson(pkg, { successMessage: 'Payroll flow status updated successfully.' });
}

export async function deleteFlow(payload) {
  const pkg = await flowsModel.deleteFlow(payload);
  return outcomeFromResultJson(pkg, { successMessage: 'Payroll flow deleted successfully.' });
}
