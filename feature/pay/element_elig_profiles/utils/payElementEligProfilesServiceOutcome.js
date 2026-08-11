import {
  HTTP_BAD_REQUEST,
  HTTP_CREATED,
  HTTP_NOT_FOUND,
  HTTP_OK,
  LINK_NOT_FOUND_MESSAGE
} from '../constants/payElementEligProfiles.constants.js';

export function mapPackageOutcome(
  pkg,
  {
    successHttpStatus = HTTP_OK,
    successMessage = null,
    data = null,
    notFoundMessage = LINK_NOT_FOUND_MESSAGE
  } = {}
) {
  if (pkg.success) {
    return {
      success: true,
      httpStatus: successHttpStatus,
      message: successMessage || pkg.message || 'Operation completed successfully.',
      data
    };
  }

  const message = pkg.message || 'Unable to process request.';
  const isNotFound =
    message === notFoundMessage ||
    /not\s*found/i.test(message);

  return {
    success: false,
    httpStatus: isNotFound ? HTTP_NOT_FOUND : HTTP_BAD_REQUEST,
    message,
    data
  };
}

export function notFoundOutcome(message) {
  return {
    success: false,
    httpStatus: HTTP_NOT_FOUND,
    message
  };
}

export function createdOutcome(pkg, { successMessage, data }) {
  return mapPackageOutcome(pkg, {
    successHttpStatus: HTTP_CREATED,
    successMessage,
    data
  });
}
