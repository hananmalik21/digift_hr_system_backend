import {
  CATEGORIES_SUCCESS_MESSAGE,
  GET_SUCCESS_MESSAGE,
  HTTP_BAD_REQUEST,
  HTTP_CONFLICT,
  HTTP_CREATED,
  HTTP_NOT_FOUND,
  HTTP_OK,
  LIST_SUCCESS_MESSAGE,
  LOOKUPS_SUCCESS_MESSAGE,
  NOT_FOUND_MESSAGE,
  SUMMARY_SUCCESS_MESSAGE
} from '../constants/payBalanceDefinitions.constants.js';
import {
  isBalanceDefinitionAlreadyExistsMessage,
  isBalanceDefinitionCannotDeleteMessage,
  isBalanceDefinitionNotFoundMessage
} from './payBalanceDefinitionsOracleErrors.js';

export function mapPackageFailure(pkg) {
  const message = pkg.message || 'Unable to process request.';
  let httpStatus = HTTP_BAD_REQUEST;

  if (isBalanceDefinitionNotFoundMessage(message)) {
    httpStatus = HTTP_NOT_FOUND;
  } else if (
    isBalanceDefinitionAlreadyExistsMessage(message) ||
    isBalanceDefinitionCannotDeleteMessage(message)
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

export function summaryOutcome(data) {
  return {
    success: true,
    httpStatus: HTTP_OK,
    message: SUMMARY_SUCCESS_MESSAGE,
    data
  };
}

export function categoriesOutcome(data) {
  return {
    success: true,
    httpStatus: HTTP_OK,
    message: CATEGORIES_SUCCESS_MESSAGE,
    data
  };
}

export function lookupsOutcome(data) {
  return {
    success: true,
    httpStatus: HTTP_OK,
    message: LOOKUPS_SUCCESS_MESSAGE,
    data
  };
}
