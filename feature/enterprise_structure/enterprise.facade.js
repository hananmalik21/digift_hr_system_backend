/**
 * Enterprise module public interface.
 *
 * Other business modules MUST import from this facade instead of
 * enterprise_structure internals (models, packages, SQL).
 *
 * Future extraction: replace these implementations with HTTP calls
 * to the Enterprise service without changing callers.
 */
import EnterpriseModel from './enterprises/model/enterpriseModel.js';
import PositionsModel from './positions/model/positions_model.js';
import HrOrgStructureModel from './hr_org_structures/model/hrOrgStructureModel.js';

export async function getEnterpriseById(enterpriseId) {
  return EnterpriseModel.findById(enterpriseId);
}

export async function getEnterpriseByCode(enterpriseCode) {
  return EnterpriseModel.findByCode(enterpriseCode);
}

export async function getPositionById(positionId, tenantId) {
  return PositionsModel.findById(positionId, tenantId);
}

export async function getOrgStructureById(structureId) {
  return HrOrgStructureModel.findById(structureId);
}

export default {
  getEnterpriseById,
  getEnterpriseByCode,
  getPositionById,
  getOrgStructureById
};
