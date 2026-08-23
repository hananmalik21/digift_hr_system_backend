import { Router } from 'express';
import { convert } from '../controllers/currency.controller.js';
import { currencyErrorHandler } from '../middleware/currencyErrorHandler.js';

const router = Router();

router.post('/convert', convert);
router.use(currencyErrorHandler);

export default router;
