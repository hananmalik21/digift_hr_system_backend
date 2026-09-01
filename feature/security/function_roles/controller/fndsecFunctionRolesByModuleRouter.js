import express from 'express';
import { asyncHandler } from '@digifyhr/common';
import { ValidationError } from '../../../../utils/errors/index.js';
import { listFunctionRolesByModuleFromView } from '../model/fndsecFunctionRolesViewModel.js';

const router = express.Router();

function sendFail(res, message, httpStatus = 500) {
  return res.status(httpStatus).json({ success: false, message });
}

router.get(
  '/:moduleId/function-roles',
  asyncHandler(async (req, res) => {
    try {
      const { data, pagination } = await listFunctionRolesByModuleFromView(req.params.moduleId, req.query || {});
      return res.status(200).json({ success: true, data, pagination });
    } catch (err) {
      if (err instanceof ValidationError) {
        const details = Array.isArray(err.errors) ? err.errors.filter(Boolean) : [];
        const message = details[0] || err.message || 'Validation failed';
        return sendFail(res, message, 400);
      }
      return sendFail(res, err?.message || String(err));
    }
  })
);

export default router;
