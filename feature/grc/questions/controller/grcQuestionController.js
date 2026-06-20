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
  listQuestions,
  getQuestionByGuid,
  createQuestion,
  updateQuestion,
  deleteQuestion
} from '../model/questionModel.js';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await listQuestions(
      {
        enterprise_id: req.query.enterprise_id,
        category_guid: req.query.category_guid,
        subcategory_guid: req.query.subcategory_guid,
        question_type_code: req.query.question_type_code,
        active_flag: req.query.active_flag
      },
      req.query
    );
    return sendPaginatedList(res, result, 'Questions fetched successfully');
  })
);

router.get(
  '/:question_guid',
  asyncHandler(async (req, res) => {
    const data = await getQuestionByGuid(req.params.question_guid, req.query.enterprise_id);
    return sendSuccess(res, { message: 'Question fetched successfully', data: requireEntity(data, 'Question not found.') });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = await createQuestion(withAuditFields(req.body, req));
    return sendCreated(res, { message: 'Question created successfully', data });
  })
);

router.put(
  '/:question_guid',
  asyncHandler(async (req, res) => {
    await updateQuestion(req.params.question_guid, withAuditFields(req.body, req));
    return sendUpdated(res, { message: 'Question updated successfully' });
  })
);

router.delete(
  '/:question_guid',
  asyncHandler(async (req, res) => {
    await deleteQuestion(req.params.question_guid, enterpriseIdFromRequest(req));
    return sendDeleted(res, { message: 'Question deleted successfully' });
  })
);

export default router;
