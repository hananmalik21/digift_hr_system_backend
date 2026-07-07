/**
 * Payroll Element Eligibility Profiles routes.
 * Mounted at /api/pay
 */

import express from 'express';
import {
  createElementEligProfileHandler,
  deleteElementEligProfileHandler,
  getElementEligProfileByGuidHandler,
  getElementEligProfilesHandler,
  linkElementToEligProfileHandler,
  setElementEligProfileStatusHandler,
  unlinkElementFromEligProfileHandler,
  updateElementEligProfileHandler
} from '../controllers/payElementEligProfiles.controller.js';

const router = express.Router();

router.get('/element-elig-profiles', ...getElementEligProfilesHandler);
router.post('/element-elig-profiles', ...createElementEligProfileHandler);
router.post('/element-elig-profiles/:profileGuid/elements', ...linkElementToEligProfileHandler);
router.delete(
  '/element-elig-profiles/:profileGuid/elements/:elementGuid',
  ...unlinkElementFromEligProfileHandler
);
router.get('/element-elig-profiles/:profileGuid', ...getElementEligProfileByGuidHandler);
router.put('/element-elig-profiles/:profileGuid', ...updateElementEligProfileHandler);
router.patch('/element-elig-profiles/:profileGuid/status', ...setElementEligProfileStatusHandler);
router.delete('/element-elig-profiles/:profileGuid', ...deleteElementEligProfileHandler);

export default router;
