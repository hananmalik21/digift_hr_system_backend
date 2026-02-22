/**
 * Standardized API Response Helpers
 * Enforces consistent response contract across all endpoints
 * 
 * Success Response Format:
 * {
 *   "status": true,
 *   "message": "<human readable message>",
 *   "data": <payload or null>,
 *   "meta": { ...optional }
 * }
 */

/**
 * Send success response
 * @param {Object} res - Express response object
 * @param {Object} options - Response options
 * @param {string} options.message - Human readable message
 * @param {*} options.data - Response payload (default: null)
 * @param {Object} options.meta - Optional metadata (default: {})
 * @param {number} options.statusCode - HTTP status code (default: 200)
 */
export function sendSuccess(res, { message = 'Success', data = null, meta = {}, statusCode = 200 }) {
  const body = { status: true, message, data };
  if (meta != null && Object.keys(meta).length > 0) body.meta = meta;
  res.status(statusCode).json(body);
}

/**
 * Send created response (201)
 * @param {Object} res - Express response object
 * @param {Object} options - Response options
 * @param {string} options.message - Human readable message (default: "Created successfully")
 * @param {*} options.data - Created resource (default: null)
 * @param {Object} options.meta - Optional metadata (default: {})
 */
export function sendCreated(res, { message = 'Created successfully', data = null }) {
  sendSuccess(res, { message, data, statusCode: 201 });
}

/**
 * Send updated response (200)
 * @param {Object} res - Express response object
 * @param {Object} options - Response options
 * @param {string} options.message - Human readable message (default: "Updated successfully")
 * @param {*} options.data - Updated resource (default: null)
 * @param {Object} options.meta - Optional metadata (default: {})
 */
export function sendUpdated(res, { message = 'Updated successfully', data = null }) {
  sendSuccess(res, { message, data, statusCode: 200 });
}

/**
 * Send deleted response (200)
 * @param {Object} res - Express response object
 * @param {Object} options - Response options
 * @param {string} options.message - Human readable message (default: "Deleted successfully")
 * @param {*} options.data - Deleted resource ID or null (default: null)
 * @param {Object} options.meta - Optional metadata (default: {})
 */
export function sendDeleted(res, { message = 'Deleted successfully', data = null }) {
  sendSuccess(res, { message, data, statusCode: 200 });
}

/**
 * Send list response (200)
 * @param {Object} res - Express response object
 * @param {Object} options - Response options
 * @param {string} options.message - Human readable message (default: "Fetched successfully")
 * @param {Array} options.data - List of items (default: [])
 * @param {Object} options.meta - Optional metadata, should include pagination when applicable (default: {})
 */
export function sendList(res, { message = 'Fetched successfully', data = [], meta = {} }) {
  // Ensure pagination meta is properly formatted
  if (meta.pagination) {
    meta = {
      ...meta,
      pagination: {
        page: meta.pagination.page || 1,
        limit: meta.pagination.pageSize || meta.pagination.limit || data.length,
        total: meta.total || meta.pagination.total || data.length,
        hasMore: meta.pagination.hasNext !== undefined 
          ? meta.pagination.hasNext 
          : (meta.pagination.page || 1) < (meta.pagination.totalPages || 1)
      }
    };
  }
  
  sendSuccess(res, { message, data, meta, statusCode: 200 });
}

