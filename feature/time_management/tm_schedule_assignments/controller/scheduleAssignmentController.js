import express from 'express';
import ScheduleAssignmentModel from '../model/scheduleAssignmentModel.js';
import EnterpriseModel from '../../../enterprise_structure/enterprises/model/enterpriseModel.js';
import { sendCreated, sendUpdated, sendDeleted, sendList, sendSuccess } from '../../../../utils/response.js';
import { toLowerCaseKeys } from '../../../../utils/stringUtils.js';
import { ValidationError, NotFoundError } from '../../../../utils/errors/index.js';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  requireActingUserId,
  getActingUsername,
  handleSecuredQueryError,
  logSecuredAccess
} from '../../../../utils/userContext.js';

const ROUTE_TAG_LIST = 'GET /api/tm/schedule-assignments';
const ROUTE_TAG_DETAIL = 'GET /api/tm/schedule-assignments/:id';

const router = express.Router();

router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

/* =========================
 * Helpers
 * ========================= */

function convertToUpperCase(data) {
  const converted = {};
  for (const [key, value] of Object.entries(data || {})) {
    converted[key.toUpperCase()] = value;
  }
  return converted;
}

/**
 * Resolve the audit actor (string username) for CREATED_BY / LAST_UPDATED_BY.
 * Always sourced from the verified JWT (no header / body fallback) and falls
 * back to 'SYSTEM' for unauthenticated internal flows.
 */
function getAuditActor(req) {
  return getActingUsername(req) ?? 'SYSTEM';
}

async function validateEnterpriseExists(tenantId) {
  const enterprise = await EnterpriseModel.findById(tenantId);
  if (!enterprise) throw new NotFoundError(`Enterprise with ID ${tenantId} does not exist`);
  return true;
}

function validateScheduleAssignmentData(data, isUpdate = false) {
  const errors = [];

  const validLevels = ['DEPARTMENT', 'EMPLOYEE'];
  const validStatuses = ['ACTIVE', 'INACTIVE'];

  const empty = (v) => v === undefined || v === null || String(v).trim() === '';

  const isValidDate = (v) => {
    const d = new Date(v);
    return !isNaN(d.getTime());
  };

  if (!isUpdate) {
    if (!data.tenant_id && data.tenant_id !== 0) errors.push('tenant_id is required');
    if (empty(data.assignment_level)) errors.push('assignment_level is required');
    if (!data.work_schedule_id && data.work_schedule_id !== 0) errors.push('work_schedule_id is required');
    if (!data.effective_start_date) errors.push('effective_start_date is required');

    const level = String(data.assignment_level || '').toUpperCase();
    if (level && !validLevels.includes(level)) errors.push(`assignment_level must be one of: ${validLevels.join(', ')}`);

    if (level === 'DEPARTMENT') {
      if (empty(data.org_unit_id)) errors.push('org_unit_id is required when assignment_level is DEPARTMENT');
      if (data.employee_id !== undefined && data.employee_id !== null) errors.push('employee_id must be null when assignment_level is DEPARTMENT');
    } else if (level === 'EMPLOYEE') {
      if (!data.employee_id && data.employee_id !== 0) errors.push('employee_id is required when assignment_level is EMPLOYEE');
      if (data.org_unit_id !== undefined && data.org_unit_id !== null) errors.push('org_unit_id must be null when assignment_level is EMPLOYEE');
    }

    if (data.effective_start_date && !isValidDate(data.effective_start_date)) {
      errors.push('effective_start_date must be a valid date (YYYY-MM-DD)');
    }

    if (data.effective_end_date !== undefined && data.effective_end_date !== null) {
      if (!isValidDate(data.effective_end_date)) {
        errors.push('effective_end_date must be a valid date (YYYY-MM-DD) or null');
      } else if (data.effective_start_date && isValidDate(data.effective_start_date)) {
        if (new Date(data.effective_end_date) < new Date(data.effective_start_date)) {
          errors.push('effective_end_date must be >= effective_start_date');
        }
      }
    }

    if (data.status !== undefined && data.status !== null) {
      const st = String(data.status).toUpperCase();
      if (!validStatuses.includes(st)) errors.push(`status must be one of: ${validStatuses.join(', ')}`);
    }
  } else {
    // update validation
    if (data.org_unit_id !== undefined && data.org_unit_id !== null) {
      const s = String(data.org_unit_id).trim();
      if (!s) errors.push('org_unit_id must be a valid GUID string');
    }

    if (data.employee_id !== undefined && data.employee_id !== null) {
      const n = parseInt(data.employee_id, 10);
      if (isNaN(n) || n <= 0) errors.push('employee_id must be a positive number');
    }

    if (data.work_schedule_id !== undefined && data.work_schedule_id !== null) {
      const n = parseInt(data.work_schedule_id, 10);
      if (isNaN(n) || n <= 0) errors.push('work_schedule_id must be a positive number');
    }

    if (data.effective_start_date !== undefined && data.effective_start_date !== null) {
      if (!isValidDate(data.effective_start_date)) errors.push('effective_start_date must be a valid date (YYYY-MM-DD)');
    }

    if (data.effective_end_date !== undefined && data.effective_end_date !== null) {
      if (!isValidDate(data.effective_end_date)) errors.push('effective_end_date must be a valid date (YYYY-MM-DD) or null');
    }

    // if both provided, validate start<=end
    if (
      data.effective_start_date !== undefined && data.effective_start_date !== null &&
      data.effective_end_date !== undefined && data.effective_end_date !== null
    ) {
      if (new Date(data.effective_end_date) < new Date(data.effective_start_date)) {
        errors.push('effective_end_date must be >= effective_start_date');
      }
    }

    if (data.status !== undefined && data.status !== null) {
      const st = String(data.status).toUpperCase();
      if (!validStatuses.includes(st)) errors.push(`status must be one of: ${validStatuses.join(', ')}`);
    }
  }

  return errors;
}

