import express from 'express';
import AbsLeavePolicyModel from '../model/absLeavePolicyModel.js';
import {
  sendPolicyList,
  sendPolicy,
  sendCreated,
  sendUpdated,
  sendDeleted,
  sendBadRequest,
  sendServerError,
  sendNotFound,
  sendConflict
} from '../view/absLeavePolicyView.js';
import absLeavePolicyEligibilityController from './absLeavePolicyEligibilityController.js';
import absLeavePolicyRulesController from './absLeavePolicyRulesController.js';

const router = express.Router();

// Middleware to track request start time for execution time calculation
router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

/**
 * Validation helper
 */
function validatePolicyData(data, isUpdate = false) {
  const errors = [];

  if (!isUpdate) {
    // Required fields for creation
    if (!data.tenant_id && !data.TENANT_ID) {
      errors.push('tenant_id is required');
    }
    if (!data.leave_type_en && !data.LEAVE_TYPE_EN) {
      errors.push('leave_type_en is required');
    } else {
      const leaveTypeEn = (data.leave_type_en || data.LEAVE_TYPE_EN || '').trim();
      if (leaveTypeEn === '') {
        errors.push('leave_type_en cannot be empty');
      }
    }
    if (data.entitlement_days === undefined && data.ENTITLEMENT_DAYS === undefined) {
      errors.push('entitlement_days is required');
    } else {
      const entitlementDays = data.entitlement_days !== undefined ? data.entitlement_days : data.ENTITLEMENT_DAYS;
      if (entitlementDays === null || isNaN(entitlementDays) || entitlementDays < 0) {
        errors.push('entitlement_days must be a valid number >= 0');
      }
    }
  } else {
    // For updates, validate only provided fields
    if (data.leave_type_en !== undefined || data.LEAVE_TYPE_EN !== undefined) {
      const leaveTypeEn = (data.leave_type_en || data.LEAVE_TYPE_EN || '').trim();
      if (leaveTypeEn === '') {
        errors.push('leave_type_en cannot be empty');
      }
    }
    if (data.entitlement_days !== undefined || data.ENTITLEMENT_DAYS !== undefined) {
      const entitlementDays = data.entitlement_days !== undefined ? data.entitlement_days : data.ENTITLEMENT_DAYS;
      if (entitlementDays === null || isNaN(entitlementDays) || entitlementDays < 0) {
        errors.push('entitlement_days must be a valid number >= 0');
      }
    }
  }

  // Validate status
  if (data.status !== undefined || data.STATUS !== undefined) {
    const status = (data.status || data.STATUS || '').toUpperCase();
    if (status !== 'ACTIVE' && status !== 'INACTIVE') {
      errors.push('status must be ACTIVE or INACTIVE');
    }
  }

  // Validate kuwait_labor_compliant
  if (data.kuwait_labor_compliant !== undefined || data.KUWAIT_LABOR_COMPLIANT !== undefined) {
    const compliant = (data.kuwait_labor_compliant || data.KUWAIT_LABOR_COMPLIANT || '').toUpperCase();
    if (compliant !== 'Y' && compliant !== 'N' && compliant !== '') {
      errors.push('kuwait_labor_compliant must be Y or N');
    }
  }

  return errors;
}

/**
 * Extract user ID from request (can be from token, session, etc.)
 * For now, using a header or defaulting to SYSTEM
 */
function getUserId(req) {
  return req.headers['x-user-id'] || req.user?.id || 'SYSTEM';
}

/**
 * Normalize request body to uppercase field names
 */
function normalizeBody(body) {
  const normalized = {};
  const fieldMap = {
    'tenant_id': 'TENANT_ID',
    'leave_type_id': 'LEAVE_TYPE_ID',
    'leave_type_en': 'LEAVE_TYPE_EN',
    'leave_type_ar': 'LEAVE_TYPE_AR',
    'entitlement_days': 'ENTITLEMENT_DAYS',
    'accrual_method_code': 'ACCRUAL_METHOD_CODE',
    'status': 'STATUS',
    'kuwait_labor_compliant': 'KUWAIT_LABOR_COMPLIANT'
  };

  for (const [lowerKey, upperKey] of Object.entries(fieldMap)) {
    if (body[lowerKey] !== undefined) {
      normalized[upperKey] = body[lowerKey];
    } else if (body[upperKey] !== undefined) {
      normalized[upperKey] = body[upperKey];
    }
  }

  return normalized;
}

