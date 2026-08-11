/**
 * Thin re-export of the existing pay-elements CRUD handlers under the /elements path,
 * for feature/payroll consumers that want element CRUD colocated with this package.
 *
 * Not mounted by feature/payroll/routes/payroll.routes.js — the main payroll router
 * remounts feature/pay/elements/routes/payElements.routes.js directly (which already
 * exposes these same paths) to avoid registering duplicate/conflicting routes.
 */
import express from 'express';
import {
  createElementHandler,
  deleteElementHandler,
  getElementByGuidHandler,
  getElementsHandler,
  updateElementHandler
} from '../../../pay/elements/controllers/payElements.controller.js';

const router = express.Router();

router.get('/elements', ...getElementsHandler);
router.get('/elements/:elementGuid', ...getElementByGuidHandler);
router.post('/elements', ...createElementHandler);
router.put('/elements/:elementGuid', ...updateElementHandler);
router.delete('/elements/:elementGuid', ...deleteElementHandler);

export default router;
