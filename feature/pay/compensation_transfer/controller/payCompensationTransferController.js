/**
 * Compensation-to-Payroll Transfer controller.
 */

import { MESSAGES } from '../constants/payCompensationTransfer.constants.js';
import {
  getCompensationTransferSetup,
  getTransferredEntriesForPayRun,
  getTransferredEntriesForPayRunLine,
  transferPayRun,
  transferPayRunLineDetail
} from '../model/payCompensationTransferModel.js';
import {
  validateGetLineEntriesInput,
  validateGetPayRunEntriesInput,
  validateTransferLineInput,
  validateTransferPayRunInput,
  validateTransferSetupInput
} from '../validators/payCompensationTransferValidator.js';
import {
  createTransferHandler,
  resolveLineTransferHttpStatus
} from './payCompensationTransferControllerHelpers.js';

export { ROUTE_TAG } from '../constants/payCompensationTransfer.constants.js';

/** GET /api/pay/compensation-transfer/pay-runs/:pay_run_id/setup */
export const getTransferSetupHandler = createTransferHandler({
  validate: (req) => validateTransferSetupInput(req.params, req.query, req),
  action: 'setup',
  successMessage: MESSAGES.SETUP,
  work: getCompensationTransferSetup
});

/** POST /api/pay/compensation-transfer/pay-runs/:pay_run_id/lines/:pay_run_line_id */
export const transferPayRunLineHandler = createTransferHandler({
  validate: (req) => validateTransferLineInput(req.params, req.body || {}, req),
  action: 'transfer_line',
  work: transferPayRunLineDetail,
  resolveStatus: resolveLineTransferHttpStatus
});

/** POST /api/pay/compensation-transfer/pay-runs/:pay_run_id */
export const transferPayRunHandler = createTransferHandler({
  validate: (req) => validateTransferPayRunInput(req.params, req.body || {}, req),
  action: 'transfer_pay_run',
  work: transferPayRun
});

/** GET /api/pay/compensation-transfer/pay-run-lines/:pay_run_line_id/entries */
export const getLineEntriesHandler = createTransferHandler({
  validate: (req) => validateGetLineEntriesInput(req.params, req.query, req),
  action: 'line_entries',
  successMessage: MESSAGES.ENTRIES,
  work: getTransferredEntriesForPayRunLine
});

/** GET /api/pay/compensation-transfer/pay-runs/:pay_run_id/entries */
export const getPayRunEntriesHandler = createTransferHandler({
  validate: (req) => validateGetPayRunEntriesInput(req.params, req.query, req),
  action: 'pay_run_entries',
  successMessage: MESSAGES.ENTRIES,
  work: getTransferredEntriesForPayRun
});
