import { normalizeOutGuidHex } from '../../../../utils/oraclePackageUtils.js';
import { DEFAULT_STATUS, DROPDOWN_MAX_ROWS } from '../constants/payBalances.constants.js';
import {
  createBalanceViaPackage,
  deleteBalanceViaPackage,
  getBalanceViaPackage,
  listBalancesViaPackage,
  updateBalanceViaPackage
} from '../model/payBalancesModel.js';
import { assertEnterpriseAccess } from '../validations/payBalances.validation.js';
import {
  isBalanceAlreadyExistsMessage,
  isBalanceNotFoundMessage,
  mapPackageBusinessMessage
} from '../utils/payBalancesOracleErrors.js';

const CREATE_SUCCESS_MESSAGE = 'Balance created successfully.';
const UPDATE_SUCCESS_MESSAGE = 'Balance updated successfully.';
const DELETE_SUCCESS_MESSAGE = 'Balance deactivated successfully.';
const DELETE_HARD_SUCCESS_MESSAGE = 'Balance deleted successfully.';
const GET_SUCCESS_MESSAGE = 'Balance retrieved successfully.';
const LIST_SUCCESS_MESSAGE = 'Balances retrieved successfully.';
const DROPDOWN_SUCCESS_MESSAGE = 'Target balances retrieved successfully.';

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

function mapPackageFailure(pkg) {
  const message = pkg.message || mapPackageBusinessMessage(pkg.message) || 'Unable to process request.';
  let httpStatus = HTTP_BAD_REQUEST;

  if (isBalanceNotFoundMessage(message)) {
    httpStatus = HTTP_NOT_FOUND;
  } else if (isBalanceAlreadyExistsMessage(message)) {
    httpStatus = HTTP_CONFLICT;
  }

  return {
    success: false,
    httpStatus,
    message
  };
}

function normalizeListData(data) {
  if (Array.isArray(data)) return data;
  if (data == null) return [];
  return [data];
}

function extractEnterpriseId(data) {
  if (!data || typeof data !== 'object') return null;
  const value = data.enterprise_id ?? data.ENTERPRISE_ID;
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function fieldValue(row, camelKey, upperKey) {
  return row?.[camelKey] ?? row?.[upperKey] ?? null;
}

function mapDropdownItem(row) {
  const balanceIdRaw = fieldValue(row, 'balance_id', 'BALANCE_ID');
  const balanceId = balanceIdRaw != null ? Number(balanceIdRaw) : null;
  const balanceGuidRaw = fieldValue(row, 'balance_guid', 'BALANCE_GUID');
  const balanceGuid =
    balanceGuidRaw != null && balanceGuidRaw !== ''
      ? normalizeOutGuidHex(balanceGuidRaw) ?? String(balanceGuidRaw)
      : null;

  return {
    value: Number.isFinite(balanceId) ? balanceId : null,
    label:
      fieldValue(row, 'balance_name_en', 'BALANCE_NAME_EN') ??
      fieldValue(row, 'balance_code', 'BALANCE_CODE'),
    balance_id: Number.isFinite(balanceId) ? balanceId : null,
    balance_guid: balanceGuid,
    balance_code: fieldValue(row, 'balance_code', 'BALANCE_CODE'),
    balance_category_code: fieldValue(row, 'balance_category_code', 'BALANCE_CATEGORY_CODE'),
    balance_uom_code: fieldValue(row, 'balance_uom_code', 'BALANCE_UOM_CODE')
  };
}

export async function createBalance(payload, actor) {
  const pkg = await createBalanceViaPackage(payload, actor);
  if (!pkg.success) return mapPackageFailure(pkg);

  return {
    success: true,
    httpStatus: HTTP_CREATED,
    message: CREATE_SUCCESS_MESSAGE,
    data: pkg.data
  };
}

export async function updateBalance(balanceGuidHex, payload, actor, req = null) {
  if (req) {
    const existing = await getBalanceViaPackage(balanceGuidHex);
    if (!existing.success) return mapPackageFailure(existing);
    const enterpriseId = extractEnterpriseId(existing.data);
    if (enterpriseId != null) assertEnterpriseAccess(req, enterpriseId);
  }

  const pkg = await updateBalanceViaPackage(balanceGuidHex, payload, actor);
  if (!pkg.success) return mapPackageFailure(pkg);

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: UPDATE_SUCCESS_MESSAGE,
    data: {
      balance_id: pkg.data?.balance_id ?? null,
      balance_guid: balanceGuidHex
    }
  };
}

export async function deleteBalance(balanceGuidHex, hardDelete, actor, req = null) {
  if (req) {
    const existing = await getBalanceViaPackage(balanceGuidHex);
    if (!existing.success) return mapPackageFailure(existing);
    const enterpriseId = extractEnterpriseId(existing.data);
    if (enterpriseId != null) assertEnterpriseAccess(req, enterpriseId);
  }

  const pkg = await deleteBalanceViaPackage(balanceGuidHex, hardDelete, actor);
  if (!pkg.success) return mapPackageFailure(pkg);

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: hardDelete === 'Y' ? DELETE_HARD_SUCCESS_MESSAGE : DELETE_SUCCESS_MESSAGE
  };
}

export async function getBalanceByGuid(balanceGuidHex, req = null) {
  const pkg = await getBalanceViaPackage(balanceGuidHex);
  if (!pkg.success) return mapPackageFailure(pkg);

  const enterpriseId = extractEnterpriseId(pkg.data);
  if (req && enterpriseId != null) assertEnterpriseAccess(req, enterpriseId);

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: GET_SUCCESS_MESSAGE,
    data: pkg.data
  };
}

export async function listBalances(filters, req = null) {
  if (req) assertEnterpriseAccess(req, filters.enterprise_id);

  const pkg = await listBalancesViaPackage(filters);
  if (!pkg.success) return mapPackageFailure(pkg);

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: LIST_SUCCESS_MESSAGE,
    data: normalizeListData(pkg.data)
  };
}

export async function listBalanceDropdown(filters, req = null) {
  if (req) assertEnterpriseAccess(req, filters.enterprise_id);

  const pkg = await listBalancesViaPackage({
    enterprise_id: filters.enterprise_id,
    balance_category_code: filters.balance_category_code,
    balance_uom_code: null,
    status: DEFAULT_STATUS,
    search_text: null,
    max_rows: DROPDOWN_MAX_ROWS
  });

  if (!pkg.success) return mapPackageFailure(pkg);

  const rows = normalizeListData(pkg.data).map(mapDropdownItem);

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: DROPDOWN_SUCCESS_MESSAGE,
    data: rows
  };
}
