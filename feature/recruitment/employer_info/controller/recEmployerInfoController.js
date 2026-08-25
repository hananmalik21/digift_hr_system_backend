/**
 * Employer Info APIs — REC.REC_EMPLOYER_INFO_PKG + REC.V_EMPLOYER_INFO
 *
 * GET    /api/employer-info
 * GET    /api/employer-info/:guid
 * POST   /api/employer-info          (multipart/form-data; logo required)
 * PUT    /api/employer-info/:guid    (multipart/form-data; logo optional)
 * DELETE /api/employer-info/:guid
 * PATCH  /api/employer-info/:guid/status
 * GET    /api/employer-info/:guid/logo
 * DELETE /api/employer-info/:guid/logo
 */

import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  clearEmployerInfoLogo,
  createEmployerInfo,
  deleteEmployerInfo,
  setEmployerInfoStatus,
  updateEmployerInfo
} from '../model/recEmployerInfoModel.js';
import { getEmployerInfoByGuid, listEmployerInfo } from '../model/recEmployerInfoViewModel.js';
import { getEmployerInfoLogoByGuid } from '../model/recEmployerInfoLogoModel.js';
import {
  getUploadedLogoFile,
  requireEmployerInfoMultipart
} from '../utils/recEmployerInfoMultipart.js';
import {
  buildEmployerInfoPayload,
  parseActiveFlag,
  parseEmployerInfoGuid,
  parseListQuery,
  validateLogoUpload
} from '../utils/recEmployerInfoValidators.js';
import { extractGuidFromPackageResult } from '../utils/recEmployerInfoMapper.js';
import { MESSAGES, packageStatusIsSuccess } from '../utils/recEmployerInfoDb.js';
import {
  handleEmployerInfoError,
  sendFail,
  sendOk,
  sendPackageOutcome
} from '../utils/recEmployerInfoResponses.js';

const router = express.Router();

/** Wrap route work with consistent employer-info error mapping. */
function run(handler, fallbackMessage) {
  return asyncHandler(async (req, res) => {
    try {
      return await handler(req, res);
    } catch (err) {
      return handleEmployerInfoError(res, err, fallbackMessage);
    }
  });
}

/**
 * After CREATE/UPDATE/SET_STATUS, re-fetch from the view for complete API shape.
 * @param {{ data?: unknown, rawData?: unknown }} pkg
 * @param {string|null} [guidHint]
 */
async function resolveMutationData(pkg, guidHint = null) {
  const guid =
    guidHint ||
    pkg?.data?.employer_info_guid ||
    extractGuidFromPackageResult(pkg?.rawData) ||
    null;

  if (guid) {
    try {
      return await getEmployerInfoByGuid(String(guid));
    } catch (_) {
      /* fall through to package data */
    }
  }

  if (pkg?.data && typeof pkg.data === 'object' && !Array.isArray(pkg.data)) {
    return pkg.data;
  }
  return pkg?.data ?? null;
}

/**
 * Package outcome with view refresh on success.
 * @param {import('express').Response} res
 * @param {{ status?: string, message?: string, data?: unknown, rawData?: unknown }} pkg
 * @param {{ successMessage: string, successHttpStatus?: number, guidHint?: string|null }} options
 */
async function sendMutatedPackage(res, pkg, { successMessage, successHttpStatus = 200, guidHint = null }) {
  if (!packageStatusIsSuccess(pkg?.status)) {
    return sendPackageOutcome(res, pkg);
  }
  return sendPackageOutcome(res, pkg, {
    successMessage,
    successHttpStatus,
    data: await resolveMutationData(pkg, guidHint)
  });
}

function sendLogoBinary(res, file) {
  const fileName = file.logo_file_name || 'logo';
  res.setHeader('Content-Type', file.logo_mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Content-Length', String(file.logo.length));
  return res.status(200).send(file.logo);
}

router.get(
  '/',
  run(async (req, res) => {
    const data = await listEmployerInfo(parseListQuery(req.query));
    return sendOk(res, MESSAGES.LIST_OK, data);
  })
);

router.get(
  '/:guid/logo',
  run(async (req, res) => {
    const file = await getEmployerInfoLogoByGuid(parseEmployerInfoGuid(req.params.guid));
    if (!file?.logo) return sendFail(res, MESSAGES.LOGO_NOT_FOUND, 404);
    return sendLogoBinary(res, file);
  }, MESSAGES.LOGO_FETCH_FAIL)
);

router.delete(
  '/:guid/logo',
  run(async (req, res) => {
    const pkg = await clearEmployerInfoLogo(parseEmployerInfoGuid(req.params.guid));
    return sendPackageOutcome(res, pkg, {
      successMessage: MESSAGES.CLEAR_LOGO_OK,
      data: null
    });
  })
);

router.patch(
  '/:guid/status',
  run(async (req, res) => {
    const guid = parseEmployerInfoGuid(req.params.guid);
    const pkg = await setEmployerInfoStatus(guid, parseActiveFlag(req.body?.active_flag));
    return sendMutatedPackage(res, pkg, {
      successMessage: pkg.message || MESSAGES.STATUS_OK,
      guidHint: guid
    });
  })
);

router.get(
  '/:guid',
  run(async (req, res) => {
    const data = await getEmployerInfoByGuid(parseEmployerInfoGuid(req.params.guid));
    return sendOk(res, MESSAGES.GET_OK, data);
  })
);

router.post(
  '/',
  requireEmployerInfoMultipart,
  run(async (req, res) => {
    const payload = buildEmployerInfoPayload(req.body || {});
    const logo = validateLogoUpload(getUploadedLogoFile(req), { required: true });
    const pkg = await createEmployerInfo(payload, logo);
    return sendMutatedPackage(res, pkg, {
      successMessage: MESSAGES.CREATE_OK,
      successHttpStatus: 201
    });
  })
);

router.put(
  '/:guid',
  requireEmployerInfoMultipart,
  run(async (req, res) => {
    const guid = parseEmployerInfoGuid(req.params.guid);
    const payload = buildEmployerInfoPayload(req.body || {}, { employerInfoGuid: guid });
    const logo = validateLogoUpload(getUploadedLogoFile(req));
    const pkg = await updateEmployerInfo(payload, logo);
    return sendMutatedPackage(res, pkg, {
      successMessage: MESSAGES.UPDATE_OK,
      guidHint: guid
    });
  })
);

router.delete(
  '/:guid',
  run(async (req, res) => {
    const pkg = await deleteEmployerInfo(parseEmployerInfoGuid(req.params.guid));
    return sendPackageOutcome(res, pkg, {
      successMessage: MESSAGES.DELETE_OK,
      data: null
    });
  })
);

export default router;
