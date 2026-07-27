import { ForbiddenError } from '../../../../utils/errors/index.js';
import {
  assertEnterpriseAccess,
  validateInquiryQuery
} from '../validations/payEmployeeBalanceInquiry.validation.js';
import {
  sendForbiddenError,
  sendValidationError
} from '../controllers/payEmployeeBalanceInquiryControllerHelpers.js';

function runValidation(res, next, work) {
  try {
    work();
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateGetInquiry(req, res, next) {
  return runValidation(res, next, () => {
    const filters = validateInquiryQuery(req.query || {}, req);
    assertEnterpriseAccess(req, filters.enterprise_id);
    req.validated = filters;
  });
}
