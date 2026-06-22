/**
 * Payroll Element Entries API.
 * OpenAPI: docs/pay_element_entries_api.openapi.yaml
 */
import '../swagger/payElementEntries.swagger.js';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { DatabaseError, ValidationError } from '../../../../utils/errors/index.js';
import { getActingUsername } from '../../../../utils/userContext.js';
import {
  createElementEntry,
  deleteElementEntry,
  getElementEntryByGuid,
  listElementEntries,
  updateElementEntry
} from '../services/payElementEntries.service.js';
import {
  parseElementEntryGuidParam,
  validateCreateElementEntryBody,
  validateListElementEntriesQuery,
  validateUpdateElementEntryBody
} from '../validations/payElementEntries.validation.js';

const ROUTE_TAG = 'payElementEntries';
const FALLBACK_ERROR = 'Unable to process element entry. Please try again.';

function resolveAuditActor(req) {
  return getActingUsername(req) ?? 'SYSTEM';
}

function firstValidationMessage(err) {
  const details = Array.isArray(err?.errors) ? err.errors.filter(Boolean) : [];
  return details[0] || err?.message || 'Validation failed';
}

function sendValidationError(res, err) {
  return res.status(400).json({
    success: false,
    message: firstValidationMessage(err)
  });
}

function sendSystemError(res, err) {
  if (err instanceof DatabaseError) {
    return res.status(500).json({
      success: false,
      message: err.userMessage || FALLBACK_ERROR
    });
  }
  return res.status(500).json({
    success: false,
    message: FALLBACK_ERROR
  });
}

function logAudit(action, req, extra = {}) {
  const user = req.user?.username ?? 'SYSTEM';
  console.info(`[${ROUTE_TAG}]`, JSON.stringify({ action, user, ...extra }));
}

/**
 * GET /api/pay/element-entries
 */
export const getElementEntriesList = asyncHandler(async (req, res) => {
  try {
    const filters = validateListElementEntriesQuery(req.query || {});
    const { data, pagination } = await listElementEntries(filters);

    logAudit('list', req, {
      enterprise_id: filters.enterprise_id,
      returned: Array.isArray(data) ? data.length : 0,
      total: pagination.total
    });

    return res.status(200).json({
      success: true,
      data: data ?? [],
      pagination
    });
  } catch (err) {
    if (err instanceof ValidationError) {
      return sendValidationError(res, err);
    }
    return sendSystemError(res, err);
  }
});

/**
 * GET /api/pay/element-entries/:guid
 */
export const getElementEntry = asyncHandler(async (req, res) => {
  try {
    const elementEntryGuid = parseElementEntryGuidParam(req.params.guid);
    const data = await getElementEntryByGuid(elementEntryGuid);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: 'Element entry not found'
      });
    }

    logAudit('get', req, { element_entry_guid: elementEntryGuid });

    return res.status(200).json({
      success: true,
      data
    });
  } catch (err) {
    if (err instanceof ValidationError) {
      return sendValidationError(res, err);
    }
    return sendSystemError(res, err);
  }
});

/**
 * POST /api/pay/element-entries
 */
export const postElementEntry = asyncHandler(async (req, res) => {
  try {
    const validated = validateCreateElementEntryBody(req.body || {});
    const createdBy = resolveAuditActor(req);
    const outcome = await createElementEntry(validated, createdBy);

    logAudit('create', req, { status: outcome.success ? 'SUCCESS' : 'ERROR' });

    const payload = {
      success: outcome.success,
      message: outcome.message
    };
    if (outcome.data) payload.data = outcome.data;

    return res.status(outcome.httpStatus).json(payload);
  } catch (err) {
    if (err instanceof ValidationError) {
      return sendValidationError(res, err);
    }
    return sendSystemError(res, err);
  }
});

/**
 * PUT /api/pay/element-entries/:guid
 */
export const putElementEntry = asyncHandler(async (req, res) => {
  try {
    const elementEntryGuid = parseElementEntryGuidParam(req.params.guid);
    const validated = validateUpdateElementEntryBody(req.body || {});
    const updatedBy = resolveAuditActor(req);
    const outcome = await updateElementEntry(elementEntryGuid, validated, updatedBy);

    logAudit('update', req, { element_entry_guid: elementEntryGuid, status: outcome.success ? 'SUCCESS' : 'ERROR' });

    return res.status(outcome.httpStatus).json({
      success: outcome.success,
      message: outcome.message
    });
  } catch (err) {
    if (err instanceof ValidationError) {
      return sendValidationError(res, err);
    }
    return sendSystemError(res, err);
  }
});

/**
 * DELETE /api/pay/element-entries/:guid
 */
export const deleteElementEntryHandler = asyncHandler(async (req, res) => {
  try {
    const elementEntryGuid = parseElementEntryGuidParam(req.params.guid);
    const deletedBy = resolveAuditActor(req);
    const outcome = await deleteElementEntry(elementEntryGuid, deletedBy);

    logAudit('delete', req, { element_entry_guid: elementEntryGuid, status: outcome.success ? 'SUCCESS' : 'ERROR' });

    return res.status(outcome.httpStatus).json({
      success: outcome.success,
      message: outcome.message
    });
  } catch (err) {
    if (err instanceof ValidationError) {
      return sendValidationError(res, err);
    }
    return sendSystemError(res, err);
  }
});

/*
  ========== Postman collection examples ==========

  Base URL: {{baseUrl}}/api/pay/element-entries
  Authorization: Bearer {{jwt}}

  --- Create element entry ---
  POST {{baseUrl}}/api/pay/element-entries
  Content-Type: application/json

  {
    "enterprise_id": 1,
    "employee_id": 1001,
    "payroll_id": 4,
    "component_id": 10,
    "element_classification_code": "STANDARD_EARNING",
    "effective_as_of_date": "2026-06-21",
    "effective_start_date": "2026-06-01",
    "effective_end_date": null,
    "entry_type_code": "ELEMENT_ENTRY",
    "source_code": "MANUAL_ENTRY",
    "element_processing_type_code": "RECURRING",
    "subpriority": 1,
    "creator_type_code": "USER",
    "processed_flag": "N",
    "retroactive_flag": "N",
    "automatic_entry_flag": "N",
    "sequence_number": 1,
    "reason_text": "Monthly salary",
    "pay_value": 500,
    "amount": 500,
    "currency_code": "KWD",
    "cost_allocation_keyflex_id": "CC-HR-KWT",
    "costing_type_code": "COSTED",
    "account_code": "5000-100-100",
    "cost_center_code": "HR",
    "context_segment_code": "BUSINESS_UNIT",
    "context_value": "KUWAIT",
    "approval_status_code": "DRAFT",
    "comments": "Created manually",
    "source_reference": null,
    "batch_id": null
  }

  --- Update element entry (partial) ---
  PUT {{baseUrl}}/api/pay/element-entries/{{element_entry_guid}}
  Content-Type: application/json

  {
    "pay_value": 600,
    "amount": 600,
    "currency_code": "KWD",
    "comments": "Updated housing allowance amount",
    "effective_end_date": "2026-12-31"
  }

  --- Delete element entry ---
  DELETE {{baseUrl}}/api/pay/element-entries/{{element_entry_guid}}
*/
