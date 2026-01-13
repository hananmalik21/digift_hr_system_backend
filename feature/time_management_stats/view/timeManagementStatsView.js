/**
 * Send time management stats response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object} stats - Stats data object
 */
export function sendTimeManagementStats(res, req, stats) {
  return res.status(200).json({
    status: true,
    message: 'Time management statistics retrieved successfully',
    data: stats,
  });
}

/**
 * Send server error response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {string} message - Error message
 * @param {Error} error - Error object (optional)
 */
export function sendServerError(res, req, message, error = null) {
  // Log the real error server-side
  console.error('API ERROR:', message, error?.message || error, error?.stack);

  res.status(500).json({
    success: false,
    error: message || 'Internal server error',
    error_details: {
      message: error?.message || message || 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR',
      type: 'Error',
      stack: process.env.NODE_ENV === 'production' ? undefined : error?.stack,
    },
  });
}
