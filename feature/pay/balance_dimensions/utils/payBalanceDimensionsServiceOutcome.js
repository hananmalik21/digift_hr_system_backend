import {
  GET_SUCCESS_MESSAGE,
  HTTP_BAD_REQUEST,
  HTTP_CONFLICT,
  HTTP_CREATED,
  HTTP_INTERNAL,
  HTTP_NOT_FOUND,
  HTTP_OK,
  LIST_SUCCESS_MESSAGE,
  NOT_FOUND_MESSAGE
} from '../constants/payBalanceDimensions.constants.js';
import {
  isBalanceDimensionAlreadyExistsMessage,
  isBalanceDimensionCannotDeleteMessage,
  isBalanceDimensionNotFoundMessage,
  isBalanceDimensionRetrieveFailedMessage
} from './payBalanceDimensionsOracleErrors.js';

/**
 * Map package failure to HTTP outcome. Always returns package X_MESSAGE as message.
 * @param {{ success?: boolean, message?: string, data?: unknown }} pkg
 */
export function mapPackageFailure(pkg) {
  const message = pkg.message || 'Unable to process request.';
  let httpStatus = HTTP_BAD_REQUEST;

  if (isBalanceDimensionRetrieveFailedMessage(message)) {
    httpStatus = HTTP_INTERNAL;
  } else if (isBalanceDimensionNotFoundMessage(message)) {
    httpStatus = HTTP_NOT_FOUND;
  } else if (
    isBalanceDimensionAlreadyExistsMessage(message) ||
    isBalanceDimensionCannotDeleteMessage(message)
  ) {
    httpStatus = HTTP_CONFLICT;
  }

  return {
    success: false,
    httpStatus,
    message,
    data: null
  };
}

/**
 * Map package success — use package X_MESSAGE as the API message.
 * @param {{ success?: boolean, message?: string, data?: unknown }} pkg
 * @param {{ httpStatus?: number }} [options]
 */
export function mapPackageSuccess(pkg, { httpStatus = HTTP_OK } = {}) {
  return {
    success: true,
    httpStatus,
    message: pkg.message || '',
    data: pkg.data ?? null
  };
}

/**
 * @param {{ success?: boolean, message?: string, data?: unknown }} pkg
 */
export function createdFromPackage(pkg) {
  return mapPackageSuccess(pkg, { httpStatus: HTTP_CREATED });
}

/**
 * @param {string} [message]
 */
export function notFoundOutcome(message = NOT_FOUND_MESSAGE) {
  return {
    success: false,
    httpStatus: HTTP_NOT_FOUND,
    message,
    data: null
  };
}

/**
 * @param {unknown[]} data
 * @param {{ pagination: object }} meta
 */
export function listOutcome(data, meta) {
  return {
    success: true,
    httpStatus: HTTP_OK,
    message: LIST_SUCCESS_MESSAGE,
    data,
    meta
  };
}

/**
 * @param {unknown} data
 */
export function getOutcome(data) {
  return {
    success: true,
    httpStatus: HTTP_OK,
    message: GET_SUCCESS_MESSAGE,
    data
  };
}
