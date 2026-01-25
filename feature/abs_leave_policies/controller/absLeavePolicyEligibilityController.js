import express from 'express';
import AbsLeavePolicyEligibilityModel from '../model/absLeavePolicyEligibilityModel.js';
import {
  sendEligibilityList,
  sendEligibility,
  sendCreated,
  sendUpdated,
  sendDeleted,
  sendBadRequest,
  sendServerError,
  sendNotFound,
  sendConflict
} from '../view/absLeavePolicyEligibilityView.js';

const router = express.Router({ mergeParams: true }); // mergeParams to access :policy_id from parent route

// Middleware to track request start time for execution time calculation
router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

/**
 * Validation helper
 */
function validateEligibilityData(data, isUpdate = false) {
  const errors = [];

  if (!isUpdate) {
    // For creation, all fields are optional but validate if provided
  }

  // Validate min_service_years
  if (data.min_service_years !== undefined || data.MIN_SERVICE_YEARS !== undefined) {
    const minServiceYears = data.min_service_years !== undefined ? data.min_service_years : data.MIN_SERVICE_YEARS;
    if (minServiceYears !== null && (isNaN(minServiceYears) || minServiceYears < 0)) {
      errors.push('min_service_years must be a valid number >= 0');
    }
  }

  // Validate probation_allowed
  if (data.probation_allowed !== undefined || data.PROBATION_ALLOWED !== undefined) {
    const probationAllowed = (data.probation_allowed || data.PROBATION_ALLOWED || '').toUpperCase();
    if (probationAllowed !== '' && probationAllowed !== 'Y' && probationAllowed !== 'N') {
      errors.push('probation_allowed must be Y or N');
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
    'min_service_years': 'MIN_SERVICE_YEARS',
    'gender_code': 'GENDER_CODE',
    'probation_allowed': 'PROBATION_ALLOWED'
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
 * @route   GET /api/abs/leave-policies/:policy_id/eligibility
 * @desc    Get eligibility rules for a policy
 * @param   policy_id - Policy ID (numeric) or Policy GUID (32-char hex string)
 * @query   tenant_id - Required tenant ID
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    const policyIdentifier = req.params.policy_id.trim();
    
    // Check if it's a hex GUID (32 hex characters) or numeric ID
    const isHexGuid = /^[0-9A-F]{32}$/i.test(policyIdentifier);
    
    if (!isHexGuid) {
      // Try to parse as numeric ID
      const policyId = parseInt(policyIdentifier);
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

    const eligibilityRules = await AbsLeavePolicyEligibilityModel.findAll(policyIdentifier, tenantIdNum);
    sendEligibilityList(res, req, eligibilityRules, { 
      policy_id: policyIdentifier, 
      tenant_id: tenantIdNum 
    });
  } catch (error) {
    if (error.code === 'VALIDATION_ERROR' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.message);
    }
    if (error.code === 'NOT_FOUND' && error.statusCode === 404) {
      return sendNotFound(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to fetch eligibility rules', error);
  }
});

/**
 * @route   POST /api/abs/leave-policies/:policy_id/eligibility
 * @desc    Create eligibility rule for a policy
 * @param   policy_id - Policy ID (numeric) or Policy GUID (32-char hex string)
 * @query   tenant_id - Required tenant ID
 * @body    { min_service_years?, gender_code?, probation_allowed? }
 * @access  Public
 */
router.post('/', async (req, res) => {
  try {
    const policyIdentifier = req.params.policy_id.trim();
    
    // Check if it's a hex GUID (32 hex characters) or numeric ID
    const isHexGuid = /^[0-9A-F]{32}$/i.test(policyIdentifier);
    
    if (!isHexGuid) {
      // Try to parse as numeric ID
      const policyId = parseInt(policyIdentifier);
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
    const errors = validateEligibilityData(normalizedBody, false);

    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Normalize probation_allowed to uppercase if provided
    if (normalizedBody.PROBATION_ALLOWED) {
      normalizedBody.PROBATION_ALLOWED = normalizedBody.PROBATION_ALLOWED.toUpperCase();
    }

    // Convert min_service_years to number if provided
    if (normalizedBody.MIN_SERVICE_YEARS !== undefined) {
      if (normalizedBody.MIN_SERVICE_YEARS !== null) {
        normalizedBody.MIN_SERVICE_YEARS = parseFloat(normalizedBody.MIN_SERVICE_YEARS);
        if (isNaN(normalizedBody.MIN_SERVICE_YEARS) || normalizedBody.MIN_SERVICE_YEARS < 0) {
          return sendBadRequest(res, req, 'min_service_years must be a valid number >= 0');
        }
      }
    }

    const userId = getUserId(req);
    const newEligibility = await AbsLeavePolicyEligibilityModel.create(policyIdentifier, tenantIdNum, normalizedBody, userId);
    sendCreated(res, req, newEligibility);
  } catch (error) {
    if (error.code === 'CONFLICT' && error.statusCode === 409) {
      return sendConflict(res, req, error.message);
    }
    if (error.code === 'VALIDATION_ERROR' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.message);
    }
    if (error.code === 'NOT_FOUND' && error.statusCode === 404) {
      return sendNotFound(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to create eligibility rule', error);
  }
});

/**
 * @route   PUT /api/abs/leave-policies/:policy_id/eligibility/:eligibility_id
 * @desc    Update eligibility rule
 * @param   policy_id - Policy ID (numeric) or Policy GUID (32-char hex string)
 * @param   eligibility_id - Eligibility ID (numeric) or Eligibility GUID (32-char hex string)
 * @query   tenant_id - Required tenant ID
 * @body    { min_service_years?, gender_code?, probation_allowed? }
 * @access  Public
 */
router.put('/:eligibility_id', async (req, res) => {
  try {
    const policyIdentifier = req.params.policy_id.trim();
    const eligibilityIdentifier = req.params.eligibility_id.trim();
    
    // Check if policy_id is a hex GUID (32 hex characters) or numeric ID
    const isPolicyHexGuid = /^[0-9A-F]{32}$/i.test(policyIdentifier);
    
    if (!isPolicyHexGuid) {
      // Try to parse as numeric ID
      const policyId = parseInt(policyIdentifier);
      if (isNaN(policyId) || policyId <= 0) {
        return sendBadRequest(res, req, 'Invalid policy_id format (must be numeric or 32-character hex GUID)');
      }
    }

    // Check if eligibility_id is a hex GUID (32 hex characters) or numeric ID
    const isEligibilityHexGuid = /^[0-9A-F]{32}$/i.test(eligibilityIdentifier);
    
    if (!isEligibilityHexGuid) {
      // Try to parse as numeric ID
      const eligibilityId = parseInt(eligibilityIdentifier);
      if (isNaN(eligibilityId) || eligibilityId <= 0) {
        return sendBadRequest(res, req, 'Invalid eligibility_id format (must be numeric or 32-character hex GUID)');
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
    const errors = validateEligibilityData(normalizedBody, true);

    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Normalize probation_allowed to uppercase if provided
    if (normalizedBody.PROBATION_ALLOWED) {
      normalizedBody.PROBATION_ALLOWED = normalizedBody.PROBATION_ALLOWED.toUpperCase();
    }

    // Convert min_service_years to number if provided
    if (normalizedBody.MIN_SERVICE_YEARS !== undefined) {
      if (normalizedBody.MIN_SERVICE_YEARS !== null) {
        normalizedBody.MIN_SERVICE_YEARS = parseFloat(normalizedBody.MIN_SERVICE_YEARS);
        if (isNaN(normalizedBody.MIN_SERVICE_YEARS) || normalizedBody.MIN_SERVICE_YEARS < 0) {
          return sendBadRequest(res, req, 'min_service_years must be a valid number >= 0');
        }
      }
    }

    const userId = getUserId(req);
    const updatedEligibility = await AbsLeavePolicyEligibilityModel.update(
      policyIdentifier, 
      eligibilityIdentifier, 
      tenantIdNum, 
      normalizedBody, 
      userId
    );
    sendUpdated(res, req, updatedEligibility);
  } catch (error) {
    if (error.code === 'NOT_FOUND' && error.statusCode === 404) {
      return sendNotFound(res, req, error.message);
    }
    if (error.code === 'VALIDATION_ERROR' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to update eligibility rule', error);
  }
});

/**
 * @route   DELETE /api/abs/leave-policies/:policy_id/eligibility/:eligibility_id
 * @desc    Delete eligibility rule
 * @param   policy_id - Policy ID (numeric) or Policy GUID (32-char hex string)
 * @param   eligibility_id - Eligibility ID (numeric) or Eligibility GUID (32-char hex string)
 * @query   tenant_id - Required tenant ID
 * @access  Public
 */
router.delete('/:eligibility_id', async (req, res) => {
  try {
    const policyIdentifier = req.params.policy_id.trim();
    const eligibilityIdentifier = req.params.eligibility_id.trim();
    
    // Check if policy_id is a hex GUID (32 hex characters) or numeric ID
    const isPolicyHexGuid = /^[0-9A-F]{32}$/i.test(policyIdentifier);
    
    if (!isPolicyHexGuid) {
      // Try to parse as numeric ID
      const policyId = parseInt(policyIdentifier);
      if (isNaN(policyId) || policyId <= 0) {
        return sendBadRequest(res, req, 'Invalid policy_id format (must be numeric or 32-character hex GUID)');
      }
    }

    // Check if eligibility_id is a hex GUID (32 hex characters) or numeric ID
    const isEligibilityHexGuid = /^[0-9A-F]{32}$/i.test(eligibilityIdentifier);
    
    if (!isEligibilityHexGuid) {
      // Try to parse as numeric ID
      const eligibilityId = parseInt(eligibilityIdentifier);
      if (isNaN(eligibilityId) || eligibilityId <= 0) {
        return sendBadRequest(res, req, 'Invalid eligibility_id format (must be numeric or 32-character hex GUID)');
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

    await AbsLeavePolicyEligibilityModel.delete(policyIdentifier, eligibilityIdentifier, tenantIdNum);
    sendDeleted(res, req, 'Eligibility rule deleted successfully', eligibilityIdentifier);
  } catch (error) {
    if (error.code === 'NOT_FOUND' && error.statusCode === 404) {
      return sendNotFound(res, req, error.message);
    }
    if (error.code === 'VALIDATION_ERROR' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to delete eligibility rule', error);
  }
});

export default router;
