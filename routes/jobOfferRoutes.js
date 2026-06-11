import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getOfferPdf } from '../controllers/jobOfferController.js';

const router = express.Router();

router.get('/:offerGuid/pdf', asyncHandler(getOfferPdf));

export default router;
