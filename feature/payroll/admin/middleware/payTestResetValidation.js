/**
 * Validation for POST /api/payroll/admin/test-reset.
 * Test/admin only — enterprise_id is never defaulted from JWT.
 */

import { isEnterpriseAdmin } from '../../../../utils/adminAccess.js';
import { ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import { getActingEnterpriseId, getActingUsername } from '../../../../utils/userContext.js';
import {
  requirePositiveInt,
  sendForbiddenError,
  sendValidationError
} from '../../shared/index.js';
import {
  ADMIN_REQUIRED_MESSAGE,
  CONFIRMATION_CODE,
  ENTERPRISE_ACCESS_DENIED_MESSAGE,
  PRODUCTION_DISABLED_MESSAGE,
  isPayrollTestResetDisabled
} from '../constants.js';

function runValidation(res, next, work) {
  try {
    work();
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

function assertResetEnterpriseAccess(req, enterpriseId) {
  const acting = getActingEnterpriseId(req);
  if (acting == null || Number(acting) !== Number(enterpriseId)) {
    throw new ForbiddenError(ENTERPRISE_ACCESS_DENIED_MESSAGE);
  }
}

function requireExactConfirmation(value) {
  if (value == null || value === '') {
    throw new ValidationError('confirmation is required', [
      { field: 'confirmation', message: 'confirmation is required' }
    ]);
  }
  if (value !== CONFIRMATION_CODE) {
    throw new ValidationError(`confirmation must exactly equal ${CONFIRMATION_CODE}`, [
      { field: 'confirmation', message: `confirmation must exactly equal ${CONFIRMATION_CODE}` }
    ]);
  }
  return value;
}

function resolveAuditActor(req) {
  return getActingUsername(req) || String(req.user?.user_id ?? 'UNKNOWN');
}

/** POST /admin/test-reset */
export function validateTestReset(req, res, next) {
  return runValidation(res, next, () => {
    if (isPayrollTestResetDisabled()) {
      throw new ForbiddenError(PRODUCTION_DISABLED_MESSAGE);
    }
    if (!isEnterpriseAdmin(req)) {
      throw new ForbiddenError(ADMIN_REQUIRED_MESSAGE);
    }

    const body = req.body || {};
    const enterpriseId = requirePositiveInt(body.enterprise_id, 'enterprise_id');
    assertResetEnterpriseAccess(req, enterpriseId);

    req.validated = {
      enterprise_id: enterpriseId,
      confirmation: requireExactConfirmation(body.confirmation),
      actor: resolveAuditActor(req)
    };
  });
}
