import {
  GET_SUCCESS_MESSAGE,
  HTTP_BAD_REQUEST,
  HTTP_CONFLICT,
  HTTP_CREATED,
  HTTP_NOT_FOUND,
  HTTP_OK,
  LIST_SUCCESS_MESSAGE,
  NOT_FOUND_MESSAGE
} from '../constants/payBalanceCategories.constants.js';
import {
  isBalanceCategoryAlreadyExistsMessage,
  isBalanceCategoryCannotDeleteMessage,
  isBalanceCategoryNotFoundMessage
} from './payBalanceCategoriesOracleErrors.js';

/**
 * Map package failure to HTTP outcome. Always returns package X_MESSAGE as message.
 */
export function mapPackageFailure(pkg) {
  const message = pkg.message || 'Unable to process request.';
  let httpStatus = HTTP_BAD_REQUEST;

  if (isBalanceCategoryNotFoundMessage(message)) {
    httpStatus = HTTP_NOT_FOUND;
  } else if (
    isBalanceCategoryAlreadyExistsMessage(message) ||
    isBalanceCategoryCannotDeleteMessage(message)
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
 */
export function mapPackageSuccess(pkg, { httpStatus = HTTP_OK } = {}) {
  return {
    success: true,
    httpStatus,
    message: pkg.message || '',
    data: pkg.data ?? null
  };
}

export function createdFromPackage(pkg) {
  return mapPackageSuccess(pkg, { httpStatus: HTTP_CREATED });
}

export function notFoundOutcome(message = NOT_FOUND_MESSAGE) {
  return {
    success: false,
    httpStatus: HTTP_NOT_FOUND,
    message,
    data: null
  };
}

export function listOutcome(data, meta) {
  return {
    success: true,
    httpStatus: HTTP_OK,
    message: LIST_SUCCESS_MESSAGE,
    data,
    meta
  };
}

export function getOutcome(data) {
  return {
    success: true,
    httpStatus: HTTP_OK,
    message: GET_SUCCESS_MESSAGE,
    data
  };
}
