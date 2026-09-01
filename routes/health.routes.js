import express from 'express';
import { sendSuccess } from '@digifyhr/common';

const router = express.Router();

export function healthHandler(_req, res) {
  sendSuccess(res, {
    message: 'API Server is running',
    data: {
      status: 'OK',
      timestamp: new Date().toISOString()
    }
  });
}

router.get('/health', healthHandler);

export default router;
