/**
 * Retro + overpayment/arrears routes.
 * Mounted at /api/payroll → /retro, /arrears, /employees/:employeeId/arrears
 */

import express from 'express';
import {
  calculateRetroEventHandler,
  closeArrearHandler,
  createArrearHandler,
  createArrearRecoveryHandler,
  createRetroEventHandler,
  createRetroEventLineHandler,
  finalizeArrearRecoveryHandler,
  getArrearHandler,
  getRetroEventComparisonHandler,
  getRetroEventHandler,
  listArrearRecoveriesHandler,
  listArrearsHandler,
  listRetroEventLinesHandler,
  listRetroEventsHandler,
  processRetroEventHandler,
  recoverArrearHandler,
  reverseArrearRecoveryHandler,
  reverseRetroEventHandler
} from './retroArrears.controller.js';

const router = express.Router();

const retroRouter = express.Router({ mergeParams: true });
retroRouter.get('/events', listRetroEventsHandler);
retroRouter.post('/events', createRetroEventHandler);
retroRouter.get('/events/:retroEventId', getRetroEventHandler);
retroRouter.get('/events/:retroEventId/lines', listRetroEventLinesHandler);
retroRouter.post('/events/:retroEventId/lines', createRetroEventLineHandler);
retroRouter.post('/events/:retroEventId/calculate', calculateRetroEventHandler);
retroRouter.post('/events/:retroEventId/process', processRetroEventHandler);
retroRouter.post('/events/:retroEventId/reverse', reverseRetroEventHandler);
retroRouter.get('/events/:retroEventId/comparison', getRetroEventComparisonHandler);
router.use('/retro', retroRouter);

const arrearsRouter = express.Router({ mergeParams: true });
arrearsRouter.get('/', listArrearsHandler);
arrearsRouter.post('/', createArrearHandler);
arrearsRouter.get('/:arrearId', getArrearHandler);
arrearsRouter.get('/:arrearId/recoveries', listArrearRecoveriesHandler);
arrearsRouter.post('/:arrearId/recoveries', createArrearRecoveryHandler);
arrearsRouter.post('/:arrearId/recoveries/:recoveryId/finalize', finalizeArrearRecoveryHandler);
arrearsRouter.post('/:arrearId/recover', recoverArrearHandler);
arrearsRouter.post('/:arrearId/reverse-recovery', reverseArrearRecoveryHandler);
arrearsRouter.post('/:arrearId/close', closeArrearHandler);
router.use('/arrears', arrearsRouter);

const employeeArrearsRouter = express.Router({ mergeParams: true });
employeeArrearsRouter.get('/:employeeId/arrears', listArrearsHandler);
router.use('/employees', employeeArrearsRouter);

export default router;