/* =========================
 * Routes
 * ========================= */

router.post('/', asyncHandler(async (req, res) => {
  const data = req.body;

  const errors = validateScheduleAssignmentData(data, false);
  if (errors.length) throw new ValidationError('Validation failed', errors);

  const tenantId = parseInt(data.tenant_id, 10);
  if (isNaN(tenantId)) throw new ValidationError('Invalid tenant_id format');
  await validateEnterpriseExists(tenantId);

  const assignmentLevel = String(data.assignment_level).toUpperCase();

  if (assignmentLevel === 'DEPARTMENT') {
    const orgUnitId = String(data.org_unit_id).trim();
    if (!orgUnitId) throw new ValidationError('Invalid org_unit_id format');
    await ScheduleAssignmentModel.validateOrgUnitExists(orgUnitId, tenantId);
  } else if (assignmentLevel === 'EMPLOYEE') {
    const employeeId = parseInt(data.employee_id, 10);
    if (isNaN(employeeId)) throw new ValidationError('Invalid employee_id format');
  }

  const workScheduleId = parseInt(data.work_schedule_id, 10);
  if (isNaN(workScheduleId)) throw new ValidationError('Invalid work_schedule_id format');
  await ScheduleAssignmentModel.validateWorkScheduleExists(workScheduleId, tenantId);

  const userId = getAuditActor(req);
  const upper = convertToUpperCase(data);

  if (upper.ORG_UNIT_ID !== undefined) {
    upper.DEPARTMENT_ID = upper.ORG_UNIT_ID;
    delete upper.ORG_UNIT_ID;
  }

  const created = await ScheduleAssignmentModel.create(upper, userId);
  const [full] = await ScheduleAssignmentModel.enrichAssignmentsBatch(
    [created].filter(Boolean),
    tenantId
  );
  if (!full) throw new NotFoundError('Schedule assignment was created but could not be retrieved');

  if (full.department_id !== undefined && full.department_id !== null) {
    full.org_unit_id = full.department_id;
  }

  sendCreated(res, {
    message: 'Schedule assignment created successfully',
    data: toLowerCaseKeys(full)
  });
}));

