/**
 * Payroll Flexfield Segments routes.
 * Mounted at /api/pay → /flexfield-segments
 */

import express from 'express';
import {
  createSegmentHandler,
  deleteSegmentHandler,
  getSegmentByGuidHandler,
  getSegmentsHandler,
  updateSegmentHandler
} from '../controllers/payFlexfieldSegments.controller.js';

const router = express.Router();

router.get('/flexfield-segments', ...getSegmentsHandler);
router.get('/flexfield-segments/:segmentGuid', ...getSegmentByGuidHandler);
router.post('/flexfield-segments', ...createSegmentHandler);
router.put('/flexfield-segments/:segmentGuid', ...updateSegmentHandler);
router.delete('/flexfield-segments/:segmentGuid', ...deleteSegmentHandler);

export default router;
