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
  listLookupValues,
  getLookupValueByGuid,
  createLookupValue,
  updateLookupValue,
  deleteLookupValue
} from '../model/lookupValueModel.js';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await listLookupValues(
      {
        enterprise_id: req.query.enterprise_id,
        lookup_type_code: req.query.lookup_type_code,
        active_flag: req.query.active_flag
      },
      req.query
    );
    return sendPaginatedList(res, result, 'Lookup values fetched successfully');
  })
);

router.get(
  '/:lookup_value_guid',
  asyncHandler(async (req, res) => {
    const data = await getLookupValueByGuid(req.params.lookup_value_guid, req.query.enterprise_id);
    return sendSuccess(res, { message: 'Lookup value fetched successfully', data: requireEntity(data, 'Lookup value not found.') });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = await createLookupValue(withAuditFields(req.body, req));
    return sendCreated(res, { message: 'Lookup value created successfully', data });
  })
);

router.put(
  '/:lookup_value_guid',
  asyncHandler(async (req, res) => {
    await updateLookupValue(req.params.lookup_value_guid, withAuditFields(req.body, req));
    return sendUpdated(res, { message: 'Lookup value updated successfully' });
  })
);

router.delete(
  '/:lookup_value_guid',
  asyncHandler(async (req, res) => {
    await deleteLookupValue(req.params.lookup_value_guid, enterpriseIdFromRequest(req));
    return sendDeleted(res, { message: 'Lookup value deleted successfully' });
  })
);

export default router;
