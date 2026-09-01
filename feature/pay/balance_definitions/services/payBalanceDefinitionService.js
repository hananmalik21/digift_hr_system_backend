import { buildPaginationMeta } from '@digifyhr/common';
import {
  createBalanceDefinitionViaPackage,
  deleteBalanceDefinitionViaPackage,
  updateBalanceDefinitionViaPackage
} from '../model/payBalanceDefinitionsModel.js';
import {
  getPayBalanceDefinitionFromViewByGuid,
  getPayBalanceDefinitionSummaryFromView,
  listActiveBalanceCategoriesFromView,
  listPayBalanceDefinitionsFromView,
  listPayBalanceSetupLookupsFromView
} from '../model/payBalanceDefinitionsViewModel.js';
import {
  categoriesOutcome,
  createdFromPackage,
  getOutcome,
  listOutcome,
  lookupsOutcome,
  mapPackageFailure,
  mapPackageSuccess,
  notFoundOutcome,
  summaryOutcome
} from '../utils/payBalanceDefinitionsServiceOutcome.js';

export async function createBalanceDefinition(payload) {
  const pkg = await createBalanceDefinitionViaPackage(payload);
  if (!pkg.success) return mapPackageFailure(pkg);
  return createdFromPackage(pkg);
}

export async function updateBalanceDefinition(balanceDefinitionGuidHex, payload) {
  const pkg = await updateBalanceDefinitionViaPackage(balanceDefinitionGuidHex, payload);
  if (!pkg.success) return mapPackageFailure(pkg);
  return mapPackageSuccess(pkg);
}

export async function deleteBalanceDefinition(balanceDefinitionGuidHex, enterpriseId) {
  const pkg = await deleteBalanceDefinitionViaPackage(balanceDefinitionGuidHex, enterpriseId);
  if (!pkg.success) return mapPackageFailure(pkg);
  return mapPackageSuccess(pkg);
}

export async function getBalanceDefinitions(filters) {
  const { rows, total } = await listPayBalanceDefinitionsFromView(filters);
  return listOutcome(rows, {
    pagination: buildPaginationMeta(filters.page, filters.limit, total)
  });
}

export async function getBalanceDefinitionByGuid(balanceDefinitionGuidHex, enterpriseId) {
  const row = await getPayBalanceDefinitionFromViewByGuid(balanceDefinitionGuidHex, enterpriseId);
  if (!row) return notFoundOutcome();
  return getOutcome(row);
}

export async function getBalanceDefinitionSummary(enterpriseId) {
  const data = await getPayBalanceDefinitionSummaryFromView(enterpriseId);
  return summaryOutcome(data);
}

export async function getActiveBalanceCategories(enterpriseId) {
  const rows = await listActiveBalanceCategoriesFromView(enterpriseId);
  return categoriesOutcome(rows);
}

export async function getBalanceSetupLookups(enterpriseId, typeCode = null) {
  const data = await listPayBalanceSetupLookupsFromView(enterpriseId, typeCode);
  return lookupsOutcome(data);
}
