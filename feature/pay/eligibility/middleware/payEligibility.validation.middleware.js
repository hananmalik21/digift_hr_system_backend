import { ForbiddenError } from '../../../../utils/errors/index.js';
import {
  assertEnterpriseAccess,
  validateEvaluateEligibilityBody
} from '../validations/payEligibility.validation.js';
import {
  sendForbiddenError,
  sendValidationError
} from '../controllers/payEligibilityControllerHelpers.js';

export function validateEvaluateEligibility(req, res, next) {
  try {
    const body = validateEvaluateEligibilityBody(req.body || {});
    assertEnterpriseAccess(req, body.enterprise_id);
    req.validated = body;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}
