import express from 'express';
import ScheduleAssignmentModel from '../model/scheduleAssignmentModel.js';
import EnterpriseModel from '../../enterprises/model/enterpriseModel.js';
import { sendCreated, sendUpdated, sendDeleted, sendList, sendSuccess } from '../../../utils/response.js';
import { toLowerCaseKeys } from '../../../utils/stringUtils.js';
import { ValidationError, NotFoundError } from '../../../utils/errors/index.js';
import { asyncHandler } from '../../../middleware/asyncHandler.js';

const router = express.Router();

// Middleware to track request start time
router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

/* =========================
 * Helpers
 * ========================= */

/**
 * Convert request body keys from snake_case to UPPER_CASE for database
 */
function convertToUpperCase(data) {
  const converted = {};
  for (const [key, value] of Object.entries(data)) {
    const upperKey = key.toUpperCase();
    converted[upperKey] = value;
  }
  return converted;
}

/**
 * Extract user ID from request
 */
function getUserId(req) {
  return req.headers['x-user-id'] || req.user?.id || 'SYSTEM';
}

/**
 * Validate that tenant_id exists in enterprise table
 */
async function validateEnterpriseExists(tenantId) {
  const enterprise = await EnterpriseModel.findById(tenantId);
  if (!enterprise) {
    throw new NotFoundError(`Enterprise with ID ${tenantId} does not exist`);
  }
  return true;
}

/**
 * Validation helper for schedule assignment data
 */
function validateScheduleAssignmentData(data, isUpdate = false) {
  const errors = [];

  if (!isUpdate) {
    // Required fields for creation
    if (!data.tenant_id && data.tenant_id !== 0) {
      errors.push('tenant_id is required');
    }
    if (!data.assignment_level || data.assignment_level.trim() === '') {
      errors.push('assignment_level is required');
    }
    if (!data.work_schedule_id && data.work_schedule_id !== 0) {
      errors.push('work_schedule_id is required');
    }
    if (!data.effective_start_date) {
      errors.push('effective_start_date is required');
    }

    // assignment_level validation
    const validLevels = ['DEPARTMENT', 'EMPLOYEE'];
    if (data.assignment_level && !validLevels.includes(String(data.assignment_level).toUpperCase())) {
      errors.push(`assignment_level must be one of: ${validLevels.join(', ')}`);
    }

    // Validate assignment_level-specific requirements
    const assignmentLevel = String(data.assignment_level || '').toUpperCase();
    if (assignmentLevel === 'DEPARTMENT') {
      if (!data.org_unit_id && data.org_unit_id !== 0) {
        errors.push('org_unit_id is required when assignment_level is DEPARTMENT');
      }
      if (data.employee_id !== undefined && data.employee_id !== null) {
        errors.push('employee_id must be null when assignment_level is DEPARTMENT');
      }
    } else if (assignmentLevel === 'EMPLOYEE') {
      if (!data.employee_id && data.employee_id !== 0) {
        errors.push('employee_id is required when assignment_level is EMPLOYEE');
      }
      if (data.org_unit_id !== undefined && data.org_unit_id !== null) {
        errors.push('org_unit_id must be null when assignment_level is EMPLOYEE');
      }
    }

    // Date validation
    if (data.effective_start_date) {
      const startDate = new Date(data.effective_start_date);
      if (isNaN(startDate.getTime())) {
        errors.push('effective_start_date must be a valid date (YYYY-MM-DD)');
      }
    }

    if (data.effective_end_date !== undefined && data.effective_end_date !== null) {
      const endDate = new Date(data.effective_end_date);
      if (isNaN(endDate.getTime())) {
        errors.push('effective_end_date must be a valid date (YYYY-MM-DD) or null');
      } else if (data.effective_start_date) {
        const startDate = new Date(data.effective_start_date);
        if (endDate < startDate) {
          errors.push('effective_end_date must be greater than or equal to effective_start_date');
        }
      }
    }

    // Status validation
    if (data.status !== undefined && data.status !== null) {
      const validStatuses = ['ACTIVE', 'INACTIVE'];
      if (!validStatuses.includes(String(data.status).toUpperCase())) {
        errors.push(`status must be one of: ${validStatuses.join(', ')}`);
      }
    }
  } else {
    // Update validation
    if (data.org_unit_id !== undefined && data.org_unit_id !== null) {
      const orgUnitId = parseInt(data.org_unit_id, 10);
      if (isNaN(orgUnitId) || orgUnitId <= 0) {
        errors.push('org_unit_id must be a positive number');
      }
    }

    if (data.employee_id !== undefined && data.employee_id !== null) {
      const employeeId = parseInt(data.employee_id, 10);
      if (isNaN(employeeId) || employeeId <= 0) {
        errors.push('employee_id must be a positive number');
      }
    }

    if (data.effective_end_date !== undefined && data.effective_end_date !== null) {
      const endDate = new Date(data.effective_end_date);
      if (isNaN(endDate.getTime())) {
        errors.push('effective_end_date must be a valid date (YYYY-MM-DD) or null');
      }
    }

    if (data.status !== undefined && data.status !== null) {
      const validStatuses = ['ACTIVE', 'INACTIVE'];
      if (!validStatuses.includes(String(data.status).toUpperCase())) {
        errors.push(`status must be one of: ${validStatuses.join(', ')}`);
      }
    }
  }

  return errors;
}

