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
  const assignmentId = assignment.SCHEDULE_ASSIGNMENT_ID || assignment.schedule_assignment_id;

  res.status(201).json({
    success: true,
    data: {
      id: assignmentId,
      message: 'Schedule assignment created successfully'
    }
  });
}

/**
 * Send updated response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object} assignment - Updated schedule assignment
 */
export function sendUpdated(res, req, assignment) {
  const assignmentId = assignment.schedule_assignment_id || assignment.SCHEDULE_ASSIGNMENT_ID;

  res.json({
    success: true,
    data: {
      id: assignmentId,
      message: 'Work Schedule Updated successfully'
    }
  });
}

/**
 * Send deleted response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {number} assignmentId - Deleted schedule assignment ID
 */
export function sendDeleted(res, req, assignmentId) {
  res.json({
    success: true,
    data: {
      id: assignmentId,
      message: 'Schedule assignment deleted successfully'
    }
  });
}

