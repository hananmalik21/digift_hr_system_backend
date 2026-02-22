/**
 * Shift View
 * Handles response formatting for SHIFTS endpoints
 */

const API_VERSION = '1.0.0';

/**
 * Convert object keys from UPPER_CASE to lowercase snake_case
 * @param {Object} obj - Object with uppercase keys
 * @returns {Object} Object with lowercase snake_case keys
 */
function convertKeysToSnakeCase(obj) {
  // Handle null, undefined, or primitives
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  // Handle Date objects and other special objects
  if (obj instanceof Date || obj instanceof Buffer) {
    return obj;
  }
  
  // Handle primitives
  if (typeof obj !== 'object') {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => convertKeysToSnakeCase(item));
  }

  // Handle objects
  const converted = {};
  for (const [key, value] of Object.entries(obj)) {
    // Convert UPPER_CASE to lowercase snake_case
    const newKey = key.toLowerCase();
    
    // Handle nested objects, arrays, and special types
    if (value === null || value === undefined) {
      converted[newKey] = value;
    } else if (value instanceof Date || value instanceof Buffer) {
      converted[newKey] = value;
    } else if (typeof value === 'object') {
      converted[newKey] = convertKeysToSnakeCase(value);
    } else {
      converted[newKey] = value;
    }
  }
  return converted;
}

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
 * Send list of shifts
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Array} shifts - Array of shifts
 * @param {Object} meta - Optional metadata (pagination, etc.)
 */
export function sendShiftList(res, req, shifts, meta = {}) {
  // Ensure all keys are converted to lowercase snake_case
  const convertedData = convertKeysToSnakeCase(shifts);
  
  const response = {
    success: true,
    data: convertedData
  };

  // Add pagination metadata if provided
  if (meta.pagination) {
    response.meta = {
      pagination: {
        page: meta.pagination.page || 1,
        page_size: meta.pagination.pageSize || shifts.length,
        total: meta.total !== undefined ? meta.total : shifts.length,
        total_pages: meta.pagination.totalPages || 1,
        has_next: meta.pagination.hasNext || false,
        has_previous: meta.pagination.hasPrevious || false
      }
    };
  }
  
  res.json(response);
}

/**
 * Send single shift
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object|null} shift - Shift object or null
 */
export function sendShift(res, req, shift) {
  if (!shift) {
    return res.status(404).json({
      success: false,
      error: 'Shift not found'
    });
  }

  const convertedShift = convertKeysToSnakeCase(shift);
  
  res.json({
    success: true,
    data: convertedShift
  });
}

/**
 * Send created response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object} shift - Created shift
 */
export function sendCreated(res, req, shift) {
  const convertedShift = convertKeysToSnakeCase(shift);
  
  res.status(201).json({
    success: true,
    id: convertedShift.shift_id || shift.SHIFT_ID,
    message: 'Shift created successfully'
  });
}

/**
 * Send updated response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object} shift - Updated shift
 */
export function sendUpdated(res, req, shift) {
  const convertedShift = convertKeysToSnakeCase(shift);
  
  res.json({
    success: true,
    id: convertedShift.shift_id || shift.SHIFT_ID,
    message: 'Shift updated successfully'
  });
}

/**
 * Send deleted response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {string} message - Success message
 * @param {number} shiftId - Deleted shift ID
 */
export function sendDeleted(res, req, message = 'Shift deleted successfully', shiftId = null) {
  res.json({
    success: true,
    id: shiftId || req.params?.shift_id,
    message
  });
}

