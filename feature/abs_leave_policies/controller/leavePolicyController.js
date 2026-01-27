import express from 'express';
import LeavePolicyModel from '../model/leavePolicyModel.js';
import { sendSuccess, sendPolicy, sendValidationError, sendDatabaseError, sendError, sendPolicyList } from '../view/leavePolicyView.js';
import { ValidationError, DatabaseError } from '../../../utils/errors/index.js';
import { asyncHandler } from '../../../middleware/asyncHandler.js';

const router = express.Router();

router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

/**
 * Parse and validate pagination parameters
 */
function parsePagination(query) {
  let page = 1;
  let pageSize = 10;

  if (query.page !== undefined) {
    const parsedPage = parseInt(query.page);
    if (isNaN(parsedPage) || parsedPage < 1) {
      throw new Error('Invalid page number. Must be a positive integer.');
    }
    page = parsedPage;
  }

  if (query.page_size !== undefined) {
    const parsedPageSize = parseInt(query.page_size);
    if (isNaN(parsedPageSize) || parsedPageSize < 1) {
      throw new Error('Invalid page_size. Must be a positive integer.');
    }
    pageSize = Math.min(100, parsedPageSize);
  }

  return { page, pageSize };
}

/**
 * Build pagination metadata
 */
function buildPaginationMeta(page, pageSize, totalCount) {
  const totalPages = Math.ceil(totalCount / pageSize);
  return {
    page,
    pageSize,
    total: totalCount,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1
  };
}

/**
 * Validation helper
 * @param {Object} data - Policy data to validate
 * @param {boolean} isUpdate - Whether this is an update operation (default: false)
 */