router.get('/', asyncHandler(async (req, res) => {
  if (!req.query.tenant_id) throw new ValidationError('tenant_id query parameter is required');

  const tenantId = parseInt(req.query.tenant_id, 10);
  if (isNaN(tenantId)) throw new ValidationError('Invalid tenant_id format');

  // FNDSEC data-access user_id comes strictly from the verified JWT.
  const actingUserId = requireActingUserId(req, res);
  if (actingUserId == null) return; // 401 already sent

  const filters = { tenantId, userId: actingUserId };
  const appliedFilters = { tenant_id: tenantId };

  if (req.query.assignment_level) {
    filters.assignmentLevel = String(req.query.assignment_level).toUpperCase();
    appliedFilters.assignment_level = filters.assignmentLevel;
  }

  if (req.query.org_unit_id !== undefined) {
    const orgUnitId = String(req.query.org_unit_id).trim();
    if (!orgUnitId) throw new ValidationError('Invalid org_unit_id format');
    filters.orgUnitId = orgUnitId;
    appliedFilters.org_unit_id = orgUnitId;
  }

  // ✅✅ FIX: org_structure_id support (pass-through to model)
  if (req.query.org_structure_id !== undefined) {
    const orgStructureId = String(req.query.org_structure_id).trim();
    if (!orgStructureId) throw new ValidationError('Invalid org_structure_id format');
    // model will validate hex32; we can also fail early:
    // if (!/^[0-9a-fA-F-]{32,36}$/.test(orgStructureId)) throw new ValidationError('org_structure_id must be a GUID');
    filters.orgStructureId = orgStructureId;
    appliedFilters.org_structure_id = orgStructureId;
  }

  if (req.query.employee_id !== undefined) {
    const employeeId = parseInt(req.query.employee_id, 10);
    if (isNaN(employeeId)) throw new ValidationError('Invalid employee_id format');
    filters.employeeId = employeeId;
    appliedFilters.employee_id = employeeId;
  }

  if (req.query.status) {
    filters.status = String(req.query.status).toUpperCase();
    appliedFilters.status = filters.status;
  }

  if (req.query.effective_on) {
    const d = new Date(req.query.effective_on);
    if (isNaN(d.getTime())) throw new ValidationError('effective_on must be a valid date (YYYY-MM-DD)');
    filters.effectiveOn = d;
    appliedFilters.effective_on = req.query.effective_on;
  }

  // include_enrichment: set to false/0 to skip work_schedule, org_unit, org_path (faster list)
  if (req.query.include_enrichment !== undefined) {
    const v = String(req.query.include_enrichment).toLowerCase();
    filters.includeEnrichment = v !== 'false' && v !== '0';
  }

  // include_org_path: set to false/0 to skip CONNECT BY org path batch (faster; org_unit + work_schedule + employee still included)
  if (req.query.include_org_path !== undefined) {
    const v = String(req.query.include_org_path).toLowerCase();
    filters.includeOrgPath = v !== 'false' && v !== '0';
    appliedFilters.include_org_path = filters.includeOrgPath;
  }

  let page = 1;
  let pageSize = 10;

  if (req.query.page !== undefined) {
    page = parseInt(req.query.page, 10);
    if (isNaN(page) || page < 1) throw new ValidationError('page must be a positive integer');
  }

  // ✅ keep your existing page_size, but also accept limit (common client param)
  if (req.query.page_size !== undefined) {
    pageSize = parseInt(req.query.page_size, 10);
    if (isNaN(pageSize) || pageSize < 1 || pageSize > 100) throw new ValidationError('page_size must be between 1 and 100');
  } else if (req.query.limit !== undefined) {
    pageSize = parseInt(req.query.limit, 10);
    if (isNaN(pageSize) || pageSize < 1 || pageSize > 100) throw new ValidationError('limit must be between 1 and 100');
  }

  filters.pagination = { page, pageSize };

  let result;
  try {
    result = await ScheduleAssignmentModel.findAll(filters);
  } catch (err) {
    handleSecuredQueryError(err, {
      route: ROUTE_TAG_LIST,
      friendlyMessage: 'Failed to fetch schedule assignments. Please try again later.',
      context: { user_id: actingUserId, tenant_id: tenantId }
    });
  }

  const total = result.total || 0;
  const totalPages = Math.ceil(total / pageSize);
  const hasNext = page < totalPages;
  const hasPrevious = page > 1;

  const assignments = (result.assignments || []).map((a) => {
    if (a.department_id !== undefined && a.department_id !== null) a.org_unit_id = a.department_id;
    return a;
  });

  logSecuredAccess(ROUTE_TAG_LIST, {
    user_id: actingUserId,
    tenant_id: tenantId,
    returned: assignments.length,
    total
  });

  sendList(res, {
    message: 'Schedule assignments fetched successfully',
    data: toLowerCaseKeys(assignments),
    meta: {
      filters: appliedFilters,
      pagination: { page, pageSize, total, totalPages, hasNext, hasPrevious }
    }
  });
}));

router.get('/:schedule_assignment_id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.schedule_assignment_id, 10);
  if (isNaN(id)) throw new ValidationError('Invalid schedule_assignment_id format');

  if (!req.query.tenant_id) throw new ValidationError('tenant_id query parameter is required');
  const tenantId = parseInt(req.query.tenant_id, 10);
  if (isNaN(tenantId)) throw new ValidationError('Invalid tenant_id format');

  // FNDSEC data-access user_id comes strictly from the verified JWT.
  const actingUserId = requireActingUserId(req, res);
  if (actingUserId == null) return; // 401 already sent

  let assignment;
  try {
    assignment = await ScheduleAssignmentModel.findById(id, tenantId, actingUserId);
  } catch (err) {
    handleSecuredQueryError(err, {
      route: ROUTE_TAG_DETAIL,
      friendlyMessage: 'Failed to fetch schedule assignment. Please try again later.',
      context: { user_id: actingUserId, tenant_id: tenantId, schedule_assignment_id: id }
    });
  }
  if (!assignment) throw new NotFoundError('Schedule assignment not found');

  if (assignment.department_id !== undefined && assignment.department_id !== null) {
    assignment.org_unit_id = assignment.department_id;
  }

  logSecuredAccess(ROUTE_TAG_DETAIL, {
    user_id: actingUserId,
    tenant_id: tenantId,
    schedule_assignment_id: id,
    allowed: 'Y'
  });

  sendSuccess(res, {
    message: 'Schedule assignment fetched successfully',
    data: toLowerCaseKeys(assignment)
  });
}));

