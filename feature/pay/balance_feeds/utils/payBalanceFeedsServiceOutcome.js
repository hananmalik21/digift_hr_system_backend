import {
  CREATE_SUCCESS_MESSAGE,
  DELETE_HARD_SUCCESS_MESSAGE,
  DELETE_SUCCESS_MESSAGE,
  GET_SUCCESS_MESSAGE,
  HTTP_BAD_REQUEST,
  HTTP_CONFLICT,
  HTTP_CREATED,
  HTTP_NOT_FOUND,
  HTTP_OK,
  LIST_SUCCESS_MESSAGE,
  NOT_FOUND_MESSAGE,
  UPDATE_SUCCESS_MESSAGE
} from '../constants/payBalanceFeeds.constants.js';
import {
  isBalanceFeedAlreadyExistsMessage,
  isBalanceFeedNotFoundMessage
} from './payBalanceFeedsOracleErrors.js';

export function mapPackageFailure(pkg) {
  const message = pkg.message || 'Unable to process request.';
  let httpStatus = HTTP_BAD_REQUEST;

  if (isBalanceFeedNotFoundMessage(message)) {
    httpStatus = HTTP_NOT_FOUND;
  } else if (isBalanceFeedAlreadyExistsMessage(message)) {
    httpStatus = HTTP_CONFLICT;
  }

  return {
    success: false,
    httpStatus,
    message
  };
}

export function notFoundOutcome(message = NOT_FOUND_MESSAGE) {
  return {
    success: false,
    httpStatus: HTTP_NOT_FOUND,
    message
  };
}

export function buildListPagination(page, limit, total) {
  return {
    page,
    limit,
    total_count: total,
    total_pages: Math.ceil(total / limit) || 0
  };
}

export function createdOutcome(data) {
  return {
    success: true,
    httpStatus: HTTP_CREATED,
    message: CREATE_SUCCESS_MESSAGE,
    data
  };
}

export function updatedOutcome(balanceFeedGuidHex, balanceFeedId) {
  return {
    success: true,
    httpStatus: HTTP_OK,
    message: UPDATE_SUCCESS_MESSAGE,
    data: {
      balance_feed_id: balanceFeedId ?? null,
      balance_feed_guid: balanceFeedGuidHex
    }
  };
}

export function deletedOutcome(hardDelete) {
  return {
    success: true,
    httpStatus: HTTP_OK,
    message: hardDelete === 'Y' ? DELETE_HARD_SUCCESS_MESSAGE : DELETE_SUCCESS_MESSAGE
  };
}

export function listOutcome(data, pagination) {
  return {
    success: true,
    httpStatus: HTTP_OK,
    message: LIST_SUCCESS_MESSAGE,
    data,
    pagination
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
