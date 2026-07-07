import {
  createBalanceFeedViaPackage,
  deleteBalanceFeedViaPackage,
  updateBalanceFeedViaPackage
} from '../model/payBalanceFeedsModel.js';
import {
  getPayBalanceFeedFromViewByGuid,
  listPayBalanceFeedsFromView
} from '../model/payBalanceFeedsViewModel.js';
import { assertEnterpriseAccess } from '../validations/payBalanceFeeds.validation.js';
import {
  buildListPagination,
  createdOutcome,
  deletedOutcome,
  getOutcome,
  listOutcome,
  mapPackageFailure,
  notFoundOutcome,
  updatedOutcome
} from '../utils/payBalanceFeedsServiceOutcome.js';

async function assertBalanceFeedEnterpriseAccess(req, balanceFeedGuidHex) {
  const existing = await getPayBalanceFeedFromViewByGuid(balanceFeedGuidHex);
  if (!existing) return notFoundOutcome();
  if (req) assertEnterpriseAccess(req, existing.enterprise_id);
  return null;
}

export async function createBalanceFeed(payload, actor) {
  const pkg = await createBalanceFeedViaPackage(payload, actor);
  if (!pkg.success) return mapPackageFailure(pkg);
  return createdOutcome(pkg.data);
}

export async function updateBalanceFeed(balanceFeedGuidHex, payload, actor, req = null) {
  if (req) {
    const denied = await assertBalanceFeedEnterpriseAccess(req, balanceFeedGuidHex);
    if (denied) return denied;
  }

  const pkg = await updateBalanceFeedViaPackage(balanceFeedGuidHex, payload, actor);
  if (!pkg.success) return mapPackageFailure(pkg);
  return updatedOutcome(balanceFeedGuidHex, pkg.data?.balance_feed_id);
}

export async function deleteBalanceFeed(balanceFeedGuidHex, hardDelete, actor, req = null) {
  if (req) {
    const denied = await assertBalanceFeedEnterpriseAccess(req, balanceFeedGuidHex);
    if (denied) return denied;
  }

  const pkg = await deleteBalanceFeedViaPackage(balanceFeedGuidHex, hardDelete, actor);
  if (!pkg.success) return mapPackageFailure(pkg);
  return deletedOutcome(hardDelete);
}

export async function getBalanceFeeds(filters, req = null) {
  if (req) assertEnterpriseAccess(req, filters.enterprise_id);

  const { rows, total } = await listPayBalanceFeedsFromView(filters);
  return listOutcome(rows, buildListPagination(filters.page, filters.limit, total));
}

export async function getBalanceFeedByGuid(balanceFeedGuidHex, req = null) {
  const row = await getPayBalanceFeedFromViewByGuid(balanceFeedGuidHex);
  if (!row) return notFoundOutcome();

  if (req) assertEnterpriseAccess(req, row.enterprise_id);
  return getOutcome(row);
}
