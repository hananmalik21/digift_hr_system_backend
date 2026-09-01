import express from 'express';
import multer from 'multer';
import { asyncHandler } from '@digifyhr/common';
import { sendCreated, sendDeleted, sendSuccess, sendUpdated } from '@digifyhr/common';
import { ValidationError } from '../../../../utils/errors/index.js';
import {
  createSubModule,
  updateSubModule,
  deleteSubModule,
  getSubModuleIconBufferByGuidOrId
} from '../model/fndsecSubModulesModel.js';
import { resolveActor, mapSubModuleConflict } from '../utils/requestParsers.js';

const router = express.Router();

const ICON_MAX_BYTES = Number(process.env.FNDSEC_SUB_MODULE_ICON_MAX_BYTES) || 5 * 1024 * 1024;
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

function withIconUrl(req, row) {
  if (!row || typeof row !== 'object') return row;
  const id = row.sub_module_guid || row.sub_module_id;
  if (!id) return row;
  // Remove `icon` from response payload (use icon_url instead)
  // eslint-disable-next-line no-unused-vars
  const { icon, ...rest } = row;
  return {
    ...rest,
    icon_url: `${baseUrlFromReq(req)}/api/security/sub-modules/${id}/icon`
  };
}

/**
 * GET /api/security/sub-modules/:subModuleGuidOrId/icon
 * Download icon as binary.
 */
router.get(
  '/:subModuleGuidOrId/icon',
  asyncHandler(async (req, res) => {
    const buf = await getSubModuleIconBufferByGuidOrId(req.params.subModuleGuidOrId);
    res.setHeader('Content-Type', 'application/octet-stream');
    return res.status(200).send(buf);
  })
);

/**
 * POST /api/security/sub-modules
 */
router.post(
  '/',
  upload.single('icon'),
  handleMulterError,
  asyncHandler(async (req, res) => {
    const actor = resolveActor(req);
    const body = attachIconBuffer({ ...(req.body || {}) }, req.file);
    try {
      const result = await createSubModule(body, actor);
      return sendCreated(res, { message: 'Sub-module created successfully', data: withIconUrl(req, result) });
    } catch (err) {
      throw mapSubModuleConflict(err) || err;
    }
  })
);

/**
 * PUT /api/security/sub-modules/:subModuleGuidOrId
 */
router.put(
  '/:subModuleGuidOrId',
  upload.single('icon'),
  handleMulterError,
  asyncHandler(async (req, res) => {
    const actor = resolveActor(req);
    const patch = attachIconBuffer({ ...(req.body || {}) }, req.file);
    try {
      const data = await updateSubModule(req.params.subModuleGuidOrId, patch, actor);
      return sendUpdated(res, { message: 'Sub-module updated successfully', data: withIconUrl(req, data) });
    } catch (err) {
      throw mapSubModuleConflict(err) || err;
    }
  })
);

/**
 * DELETE /api/security/sub-modules/:subModuleGuidOrId
 */
router.delete(
  '/:subModuleGuidOrId',
  asyncHandler(async (req, res) => {
    const actor = resolveActor(req);
    const data = await deleteSubModule(req.params.subModuleGuidOrId, actor);
    return sendDeleted(res, { message: 'Sub-module deleted successfully', data: withIconUrl(req, data) });
  })
);

/**
 * NOTE: GET list/get-by-id APIs removed. Use GET /api/security/modules/tree.
 */

export default router;

