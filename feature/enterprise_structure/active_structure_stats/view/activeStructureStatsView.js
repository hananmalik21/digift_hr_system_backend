/**
 * Send 400 Bad Request
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {string} message - Error message
 */
export function sendBadRequest(res, req, message) {
  return res.status(400).json({
    status: false,
    error: message || 'Bad request',
  });
}

/**
 * Active structure stats response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object} data - { active_structure, levels_with_components }
 */
export function sendActiveStructureStats(res, req, data) {
  return res.status(200).json({
    status: true,
    message: 'Active structure statistics retrieved successfully',
    data,
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
