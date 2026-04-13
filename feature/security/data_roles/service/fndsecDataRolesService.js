import { createDataRole, softDeleteDataRole, updateDataRole } from '../model/fndsecDataRolesModel.js';

export async function createDataRoleService(body) {
  return createDataRole(body);
}

export async function updateDataRoleService(pathId, body) {
  return updateDataRole(pathId, body);
}

export async function softDeleteDataRoleService(pathId, enterpriseId, actor) {
  return softDeleteDataRole(pathId, enterpriseId, actor);
}
