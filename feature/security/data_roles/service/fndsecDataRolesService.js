import { createDataRole, softDeleteDataRole, updateDataRole } from '../model/fndsecDataRolesModel.js';
import { getDataRoleByGuidFromView, listDataRolesFromView } from '../model/fndsecDataRolesViewModel.js';

export {
  getDataRoleByGuidFromView,
  listDataRolesFromView,
  listDataRolesForExport
} from '../model/fndsecDataRolesViewModel.js';

/** @param {Record<string, unknown>} body */
export async function createDataRoleService(body) {
  return createDataRole(body);
}

/**
 * @param {string} pathGuid URL path segment (DATA_ROLE_GUID)
 * @param {Record<string, unknown>} body
 */
export async function updateDataRoleService(pathGuid, body) {
  return updateDataRole(pathGuid, body);
}

/**
 * @param {string} pathId Numeric DATA_ROLE_ID or GUID string
 * @param {unknown} enterpriseId Query enterprise_id
 * @param {unknown} actor Resolved actor (maps to LAST_UPDATED_BY)
 */
export async function softDeleteDataRoleService(pathId, enterpriseId, actor) {
  return softDeleteDataRole(pathId, enterpriseId, actor);
}