/* =========================
 * Routes
 * ========================= */

/**
 * @route   POST /api/tm/schedule-assignments
 * @desc    Create a new schedule assignment
 */
router.post('/', asyncHandler(async (req, res) => {
  const data = req.body;
  const errors = validateScheduleAssignmentData(data, false);
  if (errors.length > 0) {
    throw new ValidationError('Validation failed', errors);
  }

  // Validate tenant_id
  const tenantId = parseInt(data.tenant_id, 10);
  if (isNaN(tenantId)) {
    throw new ValidationError('Invalid tenant_id format');
  }
  await validateEnterpriseExists(tenantId);

  // Validate assignment_level-specific requirements
  const assignmentLevel = String(data.assignment_level).toUpperCase();
  if (assignmentLevel === 'DEPARTMENT') {
    const orgUnitId = parseInt(data.org_unit_id, 10);
    if (isNaN(orgUnitId)) {
      throw new ValidationError('Invalid org_unit_id format');
    }
    await ScheduleAssignmentModel.validateOrgUnitExists(orgUnitId, tenantId);
  } else if (assignmentLevel === 'EMPLOYEE') {
    const employeeId = parseInt(data.employee_id, 10);
    if (isNaN(employeeId)) {
      throw new ValidationError('Invalid employee_id format');
    }
    // Note: Employee validation would go here if employee table exists
  }

  // Validate work_schedule_id
  const workScheduleId = parseInt(data.work_schedule_id, 10);
  if (isNaN(workScheduleId)) {
    throw new ValidationError('Invalid work_schedule_id format');
  }
  await ScheduleAssignmentModel.validateWorkScheduleExists(workScheduleId, tenantId);

  const userId = getUserId(req);
  const upperCaseData = convertToUpperCase(data);

  // Map org_unit_id to DEPARTMENT_ID
  if (upperCaseData.ORG_UNIT_ID !== undefined) {
    upperCaseData.DEPARTMENT_ID = upperCaseData.ORG_UNIT_ID;
    delete upperCaseData.ORG_UNIT_ID;
  }

  const createResult = await ScheduleAssignmentModel.create(upperCaseData, userId);
  // Fetch the full schedule assignment object after creation
  const assignmentId = createResult.SCHEDULE_ASSIGNMENT_ID || createResult.schedule_assignment_id;
  const fullAssignment = await ScheduleAssignmentModel.findById(assignmentId, tenantId);
  if (!fullAssignment) {
    throw new NotFoundError('Schedule assignment was created but could not be retrieved');
  }
  
  // Map DEPARTMENT_ID back to org_unit_id in response
  if (fullAssignment.department_id !== undefined && fullAssignment.department_id !== null) {
    fullAssignment.org_unit_id = fullAssignment.department_id;
  }
  
  // Convert keys to lowercase snake_case
  const convertedAssignment = toLowerCaseKeys(fullAssignment);
  
  sendCreated(res, {
    message: 'Schedule assignment created successfully',
    data: convertedAssignment
  });
}));

/**
 * @route   GET /api/tm/schedule-assignments
 * @desc    Get list of schedule assignments
 */
