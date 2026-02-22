/**
 * Overtime Rate Type + Multiplier API
 * Base path: /api/tm/overtime/rate-types
 *
 * - POST   /  — create rate type + multiplier (single transaction)
 * - PUT    /  — update rate type + upsert multiplier (single transaction)
 * - DELETE /  — delete rate type and multipliers
 *
 * All operations scoped by enterprise_id; tenant safety enforced.
 */

import express from 'express';
import {
  createRateTypeWithMultiplier,
  updateRateTypeWithMultiplier,
  deleteRateTypeWithMultipliers
} from '../model/overtimeRateTypeModel.js';
import { getOvertimeConfiguration } from '../../tm_overtime_configuration/model/overtimeConfigurationModel.js';
import { sendCreated, sendUpdated } from '../../../utils/response.js';
import { ValidationError, ConflictError, DatabaseError } from '../../../utils/errors/index.js';
import { asyncHandler } from '../../../middleware/asyncHandler.js';
import { optNum, optStr, parseReturnFullConfig } from '../../../utils/overtimeHelpers.js';

const router = express.Router();

/** Validate create: enterprise_id, rate_code, rate_name, ot_config_id, multiplier, actor; multiplier > 0; priority_no >= 1 */
function validateCreateBody(body) {
  const errors = [];
  if (body.enterprise_id == null || body.enterprise_id === '') {
    errors.push('enterprise_id is required');
  } else if (!Number.isFinite(Number(body.enterprise_id)) || Number(body.enterprise_id) <= 0) {
    errors.push('enterprise_id must be a valid positive number');
  }
  if (optStr(body.rate_code) == null) errors.push('rate_code is required');
  if (optStr(body.rate_name) == null) errors.push('rate_name is required');
  if (body.ot_config_id == null && body.otConfigId == null) {
    errors.push('ot_config_id is required');
  } else if (optNum(body.ot_config_id ?? body.otConfigId) == null || optNum(body.ot_config_id ?? body.otConfigId) <= 0) {
    errors.push('ot_config_id must be a valid positive number');
  }
  const mult = optNum(body.multiplier);
  if (mult == null) {
    errors.push('multiplier is required');
  } else if (mult <= 0) {
    errors.push('multiplier must be greater than 0');
  }
  const priorityNo = optNum(body.priority_no ?? body.priorityNo);
  if (priorityNo != null && priorityNo < 1) {
    errors.push('priority_no must be >= 1 when provided');
  }
  const actor = optStr(body.actor ?? body.created_by ?? body.updated_by);
  if (!actor) errors.push('actor is required (body.actor, created_by, or updated_by)');
  return errors;
}

/** Validate update: enterprise_id, ot_rate_type_id, ot_rate_multiplier_id, ot_config_id, actor */
function validateUpdateBody(body) {
  const errors = [];
  if (body.enterprise_id == null || body.enterprise_id === '') {
    errors.push('enterprise_id is required');
  } else if (!Number.isFinite(Number(body.enterprise_id)) || Number(body.enterprise_id) <= 0) {
    errors.push('enterprise_id must be a valid positive number');
  }
  if (body.ot_rate_type_id == null && body.otRateTypeId == null) {
    errors.push('ot_rate_type_id is required');
  } else if (optNum(body.ot_rate_type_id ?? body.otRateTypeId) == null || optNum(body.ot_rate_type_id ?? body.otRateTypeId) <= 0) {
    errors.push('ot_rate_type_id must be a valid positive number');
  }
  if (body.ot_rate_multiplier_id == null && body.otRateMultiplierId == null) {
    errors.push('ot_rate_multiplier_id is required');
  } else if (optNum(body.ot_rate_multiplier_id ?? body.otRateMultiplierId) == null || optNum(body.ot_rate_multiplier_id ?? body.otRateMultiplierId) <= 0) {
    errors.push('ot_rate_multiplier_id must be a valid positive number');
  }
  if (body.ot_config_id == null && body.otConfigId == null) {
    errors.push('ot_config_id is required');
  } else if (optNum(body.ot_config_id ?? body.otConfigId) == null || optNum(body.ot_config_id ?? body.otConfigId) <= 0) {
    errors.push('ot_config_id must be a valid positive number');
  }
  const actor = optStr(body.actor ?? body.updated_by ?? body.last_updated_by);
  if (!actor) errors.push('actor is required (body.actor or updated_by)');
  const mult = optNum(body.multiplier);
  if (mult != null && mult <= 0) errors.push('multiplier must be greater than 0');
  const priorityNo = optNum(body.priority_no ?? body.priorityNo);
  if (priorityNo != null && priorityNo < 1) errors.push('priority_no must be >= 1');
  return errors;
}

