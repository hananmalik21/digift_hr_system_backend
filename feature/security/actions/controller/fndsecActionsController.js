import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { sendCreated, sendDeleted, sendSuccess, sendUpdated } from '../../../../utils/response.js';
import { buildPaginationMeta, parsePagination } from '../../../../utils/paginationUtils.js';
import {
  createAction,
  updateAction,
  deleteAction,
  getActionByGuidOrId,
  listActiveActionsBySubModulePaginated
} from '../model/fndsecActionsModel.js';
import { resolveActor, mapActionConflict } from '../utils/requestParsers.js';

const router = express.Router();

/**
 * POST /api/security/actions
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const actor = resolveActor(req);
    try {
      const data = await createAction(req.body || {}, actor);
      return sendCreated(res, { message: 'Action created successfully', data });
    } catch (err) {
      throw mapActionConflict(err) || err;
    }
  })
);

/**
 * PUT /api/security/actions/:actionGuidOrId
 * Requires sub_module_id in body (id or guid).
 */
router.put(
  '/:actionGuidOrId',
  asyncHandler(async (req, res) => {
    const actor = resolveActor(req);
    try {
      const data = await updateAction(req.params.actionGuidOrId, req.body || {}, actor);
      return sendUpdated(res, { message: 'Action updated successfully', data });
    } catch (err) {
      throw mapActionConflict(err) || err;
    }
  })
);

/**
 * DELETE /api/security/actions/:actionGuidOrId
 */
router.delete(
  '/:actionGuidOrId',
  asyncHandler(async (req, res) => {
    const actor = resolveActor(req);
    const data = await deleteAction(req.params.actionGuidOrId, actor);
    return sendDeleted(res, { message: 'Action deleted successfully', data });
  })
);

/**
 * GET /api/security/actions/sub-modules/:subModuleIdOrGuid
 * List active actions for a sub-module.
 */
router.get(
  '/sub-modules/:subModuleIdOrGuid',
  asyncHandler(async (req, res) => {
    const pagination = parsePagination(req.query);
    const { rows, total } = await listActiveActionsBySubModulePaginated(req.params.subModuleIdOrGuid, pagination);
    const p = buildPaginationMeta(pagination.page, pagination.pageSize, total);
    return sendSuccess(res, {
      message: 'Actions fetched successfully',
      data: rows,
      meta: {
        total,
        pagination: {
          page: p.page,
          page_size: p.pageSize,
          total: p.total,
          total_pages: p.totalPages,
          has_next: p.hasNext,
          has_previous: p.hasPrevious
        }
      }
    });
  })
);

/**
 * GET /api/security/actions/:actionGuidOrId
 */
router.get(
  '/:actionGuidOrId',
  asyncHandler(async (req, res) => {
    const data = await getActionByGuidOrId(req.params.actionGuidOrId);
    return sendSuccess(res, { message: 'Action fetched successfully', data });
  })
);

export default router;

