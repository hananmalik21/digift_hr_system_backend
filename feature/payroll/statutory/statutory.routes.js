/**
 * Statutory processing routes.
 * Mounted at /api/payroll → /statutory, /runs/:runId/statutory, /employees/:employeeId/statutory-*
 */

import express from 'express';
import {
  acceptFilingHandler,
  approveAmendmentHandler,
  createAmendmentHandler,
  createFilingHandler,
  createRegimeHandler,
  createRuleHandler,
  fileFilingHandler,
  generateCertificateHandler,
  getAmendmentHandler,
  getCertificateHandler,
  getFilingHandler,
  getRegimeHandler,
  getRuleHandler,
  getRunResultHandler,
  listAmendmentsHandler,
  listAuditHandler,
  listCertificatesHandler,
  listFilingsHandler,
  listRegimesHandler,
  listRulesHandler,
  listRunResultsHandler,
  processRunHandler,
  publishCertificateHandler,
  reverseAmendmentHandler,
  updateRegimeHandler,
  updateRuleHandler,
  validateFilingHandler
} from './statutory.controller.js';

const router = express.Router();
const statutoryRouter = express.Router({ mergeParams: true });
const runStatutoryRouter = express.Router({ mergeParams: true });
const employeeStatutoryRouter = express.Router({ mergeParams: true });

// Regimes
statutoryRouter.get('/regimes', listRegimesHandler);
statutoryRouter.post('/regimes', createRegimeHandler);
statutoryRouter.get('/regimes/:regimeGuid', getRegimeHandler);
statutoryRouter.put('/regimes/:regimeGuid', updateRegimeHandler);

// Rules
statutoryRouter.get('/rules', listRulesHandler);
statutoryRouter.post('/rules', createRuleHandler);
statutoryRouter.get('/rules/:ruleGuid', getRuleHandler);
statutoryRouter.put('/rules/:ruleGuid', updateRuleHandler);

// Results
statutoryRouter.get('/results', listRunResultsHandler);
statutoryRouter.get('/results/:resultId', getRunResultHandler);

// Filings
statutoryRouter.get('/filings', listFilingsHandler);
statutoryRouter.get('/filings/:filingId', getFilingHandler);
statutoryRouter.post('/filings/:filingId/validate', validateFilingHandler);
statutoryRouter.post('/filings/:filingId/file', fileFilingHandler);
statutoryRouter.post('/filings/:filingId/accept', acceptFilingHandler);

// Certificates
statutoryRouter.post('/certificates/generate', generateCertificateHandler);
statutoryRouter.get('/certificates', listCertificatesHandler);
statutoryRouter.get('/certificates/:certificateId', getCertificateHandler);
statutoryRouter.post('/certificates/:certificateId/publish', publishCertificateHandler);

// Amendments
statutoryRouter.post('/amendments', createAmendmentHandler);
statutoryRouter.get('/amendments', listAmendmentsHandler);
statutoryRouter.get('/amendments/:amendmentId', getAmendmentHandler);
statutoryRouter.post('/amendments/:amendmentId/approve', approveAmendmentHandler);
statutoryRouter.post('/amendments/:amendmentId/reverse', reverseAmendmentHandler);

// Audit
statutoryRouter.get('/audit', listAuditHandler);

router.use('/statutory', statutoryRouter);

// Run-scoped processing
runStatutoryRouter.post('/process', processRunHandler);
runStatutoryRouter.get('/results', listRunResultsHandler);
runStatutoryRouter.post('/filings', createFilingHandler);
router.use('/runs/:runId/statutory', runStatutoryRouter);

// Employee-scoped read views
employeeStatutoryRouter.get('/statutory-results', listRunResultsHandler);
employeeStatutoryRouter.get('/statutory-certificates', listCertificatesHandler);
router.use('/employees/:employeeId', employeeStatutoryRouter);

export default router;
