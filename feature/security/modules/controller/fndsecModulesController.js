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
  getModuleByGuid,
  packageFailureHttpStatus
} from '../model/fndsecModulesModel.js';
import { listActiveSubModulesByModuleId, listActiveSubModulesByModuleIdPaginated } from '../../sub_modules/model/fndsecSubModulesModel.js';
import {
  resolveActor,
  parseModuleListQuery,
  parseListPagination,
  parseModuleGuidRouteParam
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
        `icon file exceeds maximum size (${ICON_MAX_BYTES} bytes)`
      ])
    );
  }
  return next(err);
}

/**
 * Normalize multipart form-data (all values are strings) for the module package.
 * Supports JSON body, urlencoded, and Postman form-data.
 */
function normalizeModuleRequestBody(body, file) {
  const out = { ...(body || {}) };
  delete out.enterprise_id;

  if (out.display_order !== undefined && out.display_order !== '') {
    const n = Number(out.display_order);
    if (Number.isFinite(n)) out.display_order = n;
  }

  // Optional file upload named "icon" — use filename when no text icon provided
  if (file?.buffer && (out.icon == null || String(out.icon).trim() === '')) {
    out.icon = file.originalname ? String(file.originalname).trim() : out.icon;
  }

  return out;
}

function sendModulePackageFailure(res, pkg) {
  const httpStatus = packageFailureHttpStatus(pkg?.message);
  return res.status(httpStatus).json({
    status: false,
    message: pkg?.message || 'Request failed.'
  });
}

function baseUrlFromReq(req) {
  return `${req.protocol}://${req.get('host')}`;
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
 * @swagger
 * /api/security/modules:
 *   post:
 *     summary: Create a security module
 *     tags: [Security Modules]
 */
router.post(
  '/',
  upload.single('icon'),
  handleMulterError,
  asyncHandler(async (req, res) => {
    const actor = resolveActor(req);
    const body = normalizeModuleRequestBody(req.body, req.file);
    const pkg = await createModule(body, actor);
    if (!pkg.success) {
      return sendModulePackageFailure(res, pkg);
    }
    return sendCreated(res, {
      message: pkg.message || 'Module created successfully.',
      data: pkg.data
    });
  })
);

/**
 * @swagger
 * /api/security/modules/{moduleGuid}:
 *   put:
 *     summary: Update a security module by module_guid
 *     tags: [Security Modules]
 *     parameters:
 *       - in: path
 *         name: moduleGuid
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^[0-9A-Fa-f]{32}$'
 *         description: 32-character hexadecimal module GUID (dashes optional)
 */
router.put(
  '/:moduleGuid',
  upload.single('icon'),
  handleMulterError,
  asyncHandler(async (req, res) => {
    const actor = resolveActor(req);
    const moduleGuid = parseModuleGuidRouteParam(req.params.moduleGuid);
    const body = normalizeModuleRequestBody(req.body, req.file);
    try {
      const pkg = await updateModule(moduleGuid, body, actor);
      if (!pkg.success) {
        return sendModulePackageFailure(res, pkg);
      }
      return sendUpdated(res, {
        message: pkg.message || 'Module updated successfully.'
      });
    } catch (err) {
      if (err instanceof ValidationError) throw err;
      return sendModulePackageFailure(res, { message: 'Unable to process module request. Please try again.' });
    }
  })
);

/**
 * @swagger
 * /api/security/modules/{moduleGuid}:
 *   delete:
 *     summary: Delete a security module by module_guid
 *     tags: [Security Modules]
 */
router.delete(
  '/:moduleGuid',
  asyncHandler(async (req, res) => {
    const moduleGuid = parseModuleGuidRouteParam(req.params.moduleGuid);
    try {
      const pkg = await deleteModule(moduleGuid);
      if (!pkg.success) {
        return sendModulePackageFailure(res, pkg);
      }
      return sendDeleted(res, {
        message: pkg.message || 'Module deleted successfully.'
      });
    } catch (err) {
      if (err instanceof ValidationError) throw err;
      return sendModulePackageFailure(res, { message: 'Unable to process module request. Please try again.' });
    }
  })
);

/**
 * @swagger
 * /api/security/modules:
 *   get:
 *     summary: List security modules
 *     tags: [Security Modules]
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = parseModuleListQuery(req);
    const pagination = parseListPagination(req.query);
    const result = await listModules(filters, pagination);
    if (!result.success) {
      return sendModulePackageFailure(res, { message: result.message });
    }
    const p = buildPaginationMeta(pagination.page, pagination.pageSize, result.total);
    return sendSuccess(res, {
      message: result.message || 'Modules fetched successfully.',
      data: result.rows,
      meta: {
        total: result.total,
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
 * GET /api/security/modules/:moduleGuid/sub-modules
 */
router.get(
  '/:moduleGuid/sub-modules',
  asyncHandler(async (req, res) => {
    const moduleGuid = parseModuleGuidRouteParam(req.params.moduleGuid);
    const paginationRequested = req.query?.page !== undefined || req.query?.page_size !== undefined;

    const result = paginationRequested
      ? await listActiveSubModulesByModuleIdPaginated(moduleGuid, parseListPagination(req.query))
      : { rows: await listActiveSubModulesByModuleId(moduleGuid) };

    const rows = result?.rows || [];
    const total = Number(result?.total ?? rows.length) || 0;
    const page = Number(result?.page ?? 1) || 1;
    const pageSize = Number(result?.pageSize ?? (rows.length || 0)) || 0;
    const p = buildPaginationMeta(page, pageSize || 1, total);

    return res.status(200).json({
      success: true,
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

/**
 * @swagger
 * /api/security/modules/{moduleGuid}:
 *   get:
 *     summary: Get a security module by module_guid
 *     tags: [Security Modules]
 */
router.get(
  '/:moduleGuid',
  asyncHandler(async (req, res) => {
    const moduleGuid = parseModuleGuidRouteParam(req.params.moduleGuid);
    try {
      const pkg = await getModuleByGuid(moduleGuid);
      if (!pkg.success) {
        return sendModulePackageFailure(res, pkg);
      }
      return sendSuccess(res, {
        message: pkg.message || 'Module fetched successfully.',
        data: pkg.data
      });
    } catch (err) {
      if (err instanceof ValidationError) throw err;
      return sendModulePackageFailure(res, { message: 'Unable to process module request. Please try again.' });
    }
  })
);

export default router;
