import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { getPositionsByOrgUnit } from '../controller/positionController.js';

const router = express.Router();

router.get('/by-org-unit', asyncHandler(getPositionsByOrgUnit));

export default router;
