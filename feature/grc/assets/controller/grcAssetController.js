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
  listAssets,
  getAssetByGuid,
  createAsset,
  updateAsset,
  deleteAsset
} from '../model/assetModel.js';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await listAssets(
      {
        enterprise_id: req.query.enterprise_id,
        active_flag: req.query.active_flag,
        search: req.query.search,
        asset_type_code: req.query.asset_type_code ?? req.query.type,
        risk_level_code: req.query.risk_level_code ?? req.query.risk_level,
        criticality_code: req.query.criticality_code ?? req.query.criticality,
        classification_code: req.query.classification_code ?? req.query.classification,
        environment_code: req.query.environment_code ?? req.query.environment,
        cloud_provider_code: req.query.cloud_provider_code ?? req.query.cloud_provider
      },
      req.query,
      {
        sort_by: req.query.sort_by,
        sort_order: req.query.sort_order
      }
    );
    return sendPaginatedList(res, result, 'Assets fetched successfully');
  })
);

router.get(
  '/:asset_guid',
  asyncHandler(async (req, res) => {
    const data = await getAssetByGuid(req.params.asset_guid, req.query.enterprise_id);
    return sendSuccess(res, { message: 'Asset fetched successfully', data: requireEntity(data, 'Asset not found.') });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = await createAsset(withAuditFields(req.body, req));
    return sendCreated(res, { message: 'Asset created successfully', data });
  })
);

router.put(
  '/:asset_guid',
  asyncHandler(async (req, res) => {
    await updateAsset(req.params.asset_guid, withAuditFields(req.body, req));
    const data = await getAssetByGuid(
      req.params.asset_guid,
      req.body?.enterprise_id ?? req.query.enterprise_id
    );
    return sendUpdated(res, { message: 'Asset updated successfully', data });
  })
);

router.delete(
  '/:asset_guid',
  asyncHandler(async (req, res) => {
    await deleteAsset(req.params.asset_guid, enterpriseIdFromRequest(req));
    return sendDeleted(res, { message: 'Asset deleted successfully' });
  })
);

export default router;
