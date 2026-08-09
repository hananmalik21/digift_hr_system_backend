/**
 * Fail-fast validation of numeric route params for GL routes.
 */

import { sendValidationError } from '../../shared/index.js';
import { ValidationError } from '../../../../utils/errors/index.js';

function isPositiveIntString(value) {
  return /^\d+$/.test(String(value));
}

function validateParams(paramNames) {
  return (req, res, next) => {
    for (const name of paramNames) {
      const value = req.params[name];
      if (value == null || !isPositiveIntString(value)) {
        return sendValidationError(
          res,
          new ValidationError(`${name} must be a positive integer`, [
            { field: name, message: `${name} must be a positive integer` }
          ])
        );
      }
    }
    return next();
  };
}

export const validateAccountIdParam = validateParams(['accountId']);
export const validateMappingIdParam = validateParams(['mappingId']);
export const validateOverrideIdParam = validateParams(['overrideId']);
export const validateRunIdParam = validateParams(['runId']);
export const validatePaymentBatchIdParam = validateParams(['paymentBatchId']);
export const validateJournalIdParam = validateParams(['journalId']);