router.patch('/:schedule_assignment_id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.schedule_assignment_id, 10);
  if (isNaN(id)) throw new ValidationError('Invalid schedule_assignment_id format');

  let tenantId = req.body.tenant_id || req.query.tenant_id;
  if (!tenantId) throw new ValidationError('tenant_id is required (in body or query)');
  tenantId = parseInt(tenantId, 10);
  if (isNaN(tenantId)) throw new ValidationError('Invalid tenant_id format');

  const data = req.body;
  const errors = validateScheduleAssignmentData(data, true);
  if (errors.length) throw new ValidationError('Validation failed', errors);

  const existing = await ScheduleAssignmentModel.findById(id, tenantId);
  if (!existing) throw new NotFoundError('Schedule assignment not found');

  // org_unit_id can only be updated for DEPARTMENT assignments
  if (data.org_unit_id !== undefined && data.org_unit_id !== null) {
    if (String(existing.assignment_level).toUpperCase() !== 'DEPARTMENT') {
      throw new ValidationError('org_unit_id can only be updated for DEPARTMENT assignments');
    }
    const orgUnitId = String(data.org_unit_id).trim();
    if (!orgUnitId) throw new ValidationError('Invalid org_unit_id format');
    await ScheduleAssignmentModel.validateOrgUnitExists(orgUnitId, tenantId);
  }

  // employee_id can only be updated for EMPLOYEE assignments
  if (data.employee_id !== undefined && data.employee_id !== null) {
    if (String(existing.assignment_level).toUpperCase() !== 'EMPLOYEE') {
      throw new ValidationError('employee_id can only be updated for EMPLOYEE assignments');
    }
  }

  // work_schedule_id if provided must exist
  if (data.work_schedule_id !== undefined && data.work_schedule_id !== null) {
    const ws = parseInt(data.work_schedule_id, 10);
    if (isNaN(ws)) throw new ValidationError('Invalid work_schedule_id format');
    await ScheduleAssignmentModel.validateWorkScheduleExists(ws, tenantId);
  }

  // Date cross-check using NEW start if provided, otherwise existing start
  const startRef = (data.effective_start_date !== undefined && data.effective_start_date !== null)
    ? new Date(data.effective_start_date)
    : new Date(existing.effective_start_date);

  const endRef = (data.effective_end_date !== undefined && data.effective_end_date !== null)
    ? new Date(data.effective_end_date)
    : (existing.effective_end_date ? new Date(existing.effective_end_date) : null);

  if (endRef && endRef < startRef) {
    throw new ValidationError('effective_end_date must be >= effective_start_date');
  }

  const userId = getAuditActor(req);
  const upper = convertToUpperCase(data);

  if (upper.ORG_UNIT_ID !== undefined) {
    upper.DEPARTMENT_ID = upper.ORG_UNIT_ID;
    delete upper.ORG_UNIT_ID;
  }

  const updated = await ScheduleAssignmentModel.update(id, tenantId, upper, userId);

  if (updated.department_id !== undefined && updated.department_id !== null) {
    updated.org_unit_id = updated.department_id;
  }

  sendUpdated(res, {
    message: 'Schedule assignment updated successfully',
    data: toLowerCaseKeys(updated)
  });
}));

router.delete('/:schedule_assignment_id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.schedule_assignment_id, 10);
  if (isNaN(id)) throw new ValidationError('Invalid schedule_assignment_id format');

  let tenantId = req.query.tenant_id || (req.body?.tenant_id ?? null);
  if (!tenantId) throw new ValidationError('tenant_id is required (in query parameter or body)');
  tenantId = parseInt(tenantId, 10);
  if (isNaN(tenantId)) throw new ValidationError('Invalid tenant_id format');

  const assignment = await ScheduleAssignmentModel.findById(id, tenantId);
  if (!assignment) throw new NotFoundError('Schedule assignment not found');

  await ScheduleAssignmentModel.delete(id, tenantId);

  if (assignment.department_id !== undefined && assignment.department_id !== null) {
    assignment.org_unit_id = assignment.department_id;
  }

  sendDeleted(res, {
    message: 'Schedule assignment deleted successfully',
    data: toLowerCaseKeys(assignment)
  });
}));

export default router;
