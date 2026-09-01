/**
 * Employer Info APIs — REC.REC_EMPLOYER_INFO_PKG + REC.V_EMPLOYER_INFO
 *
 * GET    /api/employer-info
 * GET    /api/employer-info/:guid
 * POST   /api/employer-info          (multipart/form-data; logo required)
 * PUT    /api/employer-info/:guid    (multipart/form-data; logo optional)
 * DELETE /api/employer-info/:guid
 * PATCH  /api/employer-info/:guid/status
 * GET    /api/employer-info/:guid/logo   (public — no JWT; inline image)
 * DELETE /api/employer-info/:guid/logo
 */

import express from 'express';
import { asyncHandler } from '@digifyhr/common';
import { resolveEnterpriseIdFromRequestQuery } from '../../shared/recControllerHelpers.js';
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
import { withPublicLogoUrls } from '../utils/recEmployerInfoLogoUrl.js';
import {
  handleEmployerInfoError,
  sendFail,
  sendLogoBinary,
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
    } catch (err) {
      console.warn(
        '[recEmployerInfo] view refresh after mutation failed; using package data',
        err?.message || err
      );
    }
  }

  if (pkg?.data && typeof pkg.data === 'object' && !Array.isArray(pkg.data)) {
    return pkg.data;
  }
  return pkg?.data ?? null;
}

/**
 * Package outcome with view refresh on success.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{ status?: string, message?: string, data?: unknown, rawData?: unknown }} pkg
 * @param {{ successMessage: string, successHttpStatus?: number, guidHint?: string|null }} options
 */
async function sendMutatedPackage(req, res, pkg, { successMessage, successHttpStatus = 200, guidHint = null }) {
  if (!packageStatusIsSuccess(pkg?.status)) {
    return sendPackageOutcome(res, pkg);
  }
  const data = withPublicLogoUrls(await resolveMutationData(pkg, guidHint), req);
  return sendPackageOutcome(res, pkg, {
    successMessage,
    successHttpStatus,
    data
  });
}

router.get(
  '/',
  run(async (req, res) => {
    const enterprise_id = resolveEnterpriseIdFromRequestQuery(req);
    const data = withPublicLogoUrls(
      await listEmployerInfo(parseListQuery(req.query, { enterprise_id })),
      req
    );
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
    return sendMutatedPackage(req, res, pkg, {
      successMessage: pkg.message || MESSAGES.STATUS_OK,
      guidHint: guid
    });
  })
);

router.get(
  '/:guid',
  run(async (req, res) => {
    const data = withPublicLogoUrls(
      await getEmployerInfoByGuid(parseEmployerInfoGuid(req.params.guid)),
      req
    );
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
    return sendMutatedPackage(req, res, pkg, {
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
    return sendMutatedPackage(req, res, pkg, {
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
