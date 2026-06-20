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
  listQuestionCategories,
  getQuestionCategoryByGuid,
  createQuestionCategory,
  updateQuestionCategory,
  deleteQuestionCategory
} from '../model/questionCategoryModel.js';
import { listSubcategoriesByCategory } from '../../question_subcategories/model/questionSubcategoryModel.js';
import { listQuestionsByCategory } from '../../questions/model/questionModel.js';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await listQuestionCategories(
      {
        enterprise_id: req.query.enterprise_id,
        active_flag: req.query.active_flag,
        category_name: req.query.category_name
      },
      req.query
    );
    return sendPaginatedList(res, result, 'Categories fetched successfully');
  })
);

router.get(
  '/:category_guid/subcategories',
  asyncHandler(async (req, res) => {
    const result = await listSubcategoriesByCategory(
      req.params.category_guid,
      req.query.enterprise_id,
      req.query
    );
    return sendPaginatedList(res, result, 'Subcategories fetched successfully');
  })
);

router.get(
  '/:category_guid/questions',
  asyncHandler(async (req, res) => {
    const result = await listQuestionsByCategory(
      req.params.category_guid,
      req.query.enterprise_id,
      req.query
    );
    return sendPaginatedList(res, result, 'Questions fetched successfully');
  })
);

router.get(
  '/:category_guid',
  asyncHandler(async (req, res) => {
    const data = await getQuestionCategoryByGuid(req.params.category_guid, req.query.enterprise_id);
    return sendSuccess(res, { message: 'Category fetched successfully', data: requireEntity(data, 'Category not found.') });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const created = await createQuestionCategory(withAuditFields(req.body, req));
    return sendCreated(res, {
      message: 'Category created successfully',
      data: {
        category_id: created.category_id,
        category_guid: created.category_guid
      }
    });
  })
);

router.put(
  '/:category_guid',
  asyncHandler(async (req, res) => {
    await updateQuestionCategory(req.params.category_guid, withAuditFields(req.body, req));
    return sendUpdated(res, { message: 'Category updated successfully' });
  })
);

router.delete(
  '/:category_guid',
  asyncHandler(async (req, res) => {
    await deleteQuestionCategory(req.params.category_guid, enterpriseIdFromRequest(req));
    return sendDeleted(res, { message: 'Category deleted successfully' });
  })
);

export default router;