function validatePolicyData(data, isUpdate = false) {
  const errors = [];

  // Validate required fields
  if (data.tenant_id === undefined || data.tenant_id === null) {
    errors.push('tenant_id is required');
  } else if (!Number.isFinite(data.tenant_id) || data.tenant_id <= 0) {
    errors.push('tenant_id must be a valid positive number');
  }

  if (data.leave_type_id === undefined || data.leave_type_id === null) {
    errors.push('leave_type_id is required');
  } else if (!Number.isFinite(data.leave_type_id) || data.leave_type_id <= 0) {
    errors.push('leave_type_id must be a valid positive number');
  }

  if (data.entitlement_days === undefined || data.entitlement_days === null) {
    errors.push('entitlement_days is required');
  } else if (!Number.isFinite(data.entitlement_days) || data.entitlement_days < 0) {
    errors.push('entitlement_days must be a valid non-negative number');
  }

  if (data.accrual_method_code === undefined || data.accrual_method_code === null) {
    errors.push('accrual_method_code is required');
  } else if (typeof data.accrual_method_code !== 'string' || !data.accrual_method_code.trim()) {
    errors.push('accrual_method_code must be a non-empty string');
  }

  // policy_name is required for creates
  if (!isUpdate) {
    if (data.policy_name === undefined || data.policy_name === null) {
      errors.push('policy_name is required');
    } else if (typeof data.policy_name !== 'string' || !data.policy_name.trim()) {
      errors.push('policy_name must be a non-empty string');
    } else if (data.policy_name.length > 200) {
      errors.push('policy_name must not exceed 200 characters');
    }
  }

  // created_by is only required for creates, not updates
  if (!isUpdate) {
    if (data.created_by === undefined || data.created_by === null) {
      errors.push('created_by is required');
    } else if (typeof data.created_by !== 'string' || !data.created_by.trim()) {
      errors.push('created_by must be a non-empty string');
    }
  }

  // Validate grade_rows
  if (!data.grade_rows || !Array.isArray(data.grade_rows)) {
    errors.push('grade_rows is required and must be an array');
  } else if (data.grade_rows.length === 0) {
    errors.push('grade_rows must contain at least one grade row');
  } else {
    data.grade_rows.forEach((row, i) => {
      if (!row || typeof row !== 'object') {
        errors.push(`grade_rows[${i}]: must be an object`);
        return;
      }

      // Validate grade_from
      if (row.grade_from === undefined || row.grade_from === null) {
        errors.push(`grade_rows[${i}].grade_from is required`);
      } else if (!Number.isFinite(row.grade_from) || row.grade_from < 1) {
        errors.push(`grade_rows[${i}].grade_from must be a valid positive number (>= 1)`);
      }

      // Validate grade_to (optional)
      if (row.grade_to !== undefined && row.grade_to !== null) {
        if (!Number.isFinite(row.grade_to)) {
          errors.push(`grade_rows[${i}].grade_to must be a valid number or null`);
        } else if (row.grade_to < row.grade_from) {
          errors.push(`grade_rows[${i}].grade_to must be greater than or equal to grade_from`);
        }
      }

      // Validate entitlement_days
      if (row.entitlement_days === undefined || row.entitlement_days === null) {
        errors.push(`grade_rows[${i}].entitlement_days is required`);
      } else if (!Number.isFinite(row.entitlement_days) || row.entitlement_days < 0) {
        errors.push(`grade_rows[${i}].entitlement_days must be a valid non-negative number`);
      }

      // Validate accrual_rate
      if (row.accrual_rate === undefined || row.accrual_rate === null) {
        errors.push(`grade_rows[${i}].accrual_rate is required`);
      } else if (!Number.isFinite(row.accrual_rate) || row.accrual_rate < 0) {
        errors.push(`grade_rows[${i}].accrual_rate must be a valid non-negative number`);
      }
    });
  }

  // Validate policy_status (for updates)
  if (data.policy_status !== undefined && data.policy_status !== null) {
    if (typeof data.policy_status !== 'string' || !data.policy_status.trim()) {
      errors.push('policy_status must be a non-empty string');
    }
  }

  // Validate policy_name (for updates - optional but if provided must be valid)
  if (data.policy_name !== undefined && data.policy_name !== null) {
    if (typeof data.policy_name !== 'string' || !data.policy_name.trim()) {
      errors.push('policy_name must be a non-empty string');
    } else if (data.policy_name.length > 200) {
      errors.push('policy_name must not exceed 200 characters');
    }
  }

  // Validate optional numeric fields
  const optionalNumericFields = [
    'min_service_years', 'max_service_years', 'min_notice_days', 'max_consecutive_days',
    'carry_forward_limit', 'grace_period_days', 'notify_before_days',
    'encashment_limit_days', 'encashment_rate_pct'
  ];

  optionalNumericFields.forEach(field => {
    if (data[field] !== undefined && data[field] !== null) {
      if (!Number.isFinite(data[field])) {
        errors.push(`${field} must be a valid number or null`);
      } else if (data[field] < 0) {
        errors.push(`${field} must be a non-negative number`);
      }
    }
  });

  // Validate max_service_years is greater than min_service_years if both provided
  if (data.min_service_years !== undefined && data.min_service_years !== null &&
      data.max_service_years !== undefined && data.max_service_years !== null) {
    if (data.max_service_years < data.min_service_years) {
      errors.push('max_service_years must be greater than or equal to min_service_years');
    }
  }

  // Validate max_consecutive_days is greater than min_notice_days if both provided
  if (data.min_notice_days !== undefined && data.min_notice_days !== null &&
      data.max_consecutive_days !== undefined && data.max_consecutive_days !== null) {
    if (data.max_consecutive_days < data.min_notice_days) {
      errors.push('max_consecutive_days must be greater than or equal to min_notice_days');
    }
  }

  return errors;
}

/**
 * @route   GET /api/abs/policies
 * @desc    Get all leave policies from view with optional pagination
 * @query   tenant_id - Required tenant ID
 * @query   policy_id - Optional policy ID filter
 * @query   leave_type_id - Optional leave type ID filter
 * @query   page - Optional page number (default: 1)
 * @query   page_size - Optional page size (default: 10, max: 100)
 */
