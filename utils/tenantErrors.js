/**
 * Structured tenant / enterprise-context HTTP responses.
 * Public clients get status "S"|"E" without Oracle internals.
 */

export const TENANT_ERROR_CODES = Object.freeze({
  INVALID_TENANT_HOST: 'INVALID_TENANT_HOST',
  TENANT_REQUIRED: 'TENANT_REQUIRED',
  ENTERPRISE_NOT_FOUND: 'ENTERPRISE_NOT_FOUND',
  CAREER_PORTAL_UNAVAILABLE: 'CAREER_PORTAL_UNAVAILABLE',
  ENTERPRISE_CONTEXT_MISMATCH: 'ENTERPRISE_CONTEXT_MISMATCH'
});

export const TENANT_ERROR_MESSAGES = Object.freeze({
  INVALID_TENANT_HOST: 'The enterprise URL is invalid.',
  TENANT_REQUIRED: 'Please access DigifyHR through your enterprise-specific URL.',
  ENTERPRISE_NOT_FOUND: 'Enterprise not found or inactive.',
  CAREER_PORTAL_UNAVAILABLE: 'This career portal is currently unavailable.',
  ENTERPRISE_CONTEXT_MISMATCH: 'Your session does not belong to this enterprise.'
});

const TENANT_CODE_SET = new Set(Object.values(TENANT_ERROR_CODES));

/** @param {unknown} code */
export function isTenantErrorCode(code) {
  return typeof code === 'string' && TENANT_CODE_SET.has(code);
}

/**
 * @param {import('express').Response} res
 * @param {number} httpStatus
 * @param {string} code
 * @param {string} message
 */
export function sendTenantError(res, httpStatus, code, message) {
  return res.status(httpStatus).json({
    status: 'E',
    code,
    message
  });
}

/**
 * @param {import('express').Response} res
 * @param {object} data
 * @param {string} [message]
 */
export function sendTenantSuccess(res, data, message = 'Enterprise context resolved successfully') {
  return res.status(200).json({
    status: 'S',
    message,
    data
  });
}
