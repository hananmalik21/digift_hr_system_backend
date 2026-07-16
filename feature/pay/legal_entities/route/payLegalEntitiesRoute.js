/**
 * PAY Legal Entity Management routes.
 * Mounted at /api/pay/legal-entities
 */

import express from 'express';
import {
  createLegalEntityHandler,
  deleteLegalEntityHandler,
  getLegalEntityByGuidHandler,
  listLegalEntitiesHandler,
  listLegalEntityDropdownHandler,
  setLegalEntityStatusHandler,
  updateLegalEntityHandler
} from '../controller/payLegalEntitiesController.js';

const router = express.Router();

router.get('/dropdown', listLegalEntityDropdownHandler);
router.get('/', listLegalEntitiesHandler);
router.get('/:legalEntityGuid', getLegalEntityByGuidHandler);
router.post('/', createLegalEntityHandler);
router.put('/:legalEntityGuid', updateLegalEntityHandler);
router.patch('/:legalEntityGuid/status', setLegalEntityStatusHandler);
router.delete('/:legalEntityGuid', deleteLegalEntityHandler);

export default router;
