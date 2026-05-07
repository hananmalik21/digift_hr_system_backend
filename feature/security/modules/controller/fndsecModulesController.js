import express from 'express';
import multer from 'multer';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { sendCreated, sendDeleted, sendSuccess, sendUpdated } from '../../../../utils/response.js';
import { ValidationError } from '../../../../utils/errors/index.js';
import { buildPaginationMeta } from '../../../../utils/paginationUtils.js';
import {
  createModule,
  updateModule,
  deleteModule,
  listModules,
  getModuleByGuidOrId,
  getModuleIconBufferByGuidOrId
} from '../model/fndsecModulesModel.js';
import { listActiveSubModulesByModuleId, listActiveSubModulesByModuleIdPaginated } from '../../sub_modules/model/fndsecSubModulesModel.js';
import {
  resolveActor,
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

function baseUrlFromReq(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function withModuleIconUrl(req, m) {
  if (!m || typeof m !== 'object') return m;
  const id = m.module_guid || m.module_id;
  if (!id) return m;
  return {
    ...m,
    icon_url: `${baseUrlFromReq(req)}/api/security/modules/${id}/icon`
  };
}

function withSubModuleIconUrlNoIcon(req, sm) {
  if (!sm || typeof sm !== 'object') return sm;
  // eslint-disable-next-line no-unused-vars
  const { icon, ...rest } = sm;
  const id = rest.sub_module_guid || rest.sub_module_id;
  return id
    ? { ...rest, icon_url: `${baseUrlFromReq(req)}/api/security/sub-modules/${id}/icon` }
    : rest;
}

/**
 * GET /api/security/modules/:moduleGuid/icon
 * Download icon as binary.
 */
router.get(
  '/:moduleGuid/icon',
  asyncHandler(async (req, res) => {
    const buf = await getModuleIconBufferByGuidOrId(req.params.moduleGuid);
    res.setHeader('Content-Type', 'application/octet-stream');
    return res.status(200).send(buf);
  })
);

/**
 * POST /api/security/modules
 * Create module (module_guid generated server-side).
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
        data: withModuleIconUrl(req, result)
      });
    } catch (err) {
      throw mapModuleConflict(err) || err;
    }
  })
);

/**
 * PUT /api/security/modules/:moduleGuid
 * Update module by module_id OR module_guid.
 */
router.put(
  '/:moduleGuid',
  upload.single('icon'),
  handleMulterError,
  asyncHandler(async (req, res) => {
    const actor = resolveActor(req);
    const patch = attachIconBuffer({ ...(req.body || {}) }, req.file);
    try {
      const data = await updateModule(req.params.moduleGuid, patch, actor);
      return sendUpdated(res, { message: 'Module updated successfully', data: withModuleIconUrl(req, data) });
    } catch (err) {
      throw mapModuleConflict(err) || err;
    }
  })
);

/**
 * DELETE /api/security/modules/:moduleGuid
 * Hard delete via FNDSEC.FNDSEC_MODULES_API_PKG.DELETE_MODULE (global modules).
 */
router.delete(
  '/:moduleGuid',
  asyncHandler(async (req, res) => {
    const actor = resolveActor(req);
    const data = await deleteModule(req.params.moduleGuid, actor);
    return sendDeleted(res, { message: 'Module deleted successfully', data: withModuleIconUrl(req, data) });
  })
);

/**
 * GET /api/security/modules?page=&page_size=&search=&status_code=&category_code=
 * Global list of active modules ordered by display_order; includes total count and icon base64.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = parseModuleListQuery(req);
    const pagination = parseListPagination(req.query);
    const { rows, total } = await listModules(filters, pagination);
    const p = buildPaginationMeta(pagination.page, pagination.pageSize, total);
    return sendSuccess(res, {
      message: 'Modules fetched successfully',
      data: Array.isArray(rows) ? rows.map((m) => withModuleIconUrl(req, m)) : rows,
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
 * GET /api/security/modules/:moduleGuid
 * Get full module by guid OR numeric module_id; includes icon base64 and audit fields.
 */
router.get(
  '/:moduleGuid',
  asyncHandler(async (req, res) => {
    const data = await getModuleByGuidOrId(req.params.moduleGuid);
    return sendSuccess(res, { message: 'Module fetched successfully', data: withModuleIconUrl(req, data) });
  })
);

/**
 * GET /api/security/modules/:moduleIdOrGuid/sub-modules
 * Returns active sub-modules for a single module (no base64 icon; uses icon_url).
 */
router.get(
  '/:moduleIdOrGuid/sub-modules',
  asyncHandler(async (req, res) => {
    const paginationRequested = req.query?.page !== undefined || req.query?.page_size !== undefined;

    const result = paginationRequested
      ? await listActiveSubModulesByModuleIdPaginated(req.params.moduleIdOrGuid, parseListPagination(req.query))
      : { rows: await listActiveSubModulesByModuleId(req.params.moduleIdOrGuid) };

    const rows = result?.rows || [];
    const total = Number(result?.total ?? rows.length) || 0;
    const page = Number(result?.page ?? 1) || 1;
    const pageSize = Number(result?.pageSize ?? (rows.length || 0)) || 0;
    const p = buildPaginationMeta(page, pageSize || 1, total);

    return sendSuccess(res, {
      message: 'Sub-modules fetched successfully',
      data: Array.isArray(rows) ? rows.map((sm) => withSubModuleIconUrlNoIcon(req, sm)) : rows,
      pagination: {
        page: p.page,
        page_size: p.pageSize === 1 && pageSize === 0 ? 0 : p.pageSize,
        total: p.total,
        total_pages: pageSize === 0 ? 0 : p.totalPages,
        has_next: pageSize === 0 ? false : p.hasNext,
        has_previous: pageSize === 0 ? false : p.hasPrevious
      }
    });
  })
);

export default router;
