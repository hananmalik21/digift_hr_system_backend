import express from 'express';
import {
  list,
  listExport,
  getOne,
  create,
  updateDraftHandler,
  submit,
  approve,
  reject,
  cancel,
} from '../controllers/tmOvertimeRequests.controller.js';

const router = express.Router({ mergeParams: true });

router.get('/export', listExport);
router.get('/', list);
router.get('/:ot_request_guid', getOne);
router.post('/', create);
router.patch('/:ot_request_guid', updateDraftHandler);
router.post('/:ot_request_guid/submit', submit);
router.post('/:ot_request_guid/approve', approve);
router.post('/:ot_request_guid/reject', reject);
router.post('/:ot_request_guid/cancel', cancel);

export default router;
