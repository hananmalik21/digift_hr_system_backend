/**
 * Work Pattern View
 * Handles response formatting for WORK PATTERNS endpoints
 */

const API_VERSION = '1.0.0';

/**
 * Generate base metadata
 * @param {Object} req - Express request object
 * @param {Object} additionalMeta - Additional metadata to include
 * @returns {Object} Base metadata object
 */
function generateBaseMetadata(req, additionalMeta = {}) {
  return {
    ...additionalMeta
  };
}

/**
 * Generate a unique request ID
 * @returns {string} Request ID
 */
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Send list of work patterns
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Array} workPatterns - Array of work patterns
 * @param {Object} meta - Optional metadata (pagination, etc.)
 */
export function sendWorkPatternList(res, req, workPatterns, meta = {}) {
  const response = {
    success: true,
    meta: generateBaseMetadata(req),
    data: workPatterns
  };

  // Add pagination metadata if provided
  if (meta.pagination) {
    response.meta.pagination = {
      page: meta.pagination.page || 1,
      page_size: meta.pagination.pageSize || workPatterns.length,
      total: meta.total !== undefined ? meta.total : workPatterns.length,
      total_pages: meta.pagination.totalPages || 1,
      has_next: meta.pagination.hasNext || false,
      has_previous: meta.pagination.hasPrevious || false
    };
  }
  
  res.json(response);
}

/**
 * Send single work pattern
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object|null} workPattern - Work pattern object or null
 */
export function sendWorkPattern(res, req, workPattern) {
  if (!workPattern) {
    return res.status(404).json({
      success: false,
      meta: generateBaseMetadata(req),
      error: {
        code: 'NOT_FOUND',
        message: 'Work pattern not found',
        details: {}
      }
    });
  }

  res.json({
    success: true,
    meta: generateBaseMetadata(req),
    data: workPattern
  });
}

/**
 * Send created response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object} workPattern - Created work pattern
 */
export function sendCreated(res, req, workPattern) {
  res.status(201).json({
    success: true,
    meta: generateBaseMetadata(req),
    message: 'Work pattern created successfully',
    data: workPattern
  });
}

/**
 * Send updated response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object} workPattern - Updated work pattern
 */
export function sendUpdated(res, req, workPattern) {
  res.json({
    success: true,
    meta: generateBaseMetadata(req),
    message: 'Work pattern updated successfully',
    data: workPattern
  });
}

/**
 * Send deleted response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {string} message - Success message
 * @param {Object|number} workPattern - Deleted work pattern object or ID (for hard delete)
 */
export function sendDeleted(res, req, message = 'Work pattern deleted successfully', workPattern = null) {
  // For hard delete, workPattern might be just an ID
  // For soft delete, workPattern should be the full object
  const data = typeof workPattern === 'object' && workPattern !== null 
    ? workPattern 
    : { id: workPattern || req.params?.work_pattern_id };
  
  res.json({
    success: true,
    meta: generateBaseMetadata(req),
    message,
    data
  });
}

