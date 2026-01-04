/**
 * Schedule Assignment View
 * Handles response formatting for SCHEDULE ASSIGNMENTS endpoints
 */

/**
 * Send list of schedule assignments
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Array} assignments - Array of schedule assignments
 * @param {Object} meta - Optional metadata (pagination, etc.)
 */
export function sendScheduleAssignmentList(res, req, assignments, meta = {}) {
  const response = {
    success: true,
    data: {
      items: assignments,
      total: meta.total !== undefined ? meta.total : assignments.length,
      page: meta.pagination?.page || 1,
      page_size: meta.pagination?.pageSize || assignments.length
    }
  };

  // Add meta object if pagination info is provided
  if (meta.pagination) {
    response.meta = {
      pagination: {
        page: meta.pagination.page || 1,
        page_size: meta.pagination.pageSize || assignments.length,
        total: meta.total !== undefined ? meta.total : assignments.length,
        total_pages: meta.pagination.totalPages || 1,
        has_next: meta.pagination.hasNext || false,
        has_previous: meta.pagination.hasPrevious || false
      }
    };
  }

  res.json(response);
}

/**
 * Send single schedule assignment
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object|null} assignment - Schedule assignment object or null
 */
export function sendScheduleAssignment(res, req, assignment) {
  if (!assignment) {
    return res.json({
      success: true,
      data: null
    });
  }

  res.json({
    success: true,
    data: assignment
  });
}

/**
 * Send created response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object} assignment - Created schedule assignment
 */
export function sendCreated(res, req, assignment) {
  res.status(201).json({
    success: true,
    message: 'Schedule assignment created successfully',
    data: assignment
  });
}

/**
 * Send updated response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object} assignment - Updated schedule assignment
 */
export function sendUpdated(res, req, assignment) {
  res.json({
    success: true,
    message: 'Schedule assignment updated successfully',
    data: assignment
  });
}

/**
 * Send deleted response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object|number} assignment - Deleted schedule assignment object or ID
 */
export function sendDeleted(res, req, assignment) {
  // For hard delete, assignment might be just an ID
  // For soft delete, assignment should be the full object
  const data = typeof assignment === 'object' && assignment !== null 
    ? assignment 
    : { id: assignment || req.params?.schedule_assignment_id };
  
  res.json({
    success: true,
    message: 'Schedule assignment deleted successfully',
    data
  });
}