/**
 * @route   GET /api/abs/leave-policies
 * @desc    Get all leave policies for a tenant
 * @query   tenant_id - Required tenant ID
 * @query   status - Optional filter by status
 * @query   accrual_method_code - Optional filter by accrual method code
 * @query   kuwait_labor_compliant - Optional filter by Kuwait labor compliance (Y/N)
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    const tenantId = req.query.tenant_id || req.query.TENANT_ID;
    
    if (!tenantId) {
      return sendBadRequest(res, req, 'tenant_id is required');
    }

    const tenantIdNum = parseInt(tenantId);
    if (isNaN(tenantIdNum) || tenantIdNum <= 0) {
      return sendBadRequest(res, req, 'tenant_id must be a valid positive number');
    }

    // Build filters
    const filters = {};
    if (req.query.status) {
      filters.status = req.query.status;
    }
    if (req.query.accrual_method_code) {
      filters.accrual_method_code = req.query.accrual_method_code;
    }
    if (req.query.kuwait_labor_compliant !== undefined) {
      filters.kuwait_labor_compliant = req.query.kuwait_labor_compliant;
    }

    const policies = await AbsLeavePolicyModel.findAll(tenantIdNum, filters);
    sendPolicyList(res, req, policies, { tenant_id: tenantIdNum, filters });
  } catch (error) {
    if (error.code === 'VALIDATION_ERROR' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to fetch leave policies', error);
  }
});

// Nested routes for eligibility rules
// Mount before the /:policy_id route to ensure proper route matching
router.use('/:policy_id/eligibility', absLeavePolicyEligibilityController);

// Nested routes for rules
// Mount before the /:policy_id route to ensure proper route matching
router.use('/:policy_id/rules', absLeavePolicyRulesController);

/**
 * @route   GET /api/abs/leave-policies/:policy_id
 * @desc    Get single leave policy by ID or GUID
 * @param   policy_id - Policy ID (numeric) or Policy GUID (32-char hex string)
 * @query   tenant_id - Required tenant ID
 * @access  Public
 */
