/**
 * Shared list/mutation helpers for enterprise_structure controllers.
 */

/** @param {import('express').Request['query']} query */
export function parseListPagination(query, { defaultPageSize = 10, maxPageSize = 100 } = {}) {
  let page = 1;
  let pageSize = defaultPageSize;
  const errors = [];

  if (query.page !== undefined) {
    const parsed = parseInt(query.page, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      errors.push('Invalid page number. Must be a positive integer.');
    } else {
      page = parsed;
    }
  }

  if (query.page_size !== undefined || query.limit !== undefined) {
    const parsed = parseInt(query.page_size ?? query.limit, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      errors.push('Invalid page_size. Must be a positive integer.');
    } else {
      pageSize = Math.min(maxPageSize, parsed);
    }
  }

  return { page, pageSize, errors };
}

/** @param {number} total @param {number} page @param {number} pageSize */
export function buildListPaginationMeta(total, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    page,
    pageSize,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1
  };
}

/**
 * Map ENT package / model errors to HTTP responses.
 * @param {import('express').Response} res
 * @param {import('express').Request} req
 * @param {Error & { code?: string, statusCode?: number, userMessage?: string }} error
 * @param {{ sendBadRequest: Function, sendConflict: Function, sendServerError: Function, sendNotFound?: Function }} senders
 * @param {string} defaultMessage
 */
export function handleEntMutationError(res, req, error, senders, defaultMessage) {
  const { sendBadRequest, sendConflict, sendServerError, sendNotFound } = senders;
  const message = error.userMessage || error.message;

  if (error.code === 'VALIDATION_ERROR' || error.code === 'GRADE_RANGE_INVALID'
      || error.code === 'FOREIGN_KEY_CONSTRAINT' || error.code === 'NOT_NULL_CONSTRAINT') {
    return sendBadRequest(res, req, message);
  }
  if (
    error.statusCode === 409
    || error.code === 'CONFLICT'
    || (error.code === 'UNIQUE_CONSTRAINT_VIOLATION' && error.statusCode === 409)
  ) {
    return sendConflict(res, req, message, {
      constraint: error.constraint,
      columns: error.columns
    });
  }
  if (error.statusCode === 404 || error.code === 'NOT_FOUND') {
    if (sendNotFound) return sendNotFound(res, req, message);
    return sendBadRequest(res, req, message);
  }
  return sendServerError(res, req, defaultMessage, error);
}
