import express from 'express';
import { asyncHandler } from '@digifyhr/common';
import { sendCreated, sendDeleted, sendSuccess, sendUpdated } from '@digifyhr/common';
import { buildPaginationMeta, parsePagination } from '@digifyhr/common';
import {
  createAction,
  updateAction,
  deleteAction,
  getActionByGuidOrId,
  listActiveActionsBySubModulePaginated,
  upsertActionsBulk
} from '../model/fndsecActionsModel.js';
import { resolveActor, mapActionConflict, parseBulkActionsBody } from '../utils/requestParsers.js';

const router = express.Router();

async function runMutating(fn) {
  try {
    return await fn();
  } catch (err) {
    throw mapActionConflict(err) || err;
  }
}

/**
 * POST /api/security/actions
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = await runMutating(() => createAction(req.body || {}, resolveActor(req)));
    return sendCreated(res, { message: 'Action created successfully', data });
  })
);

/**
 * POST /api/security/actions/bulk
 * Insert and/or update multiple actions for one sub-module in a single transaction.
 * Body: { sub_module_id, actions: [{ action_guid?, action_id?, action_code, action_name, ... }] }
 */
router.post(
  '/bulk',
  asyncHandler(async (req, res) => {
    const { sub_module_id, actions } = parseBulkActionsBody(req.body);
    const data = await runMutating(() => upsertActionsBulk(sub_module_id, actions, resolveActor(req)));
    return sendCreated(res, { message: 'Actions upserted successfully', data });
  })
);

/**
 * PUT /api/security/actions/:actionGuidOrId
 * Requires sub_module_id in body (id or guid).
 */
router.put(
  '/:actionGuidOrId',
  asyncHandler(async (req, res) => {
    const data = await runMutating(() =>
      updateAction(req.params.actionGuidOrId, req.body || {}, resolveActor(req))
    );
    return sendUpdated(res, { message: 'Action updated successfully', data });
  })
);

/**
 * DELETE /api/security/actions/:actionGuidOrId
 */
router.delete(
  '/:actionGuidOrId',
  asyncHandler(async (req, res) => {
    const data = await deleteAction(req.params.actionGuidOrId, resolveActor(req));
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