router.get('/:policy_id', async (req, res) => {
  try {
    const identifier = req.params.policy_id.trim();
    
    // Check if it's a hex GUID (32 hex characters) or numeric ID
    const isHexGuid = /^[0-9A-F]{32}$/i.test(identifier);
    
    if (!isHexGuid) {
      // Try to parse as numeric ID
      const policyId = parseInt(identifier);
      if (isNaN(policyId) || policyId <= 0) {
        return sendBadRequest(res, req, 'Invalid policy_id format (must be numeric or 32-character hex GUID)');
      }
    }

    const tenantId = req.query.tenant_id || req.query.TENANT_ID;
    
    if (!tenantId) {
      return sendBadRequest(res, req, 'tenant_id is required');
    }

    const tenantIdNum = parseInt(tenantId);
    if (isNaN(tenantIdNum) || tenantIdNum <= 0) {
      return sendBadRequest(res, req, 'tenant_id must be a valid positive number');
    }

    const policy = await AbsLeavePolicyModel.findById(identifier, tenantIdNum);
    sendPolicy(res, req, policy);
  } catch (error) {
    if (error.code === 'VALIDATION_ERROR' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.message);
    }
    if (error.code === 'NOT_FOUND' && error.statusCode === 404) {
      return sendNotFound(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to fetch leave policy', error);
  }
});

/**
 * @route   POST /api/abs/leave-policies
 * @desc    Create a new leave policy
 * @body    { tenant_id, leave_type_en, entitlement_days, accrual_method_code?, status?, kuwait_labor_compliant? }
 * @access  Public
 */
router.post('/', async (req, res) => {
  try {
    const normalizedBody = normalizeBody(req.body);
    const errors = validatePolicyData(normalizedBody, false);

    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Set defaults
    if (!normalizedBody.ACCRUAL_METHOD_CODE) {
      normalizedBody.ACCRUAL_METHOD_CODE = 'NONE';
    }
    if (!normalizedBody.STATUS) {
      normalizedBody.STATUS = 'ACTIVE';
    } else {
      normalizedBody.STATUS = normalizedBody.STATUS.toUpperCase();
    }
    if (normalizedBody.KUWAIT_LABOR_COMPLIANT) {
      normalizedBody.KUWAIT_LABOR_COMPLIANT = normalizedBody.KUWAIT_LABOR_COMPLIANT.toUpperCase();
    }

    // Convert tenant_id to number
    if (normalizedBody.TENANT_ID) {
      normalizedBody.TENANT_ID = parseInt(normalizedBody.TENANT_ID);
      if (isNaN(normalizedBody.TENANT_ID) || normalizedBody.TENANT_ID <= 0) {
        return sendBadRequest(res, req, 'tenant_id must be a valid positive number');
      }
    }

    // Convert entitlement_days to number
    if (normalizedBody.ENTITLEMENT_DAYS !== undefined) {
      normalizedBody.ENTITLEMENT_DAYS = parseFloat(normalizedBody.ENTITLEMENT_DAYS);
      if (isNaN(normalizedBody.ENTITLEMENT_DAYS) || normalizedBody.ENTITLEMENT_DAYS < 0) {
        return sendBadRequest(res, req, 'entitlement_days must be a valid number >= 0');
      }
    }

    const userId = getUserId(req);
    const newPolicy = await AbsLeavePolicyModel.create(normalizedBody, userId);
    sendCreated(res, req, newPolicy);
  } catch (error) {
    if (error.code === 'CONFLICT' && error.statusCode === 409) {
      return sendConflict(res, req, error.message);
    }
    if (error.code === 'VALIDATION_ERROR' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to create leave policy', error);
  }
});

/**
 * @route   PUT /api/abs/leave-policies/:policy_id
 * @desc    Update leave policy
 * @param   policy_id - Policy ID (numeric) or Policy GUID (32-char hex string)
 * @query   tenant_id - Required tenant ID
 * @body    { leave_type_en?, entitlement_days?, accrual_method_code?, status?, kuwait_labor_compliant? }
 * @access  Public
 */
router.put('/:policy_id', async (req, res) => {
  try {
    const identifier = req.params.policy_id.trim();
    
    // Check if it's a hex GUID (32 hex characters) or numeric ID
    const isHexGuid = /^[0-9A-F]{32}$/i.test(identifier);
    
    if (!isHexGuid) {
      // Try to parse as numeric ID
      const policyId = parseInt(identifier);
      if (isNaN(policyId) || policyId <= 0) {
        return sendBadRequest(res, req, 'Invalid policy_id format (must be numeric or 32-character hex GUID)');
      }
    }

    const tenantId = req.query.tenant_id || req.query.TENANT_ID;
    
    if (!tenantId) {
      return sendBadRequest(res, req, 'tenant_id is required');
    }

    const tenantIdNum = parseInt(tenantId);
    if (isNaN(tenantIdNum) || tenantIdNum <= 0) {
      return sendBadRequest(res, req, 'tenant_id must be a valid positive number');
    }

    const normalizedBody = normalizeBody(req.body);
    const errors = validatePolicyData(normalizedBody, true);

    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Normalize status and kuwait_labor_compliant to uppercase if provided
    if (normalizedBody.STATUS) {
      normalizedBody.STATUS = normalizedBody.STATUS.toUpperCase();
    }
    if (normalizedBody.KUWAIT_LABOR_COMPLIANT) {
      normalizedBody.KUWAIT_LABOR_COMPLIANT = normalizedBody.KUWAIT_LABOR_COMPLIANT.toUpperCase();
    }

    // Convert entitlement_days to number if provided
    if (normalizedBody.ENTITLEMENT_DAYS !== undefined) {
      normalizedBody.ENTITLEMENT_DAYS = parseFloat(normalizedBody.ENTITLEMENT_DAYS);
      if (isNaN(normalizedBody.ENTITLEMENT_DAYS) || normalizedBody.ENTITLEMENT_DAYS < 0) {
        return sendBadRequest(res, req, 'entitlement_days must be a valid number >= 0');
      }
    }

    const userId = getUserId(req);
    const updatedPolicy = await AbsLeavePolicyModel.update(identifier, tenantIdNum, normalizedBody, userId);
    sendUpdated(res, req, updatedPolicy);
  } catch (error) {
    if (error.code === 'NOT_FOUND' && error.statusCode === 404) {
      return sendNotFound(res, req, error.message);
    }
    if (error.code === 'VALIDATION_ERROR' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to update leave policy', error);
  }
});

/**
 * @route   DELETE /api/abs/leave-policies/:policy_id
 * @desc    Delete leave policy (only if no child records exist)
 * @param   policy_id - Policy ID (numeric) or Policy GUID (32-char hex string)
 * @query   tenant_id - Required tenant ID
 * @access  Public
 */
router.delete('/:policy_id', async (req, res) => {
  try {
    const identifier = req.params.policy_id.trim();
    
    // Check if it's a hex GUID (32 hex characters) or numeric ID
    const isHexGuid = /^[0-9A-F]{32}$/i.test(identifier);
    
    if (!isHexGuid) {
      // Try to parse as numeric ID
      const policyId = parseInt(identifier);
      if (isNaN(policyId) || policyId <= 0) {
        return sendBadRequest(res, req, 'Invalid policy_id format (must be numeric or 32-character hex GUID)');
      }
    }

    const tenantId = req.query.tenant_id || req.query.TENANT_ID;
    
    if (!tenantId) {
      return sendBadRequest(res, req, 'tenant_id is required');
    }

    const tenantIdNum = parseInt(tenantId);
    if (isNaN(tenantIdNum) || tenantIdNum <= 0) {
      return sendBadRequest(res, req, 'tenant_id must be a valid positive number');
    }

    // Get policy_id before deletion for response
    const policyToDelete = await AbsLeavePolicyModel.findById(identifier, tenantIdNum);
    const policyId = policyToDelete ? (policyToDelete.policy_id || policyToDelete.POLICY_ID) : null;
    
    await AbsLeavePolicyModel.delete(identifier, tenantIdNum);
    sendDeleted(res, req, 'Leave policy deleted successfully', policyId);
  } catch (error) {
    if (error.code === 'NOT_FOUND' && error.statusCode === 404) {
      return sendNotFound(res, req, error.message);
    }
    if (error.code === 'VALIDATION_ERROR' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to delete leave policy', error);
  }
});

export default router;
