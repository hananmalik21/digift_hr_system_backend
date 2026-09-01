import {
  createBalanceCategoryViaPackage,
  deleteBalanceCategoryViaPackage,
  updateBalanceCategoryViaPackage
} from '../model/payBalanceCategoriesModel.js';
import {
  getPayBalanceCategoryFromViewByGuid,
  listPayBalanceCategoriesFromView
} from '../model/payBalanceCategoriesViewModel.js';
import { buildPaginationMeta } from '@digifyhr/common';
import {
  createdFromPackage,
  getOutcome,
  listOutcome,
  mapPackageFailure,
  mapPackageSuccess,
  notFoundOutcome
} from '../utils/payBalanceCategoriesServiceOutcome.js';

export async function createBalanceCategory(payload) {
  const pkg = await createBalanceCategoryViaPackage(payload);
  if (!pkg.success) return mapPackageFailure(pkg);
  return createdFromPackage(pkg);
}

export async function updateBalanceCategory(balanceCategoryGuidHex, payload) {
  const pkg = await updateBalanceCategoryViaPackage(balanceCategoryGuidHex, payload);
  if (!pkg.success) return mapPackageFailure(pkg);
  return mapPackageSuccess(pkg);
}

export async function deleteBalanceCategory(balanceCategoryGuidHex, payload) {
  const pkg = await deleteBalanceCategoryViaPackage(balanceCategoryGuidHex, payload);
  if (!pkg.success) return mapPackageFailure(pkg);
  return mapPackageSuccess(pkg);
}

export async function getBalanceCategories(filters) {
  const { rows, total } = await listPayBalanceCategoriesFromView(filters);
  return listOutcome(rows, {
    pagination: buildPaginationMeta(filters.page, filters.limit, total)
  });
}

export async function getBalanceCategoryByGuid(balanceCategoryGuidHex, enterpriseId) {
  const row = await getPayBalanceCategoryFromViewByGuid(balanceCategoryGuidHex, enterpriseId);
  if (!row) return notFoundOutcome();
  return getOutcome(row);
}
