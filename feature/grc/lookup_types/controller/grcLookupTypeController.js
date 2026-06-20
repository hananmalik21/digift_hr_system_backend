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
  listLookupTypes,
  getLookupTypeByGuid,
  createLookupType,
  updateLookupType,
  deleteLookupType
} from '../model/lookupTypeModel.js';
import { listLookupValuesByTypeCode } from '../../lookup_values/model/lookupValueModel.js';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await listLookupTypes(
      {
        active_flag: req.query.active_flag,
        lookup_type_code: req.query.lookup_type_code
      },
      req.query
    );
    return sendPaginatedList(res, result, 'Lookup types fetched successfully');
  })
);

router.get(
  '/:lookup_type_code/values',
  asyncHandler(async (req, res) => {
    const data = await listLookupValuesByTypeCode(
      req.params.lookup_type_code,
      req.query.enterprise_id
    );
    return sendSuccess(res, { message: 'Lookup values fetched successfully', data });
  })
);

router.get(
  '/:lookup_type_guid',
  asyncHandler(async (req, res) => {
    const data = await getLookupTypeByGuid(req.params.lookup_type_guid);
    return sendSuccess(res, { message: 'Lookup type fetched successfully', data: requireEntity(data, 'Lookup type not found.') });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = await createLookupType(withAuditFields(req.body, req));
    return sendCreated(res, { message: 'Lookup type created successfully', data });
  })
);

router.put(
  '/:lookup_type_guid',
  asyncHandler(async (req, res) => {
    await updateLookupType(req.params.lookup_type_guid, withAuditFields(req.body, req));
    return sendUpdated(res, { message: 'Lookup type updated successfully' });
  })
);

router.delete(
  '/:lookup_type_guid',
  asyncHandler(async (req, res) => {
    await deleteLookupType(req.params.lookup_type_guid);
    return sendDeleted(res, { message: 'Lookup type deleted successfully' });
  })
);

export default router;
