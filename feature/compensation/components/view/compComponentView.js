/**
 * Compensation Component View
 * Response formatting for compensation component APIs (create, update, get, errors).
 */

/**
 * Send success response for create component
 */
export function sendCreateSuccess(res, data) {
  res.status(201).json({
    success: true,
    message: 'Compensation component created successfully',
    data
  });
}

/**
 * Send success response for update component
 */
export function sendUpdateSuccess(res, data) {
  res.status(200).json({
    success: true,
    message: 'Compensation component updated successfully',
    data
  });
}

/**
 * Send success response for get component
 */
export function sendGetSuccess(res, data) {
  res.status(200).json({
    success: true,
    data
  });
}

/**
 * Paginated list from COMP.COMPONENTS_VIEW — same shape as other list APIs (e.g. attendance summary).
 */
export function sendListSuccess(res, rows, paginationMeta) {
  res.status(200).json({
    success: true,
    data: rows,
    pagination: {
      page: paginationMeta.page,
      page_size: paginationMeta.pageSize,
      total: paginationMeta.total,
      total_pages: paginationMeta.totalPages,
      has_next: paginationMeta.hasNext,
      has_previous: paginationMeta.hasPrevious
    }
  });
}

/**
 * Send error response (validation, database, or generic)
 * Format: { success: false, message: string, error: string, error_details: { message, code?, type? } }
 * Top-level message shows the actual error (same as other APIs across the app).
 */
export function sendError(res, statusCode, errorTitle, message, options = {}) {
  const displayMessage = message || errorTitle;
  res.status(statusCode).json({
    success: false,
    message: displayMessage,
    error: errorTitle,
    error_details: {
      message: displayMessage,
      ...(options.code != null && { code: options.code }),
      ...(options.type != null && { type: options.type })
    }
  });
}
