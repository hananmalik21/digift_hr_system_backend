import express from 'express';
import AbsLeavePolicyRulesModel from '../model/absLeavePolicyRulesModel.js';
import {
  sendRulesList,
  sendRules,
  sendCreated,
  sendUpdated,
  sendBadRequest,
  sendServerError,
  sendNotFound,
  sendConflict
} from '../view/absLeavePolicyRulesView.js';

const router = express.Router({ mergeParams: true }); // mergeParams to access :policy_id from parent route

// Middleware to track request start time for execution time calculation
router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

/**
 * Validation helper
 */
function validateRulesData(data, isUpdate = false) {
  const errors = [];

  if (!isUpdate) {
    // For creation, all fields are optional but validate if provided
  }

  // Validate min_notice_days
  if (data.min_notice_days !== undefined || data.MIN_NOTICE_DAYS !== undefined) {
    const minNoticeDays = data.min_notice_days !== undefined ? data.min_notice_days : data.MIN_NOTICE_DAYS;
    if (minNoticeDays !== null && (isNaN(minNoticeDays) || minNoticeDays < 0)) {
      errors.push('min_notice_days must be a valid number >= 0');
    }
  }

  // Validate max_consecutive_days
  if (data.max_consecutive_days !== undefined || data.MAX_CONSECUTIVE_DAYS !== undefined) {
    const maxConsecutiveDays = data.max_consecutive_days !== undefined ? data.max_consecutive_days : data.MAX_CONSECUTIVE_DAYS;
    if (maxConsecutiveDays !== null && (isNaN(maxConsecutiveDays) || maxConsecutiveDays < 1)) {
      errors.push('max_consecutive_days must be a valid number >= 1');
    }
  }

  // Validate requires_document
  if (data.requires_document !== undefined || data.REQUIRES_DOCUMENT !== undefined) {
    const requiresDocument = (data.requires_document || data.REQUIRES_DOCUMENT || '').toUpperCase();
    if (requiresDocument !== '' && requiresDocument !== 'Y' && requiresDocument !== 'N') {
      errors.push('requires_document must be Y or N');
    }
  }

  // Validate allow_carry_forward
  if (data.allow_carry_forward !== undefined || data.ALLOW_CARRY_FORWARD !== undefined) {
    const allowCarryForward = (data.allow_carry_forward || data.ALLOW_CARRY_FORWARD || '').toUpperCase();
    if (allowCarryForward !== '' && allowCarryForward !== 'Y' && allowCarryForward !== 'N') {
      errors.push('allow_carry_forward must be Y or N');
    }
  }

  // Validate allow_encashment
  if (data.allow_encashment !== undefined || data.ALLOW_ENCASHMENT !== undefined) {
    const allowEncashment = (data.allow_encashment || data.ALLOW_ENCASHMENT || '').toUpperCase();
    if (allowEncashment !== '' && allowEncashment !== 'Y' && allowEncashment !== 'N') {
      errors.push('allow_encashment must be Y or N');
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
    'min_notice_days': 'MIN_NOTICE_DAYS',
    'max_consecutive_days': 'MAX_CONSECUTIVE_DAYS',
    'requires_document': 'REQUIRES_DOCUMENT',
    'allow_carry_forward': 'ALLOW_CARRY_FORWARD',
    'allow_encashment': 'ALLOW_ENCASHMENT'
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
 * @route   GET /api/abs/leave-policies/:policy_id/rules
 * @desc    Get leave policy rules for a policy
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

    const rules = await AbsLeavePolicyRulesModel.findAll(policyIdentifier, tenantIdNum);
    sendRulesList(res, req, rules, { 
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
    sendServerError(res, req, 'Failed to fetch leave policy rules', error);
  }
});

/**
 * @route   POST /api/abs/leave-policies/:policy_id/rules
 * @desc    Create leave policy rule for a policy
 * @param   policy_id - Policy ID (numeric) or Policy GUID (32-char hex string)
 * @query   tenant_id - Required tenant ID
 * @body    { min_notice_days?, max_consecutive_days?, requires_document?, allow_carry_forward?, allow_encashment? }
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
    const errors = validateRulesData(normalizedBody, false);

    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Normalize Y/N fields to uppercase if provided
    if (normalizedBody.REQUIRES_DOCUMENT) {
      normalizedBody.REQUIRES_DOCUMENT = normalizedBody.REQUIRES_DOCUMENT.toUpperCase();
    }
    if (normalizedBody.ALLOW_CARRY_FORWARD) {
      normalizedBody.ALLOW_CARRY_FORWARD = normalizedBody.ALLOW_CARRY_FORWARD.toUpperCase();
    }
    if (normalizedBody.ALLOW_ENCASHMENT) {
      normalizedBody.ALLOW_ENCASHMENT = normalizedBody.ALLOW_ENCASHMENT.toUpperCase();
    }

    // Convert numeric fields to numbers if provided
    if (normalizedBody.MIN_NOTICE_DAYS !== undefined) {
      if (normalizedBody.MIN_NOTICE_DAYS !== null) {
        normalizedBody.MIN_NOTICE_DAYS = parseFloat(normalizedBody.MIN_NOTICE_DAYS);
        if (isNaN(normalizedBody.MIN_NOTICE_DAYS) || normalizedBody.MIN_NOTICE_DAYS < 0) {
          return sendBadRequest(res, req, 'min_notice_days must be a valid number >= 0');
        }
      }
    }

    if (normalizedBody.MAX_CONSECUTIVE_DAYS !== undefined) {
      if (normalizedBody.MAX_CONSECUTIVE_DAYS !== null) {
        normalizedBody.MAX_CONSECUTIVE_DAYS = parseFloat(normalizedBody.MAX_CONSECUTIVE_DAYS);
        if (isNaN(normalizedBody.MAX_CONSECUTIVE_DAYS) || normalizedBody.MAX_CONSECUTIVE_DAYS < 1) {
          return sendBadRequest(res, req, 'max_consecutive_days must be a valid number >= 1');
        }
      }
    }

    const userId = getUserId(req);
    const newRule = await AbsLeavePolicyRulesModel.create(policyIdentifier, tenantIdNum, normalizedBody, userId);
    sendCreated(res, req, newRule);
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
    sendServerError(res, req, 'Failed to create leave policy rule', error);
  }
});

/**
 * @route   PUT /api/abs/leave-policies/:policy_id/rules/:rule_id
 * @desc    Update leave policy rule
 * @param   policy_id - Policy ID (numeric) or Policy GUID (32-char hex string)
 * @param   rule_id - Rule ID (numeric) or Rule GUID (32-char hex string)
 * @query   tenant_id - Required tenant ID
 * @body    { min_notice_days?, max_consecutive_days?, requires_document?, allow_carry_forward?, allow_encashment? }
 * @access  Public
 */
router.put('/:rule_id', async (req, res) => {
  try {
    const policyIdentifier = req.params.policy_id.trim();
    const ruleIdentifier = req.params.rule_id.trim();
    
    // Check if policy_id is a hex GUID (32 hex characters) or numeric ID
    const isPolicyHexGuid = /^[0-9A-F]{32}$/i.test(policyIdentifier);
    
    if (!isPolicyHexGuid) {
      // Try to parse as numeric ID
      const policyId = parseInt(policyIdentifier);
      if (isNaN(policyId) || policyId <= 0) {
        return sendBadRequest(res, req, 'Invalid policy_id format (must be numeric or 32-character hex GUID)');
      }
    }

    // Check if rule_id is a hex GUID (32 hex characters) or numeric ID
    const isRuleHexGuid = /^[0-9A-F]{32}$/i.test(ruleIdentifier);
    
    if (!isRuleHexGuid) {
      // Try to parse as numeric ID
      const ruleId = parseInt(ruleIdentifier);
      if (isNaN(ruleId) || ruleId <= 0) {
        return sendBadRequest(res, req, 'Invalid rule_id format (must be numeric or 32-character hex GUID)');
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
    const errors = validateRulesData(normalizedBody, true);

    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Normalize Y/N fields to uppercase if provided
    if (normalizedBody.REQUIRES_DOCUMENT) {
      normalizedBody.REQUIRES_DOCUMENT = normalizedBody.REQUIRES_DOCUMENT.toUpperCase();
    }
    if (normalizedBody.ALLOW_CARRY_FORWARD) {
      normalizedBody.ALLOW_CARRY_FORWARD = normalizedBody.ALLOW_CARRY_FORWARD.toUpperCase();
    }
    if (normalizedBody.ALLOW_ENCASHMENT) {
      normalizedBody.ALLOW_ENCASHMENT = normalizedBody.ALLOW_ENCASHMENT.toUpperCase();
    }

    // Convert numeric fields to numbers if provided
    if (normalizedBody.MIN_NOTICE_DAYS !== undefined) {
      if (normalizedBody.MIN_NOTICE_DAYS !== null) {
        normalizedBody.MIN_NOTICE_DAYS = parseFloat(normalizedBody.MIN_NOTICE_DAYS);
        if (isNaN(normalizedBody.MIN_NOTICE_DAYS) || normalizedBody.MIN_NOTICE_DAYS < 0) {
          return sendBadRequest(res, req, 'min_notice_days must be a valid number >= 0');
        }
      }
    }

    if (normalizedBody.MAX_CONSECUTIVE_DAYS !== undefined) {
      if (normalizedBody.MAX_CONSECUTIVE_DAYS !== null) {
        normalizedBody.MAX_CONSECUTIVE_DAYS = parseFloat(normalizedBody.MAX_CONSECUTIVE_DAYS);
        if (isNaN(normalizedBody.MAX_CONSECUTIVE_DAYS) || normalizedBody.MAX_CONSECUTIVE_DAYS < 1) {
          return sendBadRequest(res, req, 'max_consecutive_days must be a valid number >= 1');
        }
      }
    }

    const userId = getUserId(req);
    const updatedRule = await AbsLeavePolicyRulesModel.update(
      policyIdentifier, 
      ruleIdentifier, 
      tenantIdNum, 
      normalizedBody, 
      userId
    );
    sendUpdated(res, req, updatedRule);
  } catch (error) {
    if (error.code === 'NOT_FOUND' && error.statusCode === 404) {
      return sendNotFound(res, req, error.message);
    }
    if (error.code === 'VALIDATION_ERROR' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to update leave policy rule', error);
  }
});

export default router;
