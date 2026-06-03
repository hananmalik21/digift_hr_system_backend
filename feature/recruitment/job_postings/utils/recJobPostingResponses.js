import { packageStatusIsSuccess } from '../../shared/oraclePackageUtils.js';
import { sendPackageResponse } from '../../shared/recControllerHelpers.js';

/**
 * @param {import('express').Response} res
 * @param {{ status?: string, message?: string, posting_id?: number|null, posting_guid?: string|null }} pkg
 */
export function sendCreateJobPostingResponse(res, pkg) {
  const success = packageStatusIsSuccess(pkg.status);
  const message = pkg.message ?? '';
  if (!success) {
    return sendPackageResponse(res, 400, { success: false, message });
  }
  return sendPackageResponse(res, 200, {
    success: true,
    message: message || 'Job posting created successfully.',
    data: {
      posting_id: pkg.posting_id ?? null,
      posting_guid: pkg.posting_guid ?? null
    }
  });
}

/**
 * @param {import('express').Response} res
 * @param {{ status?: string, message?: string }} pkg
 * @param {string} [successMessage]
 */
export function sendJobPostingActionResponse(res, pkg, successMessage) {
  const success = packageStatusIsSuccess(pkg.status);
  const message = pkg.message ?? '';
  const httpStatus = success ? 200 : 400;
  return sendPackageResponse(res, httpStatus, {
    success,
    message: success ? successMessage || message || 'Operation completed successfully.' : message
  });
}
