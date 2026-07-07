import {
  createFormulaViaPackage,
  deleteFormulaViaPackage,
  getFormulaViaPackage,
  listFormulasViaPackage,
  updateFormulaViaPackage
} from '../model/payFormulasModel.js';
import { assertEnterpriseAccess } from '../validations/payFormulas.validation.js';
import {
  isFormulaNotFoundMessage,
  mapPackageBusinessMessage
} from '../utils/payFormulasOracleErrors.js';

const CREATE_SUCCESS_MESSAGE = 'Formula created successfully.';
const UPDATE_SUCCESS_MESSAGE = 'Formula updated successfully.';
const DELETE_SUCCESS_MESSAGE = 'Formula deactivated successfully.';
const DELETE_HARD_SUCCESS_MESSAGE = 'Formula deleted successfully.';
const GET_SUCCESS_MESSAGE = 'Formula retrieved successfully.';
const LIST_SUCCESS_MESSAGE = 'Formulas retrieved successfully.';

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;

function mapPackageFailure(pkg) {
  const message = pkg.message || mapPackageBusinessMessage(pkg.message) || 'Unable to process request.';
  const httpStatus = isFormulaNotFoundMessage(message) ? HTTP_NOT_FOUND : HTTP_BAD_REQUEST;

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

export async function createFormula(payload, actor) {
  const pkg = await createFormulaViaPackage(payload, actor);
  if (!pkg.success) return mapPackageFailure(pkg);

  return {
    success: true,
    httpStatus: HTTP_CREATED,
    message: CREATE_SUCCESS_MESSAGE,
    data: pkg.data
  };
}

export async function updateFormula(formulaGuidHex, payload, actor, req = null) {
  if (req) {
    const existing = await getFormulaViaPackage(formulaGuidHex);
    if (!existing.success) return mapPackageFailure(existing);
    const enterpriseId = extractEnterpriseId(existing.data);
    if (enterpriseId != null) assertEnterpriseAccess(req, enterpriseId);
  }

  const pkg = await updateFormulaViaPackage(formulaGuidHex, payload, actor);
  if (!pkg.success) return mapPackageFailure(pkg);

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: UPDATE_SUCCESS_MESSAGE,
    data: {
      formula_id: pkg.data?.formula_id ?? null,
      formula_guid: formulaGuidHex
    }
  };
}

export async function deleteFormula(formulaGuidHex, hardDelete, actor, req = null) {
  if (req) {
    const existing = await getFormulaViaPackage(formulaGuidHex);
    if (!existing.success) return mapPackageFailure(existing);
    const enterpriseId = extractEnterpriseId(existing.data);
    if (enterpriseId != null) assertEnterpriseAccess(req, enterpriseId);
  }

  const pkg = await deleteFormulaViaPackage(formulaGuidHex, hardDelete, actor);
  if (!pkg.success) return mapPackageFailure(pkg);

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: hardDelete === 'Y' ? DELETE_HARD_SUCCESS_MESSAGE : DELETE_SUCCESS_MESSAGE
  };
}

export async function getFormulaByGuid(formulaGuidHex, req = null) {
  const pkg = await getFormulaViaPackage(formulaGuidHex);
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

export async function listFormulas(filters, req = null) {
  if (req) assertEnterpriseAccess(req, filters.enterprise_id);

  const pkg = await listFormulasViaPackage(filters);
  if (!pkg.success) return mapPackageFailure(pkg);

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: LIST_SUCCESS_MESSAGE,
    data: normalizeListData(pkg.data)
  };
}
