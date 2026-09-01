import express from 'express';
import { asyncHandler } from '@digifyhr/common';
import {
  buildListPaginationMeta,
  handleMutationError,
  handleReadError,
  resolveAuditActor,
  sendPackageResponse
} from '../../shared/recControllerHelpers.js';
import {
  sendCreateEntityResponse,
  sendPackageActionResponse
} from '../../shared/recPackageResponses.js';
import { listTalentPoolsFromView } from '../model/recTalentPoolViewModel.js';
import {
  createPoolViaPackage,
  deletePoolViaPackage,
  updatePoolViaPackage
} from '../model/recTalentPoolsModel.js';
import {
  parsePoolGuidParam,
  validateCreatePoolBody,
  validateDeletePoolBody,
  validateUpdatePoolBody
} from '../utils/recTalentPoolValidators.js';

const router = express.Router();
const MUTATION_ERROR_MESSAGE = 'Unable to process talent pool request. Please try again.';

/**
 * GET /api/rec/talent-pools?enterprise_id=1&search=engineering&page=1&page_size=10
 * Lists active pools from REC.TALENT_POOLS_V.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    try {
      const { rows, total, page, limit } = await listTalentPoolsFromView(req.query);
      return sendPackageResponse(res, 200, {
        success: true,
        message: 'Talent pools fetched successfully',
        meta: buildListPaginationMeta(page, limit, total),
        data: rows
      });
    } catch (err) {
      return handleReadError(res, err, 'Unable to fetch talent pools. Please try again.');
    }
  })
);

/**
 * POST /api/rec/talent-pools
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    try {
      const body = { ...(req.body || {}) };
      body.created_by = resolveAuditActor(req, body, 'created_by');
      validateCreatePoolBody(body);

      const pkg = await createPoolViaPackage(body);
      return sendCreateEntityResponse(res, pkg, { idField: 'pool_id', guidField: 'pool_guid' });
    } catch (err) {
      return handleMutationError(res, err, MUTATION_ERROR_MESSAGE);
    }
  })
);

/**
 * PUT /api/rec/talent-pools/:pool_guid
 */
router.put(
  '/:pool_guid',
  asyncHandler(async (req, res) => {
    try {
      const pool_guid = parsePoolGuidParam(req.params.pool_guid);
      const body = { ...(req.body || {}), pool_guid };
      body.updated_by = resolveAuditActor(req, body, 'updated_by');
      validateUpdatePoolBody(body, pool_guid);

      const pkg = await updatePoolViaPackage(body);
      return sendPackageActionResponse(res, pkg);
    } catch (err) {
      return handleMutationError(res, err, MUTATION_ERROR_MESSAGE);
    }
  })
);

/**
 * DELETE /api/rec/talent-pools/:pool_guid
 * Body: { enterprise_id, deleted_by }
 */
router.delete(
  '/:pool_guid',
  asyncHandler(async (req, res) => {
    try {
      const pool_guid = parsePoolGuidParam(req.params.pool_guid ?? req.body?.pool_guid);
      const body = { ...(req.body || {}), pool_guid };
      body.deleted_by = resolveAuditActor(req, body, 'deleted_by');
      validateDeletePoolBody(body, pool_guid);

      const pkg = await deletePoolViaPackage(body);
      return sendPackageActionResponse(res, pkg);
    } catch (err) {
      return handleMutationError(res, err, MUTATION_ERROR_MESSAGE);
    }
  })
);

export default router;
