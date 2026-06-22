/**
 * Payroll Lookups routes.
 * Mounted at /api/pay → /lookups/types and /lookups/values
 */

import express from 'express';
import {
  createLookupTypeHandler,
  createLookupValueHandler,
  deleteLookupTypeHandler,
  deleteLookupValueHandler,
  getLookupTypeHandler,
  getLookupValueHandler,
  listLookupTypesHandler,
  listLookupValuesHandler,
  updateLookupTypeHandler,
  updateLookupValueHandler
} from '../controllers/payLookups.controller.js';

const router = express.Router();

router.get('/lookups/types', listLookupTypesHandler);
router.post('/lookups/types', createLookupTypeHandler);
router.get('/lookups/types/:guid', getLookupTypeHandler);
router.put('/lookups/types/:guid', updateLookupTypeHandler);
router.delete('/lookups/types/:guid', deleteLookupTypeHandler);

router.get('/lookups/values', listLookupValuesHandler);
router.post('/lookups/values', createLookupValueHandler);
router.get('/lookups/values/:guid', getLookupValueHandler);
router.put('/lookups/values/:guid', updateLookupValueHandler);
router.delete('/lookups/values/:guid', deleteLookupValueHandler);

export default router;
