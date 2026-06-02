import { packageStatusIsSuccess } from './oraclePackageUtils.js';
import { sendPackageResponse } from './recControllerHelpers.js';

/**
 * @param {import('express').Response} res
 * @param {{ status?: string, message?: string }} pkg
 * @param {(status: unknown) => boolean} [isSuccess]
 */
export function sendPackageActionResponse(res, pkg, isSuccess = packageStatusIsSuccess) {
  const success = isSuccess(pkg.status);
  const status = pkg.status ?? (success ? 'SUCCESS' : 'ERROR');
  const message = pkg.message ?? '';
  const httpStatus = success ? 200 : 400;

  return sendPackageResponse(res, httpStatus, {
    success,
    status,
    message
  });
}

/**
 * @param {import('express').Response} res
 * @param {Record<string, unknown>} pkg
 * @param {{ idField: string, guidField: string }} fields
 * @param {(status: unknown) => boolean} [isSuccess]
 */
export function sendCreateEntityResponse(res, pkg, fields, isSuccess = packageStatusIsSuccess) {
  const success = isSuccess(pkg.status);
  const status = pkg.status ?? (success ? 'SUCCESS' : 'ERROR');
  const message = pkg.message ?? '';
  const httpStatus = success ? 200 : 400;

  return sendPackageResponse(res, httpStatus, {
    success,
    [fields.idField]: pkg[fields.idField] ?? null,
    [fields.guidField]: pkg[fields.guidField] ?? null,
    status,
    message
  });
}
