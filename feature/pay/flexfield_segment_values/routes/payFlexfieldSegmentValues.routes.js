/**
 * Payroll Flexfield Segment Values routes.
 * Mounted at /api/pay → /flexfield-segment-values
 */

import express from 'express';
import {
  createSegmentValueHandler,
  deleteSegmentValueHandler,
  getSegmentValueByGuidHandler,
  getSegmentValuesBySegmentCodeHandler,
  getSegmentValuesHandler,
  updateSegmentValueHandler
} from '../controllers/payFlexfieldSegmentValues.controller.js';

const router = express.Router();

router.get('/flexfield-segment-values/by-segment/:segmentCode', ...getSegmentValuesBySegmentCodeHandler);
router.get('/flexfield-segment-values', ...getSegmentValuesHandler);
router.get('/flexfield-segment-values/:segmentValueGuid', ...getSegmentValueByGuidHandler);
router.post('/flexfield-segment-values', ...createSegmentValueHandler);
router.put('/flexfield-segment-values/:segmentValueGuid', ...updateSegmentValueHandler);
router.delete('/flexfield-segment-values/:segmentValueGuid', ...deleteSegmentValueHandler);

export default router;
