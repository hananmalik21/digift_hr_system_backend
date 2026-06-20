import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  sendSuccess,
  sendCreated,
  sendUpdated,
  sendDeleted,
  sendPaginatedList,
  requireEntity
} from '../../../../utils/response.js';
import { withAuditFields } from '../../../../utils/requestUtils.js';
import { enterpriseIdFromRequest } from '../../../../utils/tenantUtils.js';
import {
  listControls,
  getControlByGuid,
  createControl,
  updateControl,
  deleteControl
} from '../model/controlModel.js';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await listControls(
      {
        enterprise_id: req.query.enterprise_id,
        active_flag: req.query.active_flag,
        search: req.query.search,
        control_type_code: req.query.control_type_code ?? req.query.type,
        status_code: req.query.status_code ?? req.query.status,
        test_frequency_code: req.query.test_frequency_code
      },
      req.query
    );
    return sendPaginatedList(res, result, 'Controls fetched successfully');
  })
);

router.get(
  '/:control_guid',
  asyncHandler(async (req, res) => {
    const data = await getControlByGuid(req.params.control_guid, req.query.enterprise_id);
    return sendSuccess(res, { message: 'Control fetched successfully', data: requireEntity(data, 'Control not found.') });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = await createControl(withAuditFields(req.body, req));
    return sendCreated(res, { message: 'Control created successfully', data });
  })
);

router.put(
  '/:control_guid',
  asyncHandler(async (req, res) => {
    await updateControl(req.params.control_guid, withAuditFields(req.body, req));
    return sendUpdated(res, { message: 'Control updated successfully' });
  })
);

router.delete(
  '/:control_guid',
  asyncHandler(async (req, res) => {
    await deleteControl(req.params.control_guid, enterpriseIdFromRequest(req));
    return sendDeleted(res, { message: 'Control deleted successfully' });
  })
);

export default router;
