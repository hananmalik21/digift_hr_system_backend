/**
 * Payroll Balance Feeds routes.
 * Mounted at /api/pay/balance-feeds
 */

import express from 'express';
import {
  createBalanceFeedHandler,
  deleteBalanceFeedHandler,
  getBalanceFeedByGuidHandler,
  getBalanceFeedsHandler,
  updateBalanceFeedHandler
} from '../controllers/payBalanceFeedController.js';

const router = express.Router();

router.get('/', ...getBalanceFeedsHandler);
router.get('/:balance_feed_guid', ...getBalanceFeedByGuidHandler);
router.post('/', ...createBalanceFeedHandler);
router.put('/:balance_feed_guid', ...updateBalanceFeedHandler);
router.delete('/:balance_feed_guid', ...deleteBalanceFeedHandler);

export default router;