router.get('/', asyncHandler(async (req, res) => {
  const filters = {};
  const appliedFilters = {};

  if (!req.query.tenant_id) {
    throw new ValidationError('tenant_id query parameter is required');
  }

  const tenantId = parseInt(req.query.tenant_id, 10);
  if (isNaN(tenantId)) {
    throw new ValidationError('Invalid tenant_id format');
  }

  filters.tenantId = tenantId;
  appliedFilters.tenant_id = tenantId;

  if (req.query.assignment_level) {
    filters.assignmentLevel = String(req.query.assignment_level).toUpperCase();
    appliedFilters.assignment_level = filters.assignmentLevel;
  }

  if (req.query.org_unit_id !== undefined) {
    const orgUnitId = parseInt(req.query.org_unit_id, 10);
    if (isNaN(orgUnitId)) {
      throw new ValidationError('Invalid org_unit_id format');
    }
    filters.orgUnitId = orgUnitId;
    appliedFilters.org_unit_id = orgUnitId;
  }

  if (req.query.employee_id !== undefined) {
    const employeeId = parseInt(req.query.employee_id, 10);
    if (isNaN(employeeId)) {
      throw new ValidationError('Invalid employee_id format');
    }
    filters.employeeId = employeeId;
    appliedFilters.employee_id = employeeId;
  }

  if (req.query.status) {
    filters.status = String(req.query.status).toUpperCase();
    appliedFilters.status = filters.status;
  }

  if (req.query.effective_on) {
    const effectiveDate = new Date(req.query.effective_on);
    if (isNaN(effectiveDate.getTime())) {
      throw new ValidationError('effective_on must be a valid date (YYYY-MM-DD)');
    }
    filters.effectiveOn = effectiveDate;
    appliedFilters.effective_on = req.query.effective_on;
  }

  let page = 1;
  let pageSize = 10;
  if (req.query.page !== undefined) {
    page = parseInt(req.query.page, 10);
    if (isNaN(page) || page < 1) {
      throw new ValidationError('page must be a positive integer');
    }
  }
  if (req.query.page_size !== undefined) {
    pageSize = parseInt(req.query.page_size, 10);
    if (isNaN(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new ValidationError('page_size must be between 1 and 100');
    }
  }

  filters.pagination = { page, pageSize };

  const result = await ScheduleAssignmentModel.findAll(filters);

  const total = result.total || 0;
  const totalPages = Math.ceil(total / pageSize);
  const hasNext = page < totalPages;
  const hasPrevious = page > 1;

  // Map DEPARTMENT_ID back to org_unit_id in response
  const assignments = result.assignments.map(assignment => {
    if (assignment.department_id !== undefined && assignment.department_id !== null) {
      assignment.org_unit_id = assignment.department_id;
      // Keep department_id for backward compatibility if needed
    }
    return assignment;
  });

  // Convert keys to lowercase snake_case
  const convertedAssignments = toLowerCaseKeys(assignments);
  
  sendList(res, {
    message: 'Schedule assignments fetched successfully',
    data: convertedAssignments,
    meta: {
      pagination: {
        page,
        pageSize,
        total: total,
        totalPages,
        hasNext,
        hasPrevious
      }
    }
  });
}));

/**
 * @route   GET /api/tm/schedule-assignments/:schedule_assignment_id
 * @desc    Get single schedule assignment
 */
router.get('/:schedule_assignment_id', asyncHandler(async (req, res) => {
  const scheduleAssignmentId = parseInt(req.params.schedule_assignment_id, 10);
  if (isNaN(scheduleAssignmentId)) {
    throw new ValidationError('Invalid schedule_assignment_id format');
  }

  if (!req.query.tenant_id) {
    throw new ValidationError('tenant_id query parameter is required');
  }
  const tenantId = parseInt(req.query.tenant_id, 10);
  if (isNaN(tenantId)) {
    throw new ValidationError('Invalid tenant_id format');
  }

  const assignment = await ScheduleAssignmentModel.findById(scheduleAssignmentId, tenantId);
  if (!assignment) {
    throw new NotFoundError('Schedule assignment not found');
  }

  // Map DEPARTMENT_ID back to org_unit_id in response
  if (assignment.department_id !== undefined && assignment.department_id !== null) {
    assignment.org_unit_id = assignment.department_id;
  }

  // Convert keys to lowercase snake_case
  const convertedAssignment = toLowerCaseKeys(assignment);
  
  sendSuccess(res, {
    message: 'Schedule assignment fetched successfully',
    data: convertedAssignment
  });
}));

/**
 * @route   PATCH /api/tm/schedule-assignments/:schedule_assignment_id
 * @desc    Update schedule assignment
 */
router.patch('/:schedule_assignment_id', asyncHandler(async (req, res) => {
  const scheduleAssignmentId = parseInt(req.params.schedule_assignment_id, 10);
  if (isNaN(scheduleAssignmentId)) {
    throw new ValidationError('Invalid schedule_assignment_id format');
  }

  let tenantId = req.body.tenant_id || req.query.tenant_id;
  if (!tenantId) {
    throw new ValidationError('tenant_id is required (in body or query)');
  }
  tenantId = parseInt(tenantId, 10);
  if (isNaN(tenantId)) {
    throw new ValidationError('Invalid tenant_id format');
  }

  const data = req.body;
  const errors = validateScheduleAssignmentData(data, true);
  if (errors.length > 0) {
    throw new ValidationError('Validation failed', errors);
  }

  // Get existing assignment to validate effective_end_date against effective_start_date
  const existingAssignment = await ScheduleAssignmentModel.findById(scheduleAssignmentId, tenantId);
  if (!existingAssignment) {
    throw new NotFoundError('Schedule assignment not found');
  }

  // Validate org_unit_id if provided (for DEPARTMENT assignments)
  if (data.org_unit_id !== undefined && data.org_unit_id !== null) {
    if (existingAssignment.assignment_level !== 'DEPARTMENT') {
      throw new ValidationError('org_unit_id can only be updated for DEPARTMENT assignments');
    }
    const orgUnitId = parseInt(data.org_unit_id, 10);
    if (isNaN(orgUnitId)) {
      throw new ValidationError('Invalid org_unit_id format');
    }
    await ScheduleAssignmentModel.validateOrgUnitExists(orgUnitId, tenantId);
  }

  // Validate employee_id if provided (for EMPLOYEE assignments)
  if (data.employee_id !== undefined && data.employee_id !== null) {
    if (existingAssignment.assignment_level !== 'EMPLOYEE') {
      throw new ValidationError('employee_id can only be updated for EMPLOYEE assignments');
    }
    const employeeId = parseInt(data.employee_id, 10);
    if (isNaN(employeeId)) {
      throw new ValidationError('Invalid employee_id format');
    }
    // Note: Add employee validation here if employee table exists
  }

  // Validate effective_end_date >= effective_start_date
  if (data.effective_end_date !== undefined && data.effective_end_date !== null) {
    const endDate = new Date(data.effective_end_date);
    const startDate = new Date(existingAssignment.effective_start_date);
    if (endDate < startDate) {
      throw new ValidationError('effective_end_date must be greater than or equal to effective_start_date');
    }
  }

  const userId = getUserId(req);
  const upperCaseData = convertToUpperCase(data);

  // Map org_unit_id to DEPARTMENT_ID for database
  if (upperCaseData.ORG_UNIT_ID !== undefined) {
    upperCaseData.DEPARTMENT_ID = upperCaseData.ORG_UNIT_ID;
    delete upperCaseData.ORG_UNIT_ID;
  }

  const updatedAssignment = await ScheduleAssignmentModel.update(
    scheduleAssignmentId,
    tenantId,
    upperCaseData,
    userId
  );

  // Map DEPARTMENT_ID back to org_unit_id in response
  if (updatedAssignment.department_id !== undefined && updatedAssignment.department_id !== null) {
    updatedAssignment.org_unit_id = updatedAssignment.department_id;
  }

  // Convert keys to lowercase snake_case
  const convertedAssignment = toLowerCaseKeys(updatedAssignment);
  
  sendUpdated(res, {
    message: 'Schedule assignment updated successfully',
    data: convertedAssignment
  });
}));

/**
 * @route   DELETE /api/tm/schedule-assignments/:schedule_assignment_id
 * @desc    Delete schedule assignment
 */
router.delete('/:schedule_assignment_id', asyncHandler(async (req, res) => {
  const scheduleAssignmentId = parseInt(req.params.schedule_assignment_id, 10);
  if (isNaN(scheduleAssignmentId)) {
    throw new ValidationError('Invalid schedule_assignment_id format');
  }

  // For DELETE, prefer query parameter, fallback to body if present
  let tenantId = req.query.tenant_id || (req.body && req.body.tenant_id ? req.body.tenant_id : null);
  if (!tenantId) {
    throw new ValidationError('tenant_id is required (in query parameter or body)');
  }
  tenantId = parseInt(tenantId, 10);
  if (isNaN(tenantId)) {
    throw new ValidationError('Invalid tenant_id format');
  }

  // Fetch the full assignment object before deletion so we can return it in the response
  const assignmentToDelete = await ScheduleAssignmentModel.findById(scheduleAssignmentId, tenantId);
  if (!assignmentToDelete) {
    throw new NotFoundError('Schedule assignment not found');
  }
  
  await ScheduleAssignmentModel.delete(scheduleAssignmentId, tenantId);
  
  // Map DEPARTMENT_ID back to org_unit_id in response
  if (assignmentToDelete.department_id !== undefined && assignmentToDelete.department_id !== null) {
    assignmentToDelete.org_unit_id = assignmentToDelete.department_id;
  }
  
  // Convert keys to lowercase snake_case
  const convertedAssignment = toLowerCaseKeys(assignmentToDelete);
  
  sendDeleted(res, {
    message: 'Schedule assignment deleted successfully',
    data: convertedAssignment
  });
}));

export default router;

