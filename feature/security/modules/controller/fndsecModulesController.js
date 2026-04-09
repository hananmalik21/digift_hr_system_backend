import express from 'express';
import multer from 'multer';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { sendCreated, sendDeleted, sendList, sendSuccess, sendUpdated } from '../../../../utils/response.js';
import { ValidationError } from '../../../../utils/errors/index.js';
import { buildPaginationMeta } from '../../../../utils/paginationUtils.js';
import {
  createModule,
  updateModule,
  deleteModule,
  listModules,
  getModuleByGuid
} from '../model/fndsecModulesModel.js';
import {
  resolveActor,
  parseEnterpriseIdFrom,
  parseModuleListQuery,
  parseListPagination,
  mapModuleConflict
} from '../utils/requestParsers.js';

const router = express.Router();

const ICON_MAX_BYTES = Number(process.env.FNDSEC_MODULE_ICON_MAX_BYTES) || 5 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ICON_MAX_BYTES }
});

function handleMulterError(err, req, res, next) {
  if (!err) return next();
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return next(
      new ValidationError('Validation failed', [
        `icon exceeds maximum size (${ICON_MAX_BYTES} bytes)`
      ])
    );
  }
  return next(err);
}

function attachIconBuffer(body, file) {
  if (file?.buffer) {
    body.icon_buffer = file.buffer;
  }
  return body;
}

/**
 * POST /api/security/modules
 * Create module (module_guid generated server-side). enterprise_id must be in body.
 */
router.post(
  '/',
  upload.single('icon'),
  handleMulterError,
  asyncHandler(async (req, res) => {
    const actor = resolveActor(req);
    const body = attachIconBuffer({ ...(req.body || {}) }, req.file);
    try {
      const result = await createModule(body, actor);
      return sendCreated(res, {
        message: 'Module created successfully',
        data: result
      });
    } catch (err) {
      throw mapModuleConflict(err) || err;
    }
  })
);

/**
 * PUT /api/security/modules/:moduleGuid
 * Update module by module_guid + enterprise_id (mandatory).
 */
router.put(
  '/:moduleGuid',
  upload.single('icon'),
  handleMulterError,
  asyncHandler(async (req, res) => {
    const actor = resolveActor(req);
    const enterpriseId = parseEnterpriseIdFrom(req, { fromBody: true });
    const patch = attachIconBuffer({ ...(req.body || {}) }, req.file);
    try {
      const data = await updateModule(req.params.moduleGuid, enterpriseId, patch, actor);
      return sendUpdated(res, { message: 'Module updated successfully', data });
    } catch (err) {
      throw mapModuleConflict(err) || err;
    }
  })
);

/**
 * DELETE /api/security/modules/:moduleGuid?enterprise_id=
 * Hard delete via FNDSEC.FNDSEC_MODULES_API_PKG.DELETE_MODULE.
 */
router.delete(
  '/:moduleGuid',
  asyncHandler(async (req, res) => {
    const actor = resolveActor(req);
    const enterpriseId = parseEnterpriseIdFrom(req);
    const data = await deleteModule(req.params.moduleGuid, enterpriseId, actor);
    return sendDeleted(res, { message: 'Module deleted successfully', data });
  })
);

/**
 * GET /api/security/modules?enterprise_id=&page=&page_size=&search=&status_code=&active_flag=&category_code=
 * Paginated list ordered by display_order; includes total count and icon base64.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = parseModuleListQuery(req);
    const pagination = parseListPagination(req.query);
    const { rows, total } = await listModules(filters, pagination);
    const meta = buildPaginationMeta(pagination.page, pagination.pageSize, total);
    return sendList(res, {
      message: 'Modules fetched successfully',
      data: rows,
      meta: { total, pagination: meta }
    });
  })
);

/**
 * GET /api/security/modules/:moduleGuid?enterprise_id=
 * Get full module by guid (enterprise filtered), includes icon base64 and audit fields.
 */
router.get(
  '/:moduleGuid',
  asyncHandler(async (req, res) => {
    const enterpriseId = parseEnterpriseIdFrom(req);
    const data = await getModuleByGuid(enterpriseId, req.params.moduleGuid);
    return sendSuccess(res, { message: 'Module fetched successfully', data });
  })
);

export default router;
