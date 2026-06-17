import {
  createDutyRole,
  deleteDutyRole,
  updateDutyRole
} from '../model/fndsecDutyRolesModel.js';

export {
  getDutyRoleByGuidFromView,
  listDutyRolesFromView,
  listDutyRolesForExport
} from '../model/fndsecDutyRolesViewModel.js';

export async function createDutyRoleService(body) {
  return createDutyRole(body);
}

export async function updateDutyRoleService(dutyRoleGuid, body) {
  return updateDutyRole(dutyRoleGuid, body);
}

export async function deleteDutyRoleService(dutyRoleGuid, enterpriseId) {
  return deleteDutyRole(dutyRoleGuid, enterpriseId);
}
