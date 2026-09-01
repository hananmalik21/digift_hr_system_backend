/**
 * Overtime Config with Limits API
 * Base path: /api/tm/overtime/configs
 *
 * - POST   /  — create TM_OT_CONFIGS + TM_OT_LABOR_LIMITS (single transaction)
 * - PUT    /  — update config + upsert labor limits (single transaction)
 * - DELETE /  — delete config + labor limits (cascade via package)
 *
 * All operations scoped by enterprise_id; tenant safety enforced.
 */

import express from 'express';
import {
  createConfigWithLimits,
  updateConfigWithLimits,
  deleteConfigWithLimits
} from '../model/overtimeConfigModel.js';
import { getOvertimeConfiguration } from '../model/overtimeConfigurationModel.js';
import { sendCreated, sendUpdated } from '@digifyhr/common';
import { ValidationError, ConflictError, DatabaseError } from '../../../../utils/errors/index.js';
import { asyncHandler } from '@digifyhr/common';
import { optNum, optStr, parseReturnFullConfig } from '../../../../utils/overtimeHelpers.js';

const router = express.Router();

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate create-with-limits body: enterprise_id, config_name, effective_start_date, actor */
function validateCreateBody(body) {
  const errors = [];
  if (body.enterprise_id == null || body.enterprise_id === '') {
    errors.push('enterprise_id is required');
  } else if (!Number.isFinite(Number(body.enterprise_id)) || Number(body.enterprise_id) <= 0) {
    errors.push('enterprise_id must be a valid positive number');
  }
  if (optStr(body.config_name) == null) {
    errors.push('config_name is required');
  }
  if (body.effective_start_date == null || body.effective_start_date === '') {
    errors.push('effective_start_date is required');
  } else if (!ISO_DATE.test(String(body.effective_start_date).trim())) {
    errors.push('effective_start_date must be YYYY-MM-DD');
  }
  const actor = optStr(body.actor ?? body.created_by ?? body.updated_by);
  if (!actor) {
    errors.push('actor is required (body.actor, created_by, or updated_by)');
  }
  return errors;
}

/** Validate update-with-limits body: enterprise_id, ot_config_id, actor */
function validateUpdateBody(body) {
  const errors = [];
  if (body.enterprise_id == null || body.enterprise_id === '') {
    errors.push('enterprise_id is required');
  } else if (!Number.isFinite(Number(body.enterprise_id)) || Number(body.enterprise_id) <= 0) {
    errors.push('enterprise_id must be a valid positive number');
  }
  if (body.ot_config_id == null && body.otConfigId == null) {
    errors.push('ot_config_id is required');
  } else if (optNum(body.ot_config_id ?? body.otConfigId) == null || optNum(body.ot_config_id ?? body.otConfigId) <= 0) {
    errors.push('ot_config_id must be a valid positive number');
  }
  const actor = optStr(body.actor ?? body.updated_by ?? body.last_updated_by);
  if (!actor) {
    errors.push('actor is required (body.actor or updated_by)');
  }
  return errors;
}

/** Validate delete-with-limits: enterprise_id and ot_config_id (from body or query) */
function validateDeletePayload(payload) {
  const errors = [];
  if (payload.enterprise_id == null || payload.enterprise_id === '') {
    errors.push('enterprise_id is required (body or query)');
  } else if (!Number.isFinite(Number(payload.enterprise_id)) || Number(payload.enterprise_id) <= 0) {
    errors.push('enterprise_id must be a valid positive number');
  }
  if (payload.ot_config_id == null && payload.otConfigId == null) {
    errors.push('ot_config_id is required (body or query)');
  } else if (optNum(payload.ot_config_id ?? payload.otConfigId) == null || optNum(payload.ot_config_id ?? payload.otConfigId) <= 0) {
    errors.push('ot_config_id must be a valid positive number');
  }
  return errors;
}

// -----------------------------------------------------------------------------
// POST /api/tm/overtime/configs
// -----------------------------------------------------------------------------
router.post('/', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const errors = validateCreateBody(body);
  if (errors.length > 0) throw new ValidationError('Validation failed', errors);

  try {
    const result = await createConfigWithLimits(body);
    const enterpriseId = optNum(body.enterprise_id);
    const data = parseReturnFullConfig(req.query)
      ? await getOvertimeConfiguration(enterpriseId)
      : { ot_config_id: result.ot_config_id, ot_labor_limit_id: result.ot_labor_limit_id };
    sendCreated(res, {
      message: 'Overtime config with limits created successfully',
      data
    });
  } catch (err) {
    if (err instanceof ConflictError) {
      return res.status(409).json({
        status: false,
        message: err.message,
        errorCode: 'ENTERPRISE_ALREADY_HAS_LABOR_LIMITS'
      });
    }
    throw err;
  }
}));

// -----------------------------------------------------------------------------
// PUT /api/tm/overtime/configs
// -----------------------------------------------------------------------------
router.put('/', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const errors = validateUpdateBody(body);
  if (errors.length > 0) throw new ValidationError('Validation failed', errors);

  const payload = {
    ...body,
    ot_config_id: body.ot_config_id ?? body.otConfigId,
    enterprise_id: body.enterprise_id,
    actor: body.actor ?? body.updated_by ?? body.last_updated_by
  };

  try {
    const result = await updateConfigWithLimits(payload);
    const enterpriseId = optNum(payload.enterprise_id);
    const data = parseReturnFullConfig(req.query)
      ? await getOvertimeConfiguration(enterpriseId)
      : { ot_config_id: result.ot_config_id, ot_labor_limit_id: result.ot_labor_limit_id };
    sendUpdated(res, {
      message: 'Overtime config with limits updated successfully',
      data
    });
  } catch (err) {
    if (err instanceof DatabaseError && (err.errorNum === 1 || (err.message || '').includes('ORA-00001'))) {
      return res.status(409).json({
        status: false,
        message: 'Uniqueness constraint violated. Another record with the same key may already exist.',
        errorCode: 'UNIQUE_CONSTRAINT_VIOLATION'
      });
    }
    throw err;
  }
}));

// -----------------------------------------------------------------------------
// DELETE /api/tm/overtime/configs (enterprise_id and ot_config_id in body or query)
// -----------------------------------------------------------------------------
router.delete('/', asyncHandler(async (req, res) => {
  const query = req.query || {};
  const body = req.body || {};
  const payload = {
    enterprise_id: body.enterprise_id ?? query.enterprise_id,
    ot_config_id: body.ot_config_id ?? body.otConfigId ?? query.ot_config_id ?? query.otConfigId
  };
  const errors = validateDeletePayload(payload);
  if (errors.length > 0) throw new ValidationError('Validation failed', errors);

  const enterpriseId = payload.enterprise_id;
  const otConfigId = payload.ot_config_id ?? payload.otConfigId;

  await deleteConfigWithLimits(enterpriseId, otConfigId);
  res.status(200).json({ status: true, message: 'Overtime config with limits deleted successfully' });
}));

export default router;
