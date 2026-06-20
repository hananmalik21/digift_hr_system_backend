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
  listSubcategories,
  getSubcategoryByGuid,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory
} from '../model/questionSubcategoryModel.js';
import { listQuestionsBySubcategory } from '../../questions/model/questionModel.js';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await listSubcategories(
      {
        enterprise_id: req.query.enterprise_id,
        active_flag: req.query.active_flag,
        category_guid: req.query.category_guid,
        category_name: req.query.category_name,
        subcategory_name: req.query.subcategory_name
      },
      req.query
    );
    return sendPaginatedList(res, result, 'Subcategories fetched successfully');
  })
);

router.get(
  '/:subcategory_guid/questions',
  asyncHandler(async (req, res) => {
    const result = await listQuestionsBySubcategory(
      req.params.subcategory_guid,
      req.query.enterprise_id,
      req.query
    );
    return sendPaginatedList(res, result, 'Questions fetched successfully');
  })
);

router.get(
  '/:subcategory_guid',
  asyncHandler(async (req, res) => {
    const data = await getSubcategoryByGuid(req.params.subcategory_guid, req.query.enterprise_id);
    return sendSuccess(res, { message: 'Subcategory fetched successfully', data: requireEntity(data, 'Subcategory not found.') });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = await createSubcategory(withAuditFields(req.body, req));
    return sendCreated(res, { message: 'Subcategory created successfully', data });
  })
);

router.put(
  '/:subcategory_guid',
  asyncHandler(async (req, res) => {
    await updateSubcategory(req.params.subcategory_guid, withAuditFields(req.body, req));
    return sendUpdated(res, { message: 'Subcategory updated successfully' });
  })
);

router.delete(
  '/:subcategory_guid',
  asyncHandler(async (req, res) => {
    await deleteSubcategory(req.params.subcategory_guid, enterpriseIdFromRequest(req));
    return sendDeleted(res, { message: 'Subcategory deleted successfully' });
  })
);

export default router;
