import express from 'express';
import { asyncHandler } from '@digifyhr/common';
import { NotFoundError } from '../../../../utils/errors/index.js';
import { sendCreated, sendDeleted, sendSuccess, sendUpdated } from '@digifyhr/common';
import { buildPaginationMeta, parsePagination } from '@digifyhr/common';
import {
  createWorkLocation,
  deleteWorkLocation,
  getWorkLocationByGuidFromView,
  listWorkLocationsFromView,
  updateWorkLocation
} from '../model/fndsecWorkLocationsModel.js';

const router = express.Router();

/**
 * GET /api/security/work-locations/guid/:guid
 * FNDSEC.FNDSEC_WORK_LOCATIONS_V — single row by WORK_LOCATION_GUID (32 hex, dashes optional).
 */
router.get(
  '/guid/:guid',
  asyncHandler(async (req, res) => {
    const row = await getWorkLocationByGuidFromView(req.params.guid);
    if (!row) {
      throw new NotFoundError('Work location not found');
    }
    return sendSuccess(res, { message: 'Fetched successfully', data: row });
  })
);

/**
 * GET /api/security/work-locations
 * FNDSEC.FNDSEC_WORK_LOCATIONS_V — all rows; optional query: enterprise_id, active_flag, search.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const pagination = parsePagination(req.query || {});
    const { rows, total, page, pageSize } = await listWorkLocationsFromView({
      ...(req.query || {}),
      page: pagination.page,
      page_size: pagination.pageSize
    });
    const p = buildPaginationMeta(page, pageSize, total);
    return sendSuccess(res, {
      message: 'Fetched successfully',
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
 * POST /api/security/work-locations/create
 * FNDSEC.FNDSEC_WORK_LOCATIONS_PKG.CREATE_WORK_LOCATION — `message` from P_RESULT.
 */
router.post(
  '/create',
  asyncHandler(async (req, res) => {
    const { message, data } = await createWorkLocation(req.body || {});
    return sendCreated(res, {
      message: message || 'Created successfully',
      data: data && typeof data === 'object' ? data : {}
    });
  })
);

/**
 * PUT /api/security/work-locations/:guid
 * Path `guid` = 32-char hex (optional dashes), merged into `work_location_guid` for FNDSEC.FNDSEC_WORK_LOCATIONS_PKG.UPDATE_WORK_LOCATION.
 */
router.put(
  '/:guid',
  asyncHandler(async (req, res) => {
    const payload = { ...(req.body || {}), work_location_guid: req.params.guid };
    const { message, data } = await updateWorkLocation(payload);
    return sendUpdated(res, {
      message: message || 'Updated successfully',
      data: data && typeof data === 'object' ? data : {}
    });
  })
);

/**
 * DELETE /api/security/work-locations/:guid
 * Path `guid` = 32-char hex (optional dashes), merged into `work_location_guid` for FNDSEC.FNDSEC_WORK_LOCATIONS_PKG.DELETE_WORK_LOCATION.
 * Optional JSON body (e.g. `work_location_id`) is still merged if the package needs it.
 */
router.delete(
  '/:guid',
  asyncHandler(async (req, res) => {
    const payload = { ...(req.body || {}), work_location_guid: req.params.guid };
    const { message, data } = await deleteWorkLocation(payload);
    return sendDeleted(res, {
      message: message || 'Deleted successfully',
      data: data && typeof data === 'object' ? data : {}
    });
  })
);

export default router;
