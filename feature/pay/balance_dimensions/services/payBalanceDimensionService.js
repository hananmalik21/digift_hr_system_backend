import { buildPaginationMeta } from '../../../../utils/paginationUtils.js';
import {
  createBalanceDimension as createBalanceDimensionInModel,
  deleteBalanceDimensionViaPackage,
  updateBalanceDimensionViaPackage
} from '../model/payBalanceDimensionsModel.js';
import {
  getPayBalanceDimensionFromViewByGuid,
  listPayBalanceDimensionsFromView
} from '../model/payBalanceDimensionsViewModel.js';
import {
  CREATE_SUCCESS_MESSAGE,
  UPDATE_RETRIEVE_FAILED_MESSAGE,
  UPDATE_SUCCESS_MESSAGE
} from '../constants/payBalanceDimensions.constants.js';
import {
  createdFromPackage,
  getOutcome,
  listOutcome,
  mapPackageFailure,
  mapPackageSuccess,
  notFoundOutcome
} from '../utils/payBalanceDimensionsServiceOutcome.js';

/**
 * @param {Record<string, unknown>} payload
 */
export async function createBalanceDimension(payload) {
  const result = await createBalanceDimensionInModel(payload);
  if (!result.success) return mapPackageFailure(result);
  return createdFromPackage({
    message: result.message || CREATE_SUCCESS_MESSAGE,
    data: result.data
  });
}

/**
 * Update via package, then reload the row from PAY.V_PAY_BALANCE_DIMENSIONS.
 * @param {string} balanceDimensionGuidHex
 * @param {Record<string, unknown>} payload
 */
export async function updateBalanceDimension(balanceDimensionGuidHex, payload) {
  const pkg = await updateBalanceDimensionViaPackage(balanceDimensionGuidHex, payload);
  if (!pkg.success) return mapPackageFailure(pkg);

  const row = await getPayBalanceDimensionFromViewByGuid(
    balanceDimensionGuidHex,
    payload.enterprise_id
  );
  if (!row) {
    return mapPackageFailure({ message: UPDATE_RETRIEVE_FAILED_MESSAGE });
  }

  return mapPackageSuccess({
    message: pkg.message || UPDATE_SUCCESS_MESSAGE,
    data: row
  });
}

/**
 * @param {string} balanceDimensionGuidHex
 * @param {{ enterprise_id: number }} payload
 */
export async function deleteBalanceDimension(balanceDimensionGuidHex, payload) {
  const pkg = await deleteBalanceDimensionViaPackage(
    balanceDimensionGuidHex,
    payload.enterprise_id
  );
  if (!pkg.success) return mapPackageFailure(pkg);
  return mapPackageSuccess({ ...pkg, data: null });
}

/**
 * @param {Record<string, unknown>} filters
 */
export async function getBalanceDimensions(filters) {
  const { rows, total } = await listPayBalanceDimensionsFromView(filters);
  return listOutcome(rows, {
    pagination: buildPaginationMeta(filters.page, filters.limit, total)
  });
}

/**
 * @param {string} balanceDimensionGuidHex
 * @param {number} enterpriseId
 */
export async function getBalanceDimensionByGuid(balanceDimensionGuidHex, enterpriseId) {
  const row = await getPayBalanceDimensionFromViewByGuid(balanceDimensionGuidHex, enterpriseId);
  if (!row) return notFoundOutcome();
  return getOutcome(row);
}
