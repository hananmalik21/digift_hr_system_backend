import { buildPaginationMeta } from '@digifyhr/common';
import {
  createBalanceInitialization as createBalanceInitializationInModel,
  deleteBalanceInitialization as deleteBalanceInitializationInModel,
  updateBalanceInitialization as updateBalanceInitializationInModel
} from '../model/payBalanceInitializationsModel.js';
import {
  getPayBalanceInitializationFromViewByGuid,
  listPayBalanceInitializationsForExport,
  listPayBalanceInitializationsFromView
} from '../model/payBalanceInitializationsViewModel.js';
import { buildBalanceInitializationsExcelBuffer } from '../utils/payBalanceInitializationsExportService.js';
import {
  CREATE_SUCCESS_MESSAGE,
  UPDATE_SUCCESS_MESSAGE
} from '../constants/payBalanceInitializations.constants.js';
import {
  createdFromPackage,
  getOutcome,
  listOutcome,
  mapPackageFailure,
  mapPackageSuccess,
  notFoundOutcome
} from '../utils/payBalanceInitializationsServiceOutcome.js';

/**
 * @param {Record<string, unknown>} payload
 */
export async function createBalanceInitialization(payload) {
  const result = await createBalanceInitializationInModel(payload);
  if (!result.success) return mapPackageFailure(result);
  return createdFromPackage({
    message: result.message || CREATE_SUCCESS_MESSAGE,
    data: result.data
  });
}

/**
 * @param {string} initializationGuidHex
 * @param {Record<string, unknown>} payload
 */
export async function updateBalanceInitialization(initializationGuidHex, payload) {
  const result = await updateBalanceInitializationInModel(initializationGuidHex, payload);
  if (!result.success) return mapPackageFailure(result);
  return mapPackageSuccess({
    message: result.message || UPDATE_SUCCESS_MESSAGE,
    data: result.data
  });
}

/**
 * @param {string} initializationGuidHex
 * @param {{ enterprise_id: number }} payload
 */
export async function deleteBalanceInitialization(initializationGuidHex, payload) {
  const pkg = await deleteBalanceInitializationInModel(
    initializationGuidHex,
    payload.enterprise_id
  );
  if (!pkg.success) return mapPackageFailure(pkg);
  return mapPackageSuccess({ ...pkg, data: null });
}

/**
 * @param {Record<string, unknown>} filters
 */
export async function getBalanceInitializations(filters) {
  const { rows, total } = await listPayBalanceInitializationsFromView(filters);
  return listOutcome(rows, {
    pagination: buildPaginationMeta(filters.page, filters.limit, total)
  });
}

/**
 * @param {string} initializationGuidHex
 * @param {number} enterpriseId
 */
export async function getBalanceInitializationByGuid(initializationGuidHex, enterpriseId) {
  const row = await getPayBalanceInitializationFromViewByGuid(
    initializationGuidHex,
    enterpriseId
  );
  if (!row) return notFoundOutcome();
  return getOutcome(row);
}

/**
 * @param {Record<string, unknown>} filters
 * @returns {Promise<{ buffer: Buffer|null, filename: string|null, rowCount: number }>}
 */
export async function exportBalanceInitializations(filters) {
  const rows = await listPayBalanceInitializationsForExport(filters);
  if (!rows.length) {
    return { buffer: null, filename: null, rowCount: 0 };
  }
  return buildBalanceInitializationsExcelBuffer({
    rows,
    enterpriseId: filters.enterprise_id
  });
}
