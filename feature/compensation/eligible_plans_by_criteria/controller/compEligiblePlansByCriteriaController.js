import express from 'express';
import { asyncHandler } from '@digifyhr/common';
import { listEligiblePlansByCriteria } from '../service/compEligiblePlansByCriteriaService.js';

const router = express.Router();
const HTTP = { BAD_REQUEST: 400, OK: 200 };
const ERROR_CODE_VALIDATION = 'VALIDATION';
const MSG_LIST_SUCCESS = 'Eligible plans fetched successfully';

function isBlank(v) {
  return v === undefined || v === null || String(v).trim() === '';
}

function sendFail(res, statusCode, error, errorCode) {
  const body = { success: false, error };
  if (errorCode !== undefined && errorCode !== null) body.error_code = String(errorCode);
  return res.status(statusCode).json(body);
}

function parseRequiredPositiveInt(raw, name) {
  if (isBlank(raw)) return { ok: false, message: `${name} is required` };
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) return { ok: false, message: `${name} must be a valid positive integer` };
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n) || n < 1) return { ok: false, message: `${name} must be a valid positive integer` };
  return { ok: true, value: n };
}

function normalizeRawHex(raw, name) {
  if (isBlank(raw)) return { ok: false, message: `${name} is required` };
  const hex = String(raw).trim().replace(/^0x/i, '').toUpperCase();
  // RAWTOHEX outputs even-length hex; most GUID RAW(16) is 32 chars, but keep it generic while still safe for HEXTORAW.
  if (!/^[0-9A-F]+$/.test(hex) || hex.length % 2 !== 0) {
    return { ok: false, message: `${name} must be a valid RAW hex string` };
  }
  return { ok: true, value: hex };
}

router.get('/eligible-plans-by-criteria', asyncHandler(async (req, res) => {
  const enterpriseId = parseRequiredPositiveInt(req.query.enterprise_id, 'enterprise_id');
  if (!enterpriseId.ok) {
    return sendFail(res, HTTP.BAD_REQUEST, enterpriseId.message, ERROR_CODE_VALIDATION);
  }
  const gradeId = parseRequiredPositiveInt(req.query.grade_id, 'grade_id');
  if (!gradeId.ok) {
    return sendFail(res, HTTP.BAD_REQUEST, gradeId.message, ERROR_CODE_VALIDATION);
  }
  const jobFamilyId = parseRequiredPositiveInt(req.query.job_family_id, 'job_family_id');
  if (!jobFamilyId.ok) {
    return sendFail(res, HTTP.BAD_REQUEST, jobFamilyId.message, ERROR_CODE_VALIDATION);
  }

  const positionId = normalizeRawHex(req.query.position_id, 'position_id');
  if (!positionId.ok) {
    return sendFail(res, HTTP.BAD_REQUEST, positionId.message, ERROR_CODE_VALIDATION);
  }
  const orgUnitId = normalizeRawHex(req.query.org_unit_id, 'org_unit_id');
  if (!orgUnitId.ok) {
    return sendFail(res, HTTP.BAD_REQUEST, orgUnitId.message, ERROR_CODE_VALIDATION);
  }

  const data = await listEligiblePlansByCriteria({
    enterprise_id: enterpriseId.value,
    grade_id: gradeId.value,
    position_id_hex: positionId.value,
    job_family_id: jobFamilyId.value,
    org_unit_id_hex: orgUnitId.value
  });

  return res.status(HTTP.OK).json({
    success: true,
    message: MSG_LIST_SUCCESS,
    data: Array.isArray(data) ? data : []
  });
}));

export default router;