router.get('/policies', asyncHandler(async (req, res) => {
  const tenantId = req.query.tenant_id || req.query.TENANT_ID;
  
  if (!tenantId) {
    return sendValidationError(res, req, new ValidationError('tenant_id is required'));
  }

  const tenantIdNum = parseInt(tenantId);
  if (isNaN(tenantIdNum) || tenantIdNum <= 0) {
    return sendValidationError(res, req, new ValidationError('tenant_id must be a valid positive number'));
  }

  const filters = { tenantId: tenantIdNum };

  if (req.query.policy_id || req.query.POLICY_ID) {
    const policyId = parseInt(req.query.policy_id || req.query.POLICY_ID);
    if (!isNaN(policyId) && policyId > 0) {
      filters.policyId = policyId;
    }
  }

  if (req.query.leave_type_id || req.query.LEAVE_TYPE_ID) {
    const leaveTypeId = parseInt(req.query.leave_type_id || req.query.LEAVE_TYPE_ID);
    if (!isNaN(leaveTypeId) && leaveTypeId > 0) {
      filters.leaveTypeId = leaveTypeId;
    }
  }

  // Parse pagination
  let pagination = null;
  try {
    if (req.query.page !== undefined || req.query.page_size !== undefined) {
      pagination = parsePagination(req.query);
      filters.pagination = pagination;
    }
  } catch (paginationError) {
    return sendValidationError(res, req, new ValidationError(paginationError.message));
  }

  try {
    const result = await LeavePolicyModel.findAll(filters);
    
    // Handle paginated vs non-paginated response
    let policies, total, paginationMeta;
    if (pagination && typeof result === 'object' && result.policies !== undefined) {
      policies = result.policies;
      total = result.total;
      paginationMeta = buildPaginationMeta(pagination.page, pagination.pageSize, total);
    } else {
      policies = result; // Array when not paginated
      paginationMeta = null;
    }

    sendPolicyList(res, req, policies, { 
      tenant_id: tenantIdNum,
      filters: Object.keys(filters).filter(k => k !== 'tenantId' && k !== 'pagination').length > 0 
        ? Object.fromEntries(Object.entries(filters).filter(([k]) => k !== 'pagination'))
        : undefined,
      pagination: paginationMeta
    });
  } catch (error) {
    if (error instanceof ValidationError) return sendValidationError(res, req, error);
    if (error instanceof DatabaseError) return sendDatabaseError(res, req, error);
    if (error.errorNum || error.message?.includes('ORA-')) {
      return sendDatabaseError(res, req, new DatabaseError('Failed to fetch leave policies', error));
    }
    sendError(res, req, error);
  }
}));

/**
 * @route   GET /api/abs/policies/:id
 * @desc    Get a single leave policy by ID or GUID
 * @param   id - Policy ID (number) or GUID (32 hex characters)
 * @query   tenant_id - Required tenant ID
 */