/** Validate delete: enterprise_id, ot_rate_type_id (body or query) */
function validateDeletePayload(payload) {
  const errors = [];
  if (payload.enterprise_id == null || payload.enterprise_id === '') {
    errors.push('enterprise_id is required (body or query)');
  } else if (!Number.isFinite(Number(payload.enterprise_id)) || Number(payload.enterprise_id) <= 0) {
    errors.push('enterprise_id must be a valid positive number');
  }
  if (payload.ot_rate_type_id == null && payload.otRateTypeId == null) {
    errors.push('ot_rate_type_id is required (body or query)');
  } else if (optNum(payload.ot_rate_type_id ?? payload.otRateTypeId) == null || optNum(payload.ot_rate_type_id ?? payload.otRateTypeId) <= 0) {
    errors.push('ot_rate_type_id must be a valid positive number');
  }
  return errors;
}

// -----------------------------------------------------------------------------
// POST /api/tm/overtime/rate-types
// -----------------------------------------------------------------------------
router.post('/', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const errors = validateCreateBody(body);
  if (errors.length > 0) throw new ValidationError('Validation failed', errors);

  try {
    const result = await createRateTypeWithMultiplier(body);
    const enterpriseId = optNum(body.enterprise_id);
    const data = parseReturnFullConfig(req.query)
      ? await getOvertimeConfiguration(enterpriseId)
      : { ot_rate_type_id: result.ot_rate_type_id, ot_rate_multiplier_id: result.ot_rate_multiplier_id };
    sendCreated(res, {
      message: 'Rate type with multiplier created successfully',
      data
    });
  } catch (err) {
    if (err instanceof ConflictError) {
      return res.status(409).json({
        status: false,
        message: err.message,
        errorCode: 'CONFLICT'
      });
    }
    if (err instanceof DatabaseError && (err.errorNum === 1 || (err.message || '').includes('ORA-00001'))) {
      return res.status(409).json({
        status: false,
        message: err.message || 'Duplicate rate type or multiplier.',
        errorCode: 'UNIQUE_CONSTRAINT_VIOLATION'
      });
    }
    if (err instanceof DatabaseError && (err.errorNum === 2291 || (err.message || '').includes('ORA-02291'))) {
      return res.status(400).json({
        status: false,
        message: err.message || 'Invalid ot_config_id. Parent config not found.',
        errorCode: 'FOREIGN_KEY_VIOLATION'
      });
    }
    throw err;
  }
}));

// -----------------------------------------------------------------------------
// PUT /api/tm/overtime/rate-types
// -----------------------------------------------------------------------------
router.put('/', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const errors = validateUpdateBody(body);
  if (errors.length > 0) throw new ValidationError('Validation failed', errors);

  const payload = {
    ...body,
    enterprise_id: body.enterprise_id,
    ot_rate_type_id: body.ot_rate_type_id ?? body.otRateTypeId,
    ot_rate_multiplier_id: body.ot_rate_multiplier_id ?? body.otRateMultiplierId,
    actor: body.actor ?? body.updated_by ?? body.last_updated_by
  };

  try {
    const result = await updateRateTypeWithMultiplier(payload);
    const enterpriseId = optNum(payload.enterprise_id);
    const data = parseReturnFullConfig(req.query)
      ? await getOvertimeConfiguration(enterpriseId)
      : { ot_rate_type_id: result.ot_rate_type_id, ot_rate_multiplier_id: result.ot_rate_multiplier_id };
    sendUpdated(res, {
      message: 'Rate type with multiplier updated successfully',
      data
    });
  } catch (err) {
    if (err instanceof DatabaseError && (err.errorNum === 1 || (err.message || '').includes('ORA-00001'))) {
      return res.status(409).json({
        status: false,
        message: 'Uniqueness constraint violated.',
        errorCode: 'UNIQUE_CONSTRAINT_VIOLATION'
      });
    }
    throw err;
  }
}));

// -----------------------------------------------------------------------------
// DELETE /api/tm/overtime/rate-types
// -----------------------------------------------------------------------------
router.delete('/', asyncHandler(async (req, res) => {
  const query = req.query || {};
  const body = req.body || {};
  const payload = {
    enterprise_id: body.enterprise_id ?? query.enterprise_id,
    ot_rate_type_id: body.ot_rate_type_id ?? body.otRateTypeId ?? query.ot_rate_type_id ?? query.otRateTypeId
  };
  const errors = validateDeletePayload(payload);
  if (errors.length > 0) throw new ValidationError('Validation failed', errors);

  const enterpriseId = payload.enterprise_id;
  const otRateTypeId = payload.ot_rate_type_id ?? payload.otRateTypeId;

  await deleteRateTypeWithMultipliers(enterpriseId, otRateTypeId);
  res.status(200).json({ status: true, message: 'Rate type with multipliers deleted successfully' });
}));

export default router;
