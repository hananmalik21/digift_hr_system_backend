import { ValidationError } from '../../../../utils/errors/index.js';
import {
  handleMutationError,
  sendPackageResponse,
  sendValidationError
} from '../../shared/recControllerHelpers.js';
import { packageStatusIsSuccess } from '../../shared/oraclePackageUtils.js';

/**
 * @param {{ status?: string, message?: string }} pkg
 */
export function interviewPackageHttpStatus(pkg) {
  if (packageStatusIsSuccess(pkg.status)) return 200;
  if (/not found/i.test(pkg.message ?? '')) return 404;
  return 400;
}

/**
 * @param {import('express').Response} res
 * @param {{ status?: string, message?: string, interview_id?: number|null, interview_guid?: string|null }} pkg
 * @param {{ includeIds?: boolean }} [options]
 */
export function sendInterviewActionResponse(res, pkg, options = {}) {
  const success = packageStatusIsSuccess(pkg.status);
  const status = pkg.status ?? (success ? 'SUCCESS' : 'ERROR');
  const message = pkg.message ?? '';

  const payload = { success, status, message };
  if (options.includeIds) {
    payload.interview_id = pkg.interview_id ?? null;
    payload.interview_guid = pkg.interview_guid ?? null;
  }

  return sendPackageResponse(res, interviewPackageHttpStatus(pkg), payload);
}

/**
 * @param {import('express').Response} res
 * @param {() => Promise<unknown>} run
 * @param {string} fallbackMessage
 */
export async function handleInterviewMutation(res, run, fallbackMessage) {
  try {
    return await run();
  } catch (err) {
    if (err instanceof ValidationError) {
      return sendValidationError(res, err);
    }
    return handleMutationError(res, err, fallbackMessage);
  }
}