router.get('/policies/:id', asyncHandler(async (req, res) => {
  const identifier = req.params.id?.trim();
  const tenantId = req.query.tenant_id || req.query.TENANT_ID;
  
  if (!tenantId) {
    return sendValidationError(res, req, new ValidationError('tenant_id is required'));
  }

  const tenantIdNum = parseInt(tenantId);
  if (isNaN(tenantIdNum) || tenantIdNum <= 0) {
    return sendValidationError(res, req, new ValidationError('tenant_id must be a valid positive number'));
  }

  if (!identifier) {
    return sendValidationError(res, req, new ValidationError('Policy ID or GUID is required'));
  }

  try {
    // Check if identifier is a GUID (32 hex characters) or numeric ID
    const isGuid = /^[0-9A-Fa-f]{32}$/.test(identifier);
    
    let policy;
    if (isGuid) {
      policy = await LeavePolicyModel.findByGuid(identifier.toUpperCase(), tenantIdNum);
    } else {
      const policyId = parseInt(identifier);
      if (isNaN(policyId) || policyId <= 0) {
        return sendValidationError(res, req, new ValidationError('Invalid policy identifier. Must be a valid policy ID (number) or GUID (32 hex characters).'));
      }
      policy = await LeavePolicyModel.findById(policyId, tenantIdNum);
    }

    if (!policy) {
      return sendDatabaseError(res, req, new DatabaseError('Policy not found', { errorNum: 1403, statusCode: 404 }));
    }

    sendPolicy(res, req, policy);
  } catch (error) {
    if (error instanceof ValidationError) return sendValidationError(res, req, error);
    if (error instanceof DatabaseError) return sendDatabaseError(res, req, error);
    if (error.errorNum || error.message?.includes('ORA-')) {
      return sendDatabaseError(res, req, new DatabaseError('Failed to fetch leave policy', error));
    }
    sendError(res, req, error);
  }
}));

/**
 * @route   POST /api/abs/create-policy
 * @desc    Create an ABS leave policy with grade rows by calling Oracle PL/SQL package
 */
router.post('/create-policy', asyncHandler(async (req, res) => {
  const validationErrors = validatePolicyData(req.body, false);
  if (validationErrors.length > 0) {
    return sendValidationError(res, req, new ValidationError('Validation failed', validationErrors));
  }

  try {
    const createdPolicy = await LeavePolicyModel.createPolicyWithGrades(req.body);
    sendSuccess(res, req, createdPolicy);
  } catch (error) {
    if (error instanceof ValidationError) return sendValidationError(res, req, error);
    if (error instanceof DatabaseError) return sendDatabaseError(res, req, error);
    if (error.errorNum || error.message?.includes('ORA-')) {
      return sendDatabaseError(res, req, new DatabaseError('Failed to create policy', error));
    }
    sendError(res, req, error);
  }
}));

/**
 * @route   PUT /api/abs/update-policy/:policyGuid
 * @desc    Update an ABS leave policy with grade rows by calling Oracle PL/SQL package
 */
router.put('/update-policy/:policyGuid', asyncHandler(async (req, res) => {
  const policyGuid = req.params.policyGuid?.trim();
  
  // Validate GUID format (32 hex characters)
  if (!policyGuid || !/^[0-9A-Fa-f]{32}$/.test(policyGuid)) {
    return sendValidationError(res, req, new ValidationError('Invalid policy_guid. Must be a valid 32-character hexadecimal GUID.'));
  }

  // Validate updated_by is provided for updates
  if (!req.body.updated_by || typeof req.body.updated_by !== 'string' || !req.body.updated_by.trim()) {
    return sendValidationError(res, req, new ValidationError('updated_by is required and must be a non-empty string'));
  }

  // Validate policy_status is provided for updates
  if (!req.body.policy_status || typeof req.body.policy_status !== 'string' || !req.body.policy_status.trim()) {
    return sendValidationError(res, req, new ValidationError('policy_status is required and must be a non-empty string'));
  }

  const validationErrors = validatePolicyData(req.body, true);
  if (validationErrors.length > 0) {
    return sendValidationError(res, req, new ValidationError('Validation failed', validationErrors));
  }

  try {
    const updatedPolicy = await LeavePolicyModel.updatePolicyWithGrades(policyGuid.toUpperCase(), req.body);
    sendSuccess(res, req, updatedPolicy, true);
  } catch (error) {
    if (error instanceof ValidationError) return sendValidationError(res, req, error);
    if (error instanceof DatabaseError) return sendDatabaseError(res, req, error);
    if (error.errorNum || error.message?.includes('ORA-')) {
      return sendDatabaseError(res, req, new DatabaseError('Failed to update policy', error));
    }
    sendError(res, req, error);
  }
}));

export default router;
