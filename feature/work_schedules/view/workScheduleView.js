/**
 * Work Schedule View
 * Handles response formatting for WORK SCHEDULES endpoints
 */

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
 * Send list of work schedules
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Array} workSchedules - Array of work schedules
 * @param {Object} meta - Optional metadata (pagination, etc.)
 */
export function sendWorkScheduleList(res, req, workSchedules, meta = {}) {
  const response = {
    success: true,
    data: workSchedules
  };

  // Add pagination metadata if provided
  if (meta.pagination) {
    response.meta = {
      pagination: {
        page: meta.pagination.page || 1,
        page_size: meta.pagination.pageSize || workSchedules.length,
        total: meta.total !== undefined ? meta.total : workSchedules.length,
        total_pages: meta.pagination.totalPages || 1,
        has_next: meta.pagination.hasNext || false,
        has_previous: meta.pagination.hasPrevious || false
      }
    };
  }

  res.json(response);
}

/**
 * Send single work schedule
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object|null} workSchedule - Work schedule object or null
 */
export function sendWorkSchedule(res, req, workSchedule) {
  if (!workSchedule) {
    return res.json({
      success: true,
      data: []
    });
  }

  res.json({
    success: true,
    data: workSchedule
  });
}

/**
 * Send created response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object} workSchedule - Created work schedule
 */
export function sendCreated(res, req, workSchedule) {
  const workScheduleId = workSchedule.WORK_SCHEDULE_ID || workSchedule.work_schedule_id;

  res.status(201).json({
    success: true,
    data: {
      id: workScheduleId,
      message: 'Work schedule created successfully'
    }
  });
}

/**
 * Send updated response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object} workSchedule - Updated work schedule
 */
export function sendUpdated(res, req, workSchedule) {
  const workScheduleId = workSchedule.work_schedule_id || workSchedule.WORK_SCHEDULE_ID;

  res.json({
    success: true,
    data: {
      id: workScheduleId,
      message: 'Work schedule updated successfully'
    }
  });
}

/**
 * Send lines updated response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {number} workScheduleId - Work schedule ID
 */
export function sendLinesUpdated(res, req, workScheduleId) {
  res.json({
    success: true,
    data: {
      id: workScheduleId,
      message: 'Work schedule lines updated successfully'
    }
  });
}

/**
 * Send deleted response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {string} message - Success message
 * @param {number} workScheduleId - Deleted work schedule ID
 */
export function sendDeleted(res, req, message = 'Work schedule deleted successfully', workScheduleId = null) {
  res.json({
    success: true,
    data: {
      id: workScheduleId || req.params?.work_schedule_id,
      message
    }
  });
}

