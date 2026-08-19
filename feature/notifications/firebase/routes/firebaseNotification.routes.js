import express from 'express';
import {
  requireFirebaseTestEndpointEnabled,
  testFirebaseNotificationHandler
} from '../controllers/firebaseNotificationController.js';

const router = express.Router();

router.get('/test', (_req, res) => {
  return res.status(405).json({
    success: false,
    message:
      'Method not allowed. Use POST /api/notifications/firebase/test with a JSON body.'
  });
});

router.post(
  '/test',
  requireFirebaseTestEndpointEnabled,
  testFirebaseNotificationHandler
);

export default router;
