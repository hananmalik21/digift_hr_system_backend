/**
 * Locations routes.
 * Mounted at /api/locations
 */
import express from 'express';
import { listLocationsHandler } from '../controller/locationsController.js';

const router = express.Router();

router.get('/', listLocationsHandler);

export default router;
