import {
  createRequest,
  updateDraft,
  submitRequest,
  approveRequest,
  rejectRequest,
  cancelRequest,
  getOneRequest,
  listRequests,
  listOvertimeRequestsForExport,
} from '../services/tmOvertimeRequests.service.js';
import { buildOvertimeRequestsExcelBuffer } from '../services/overtimeRequestExportService.js';
import { sendExcelExport } from '../../utils/excel/index.js';
import {
  createSchema,
  updateDraftSchema,
  actionSchema,
  guidParamSchema,
  getOneQuerySchema,
  listQuerySchema,
} from '../validators/tmOvertimeRequests.schemas.js';
import { sendSuccess, sendCreated, sendList } from '../../utils/response.js';
import { ValidationError } from '../../utils/errors/index.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import {
  requireActingUserId,
  logSecuredAccess,
  handleSecuredQueryError,
  employeeAccessOptionsFromReq
} from '../../utils/userContext.js';

const ROUTE_TAG_LIST = 'GET /api/tm/overtime/requests';
const ROUTE_TAG_EXPORT = 'GET /api/tm/overtime/requests/export';

function parseBody(req) {
  const body = req.body || {};
  if (body.tenant_id !== undefined) body.tenant_id = Number(body.tenant_id);
  if (body.attendance_day_id !== undefined) body.attendance_day_id = Number(body.attendance_day_id);
  if (body.requested_hours !== undefined) body.requested_hours = Number(body.requested_hours);
  if (body.ot_config_id !== undefined) body.ot_config_id = body.ot_config_id != null ? Number(body.ot_config_id) : null;
  if (body.ot_rate_type_id !== undefined) body.ot_rate_type_id = body.ot_rate_type_id != null ? Number(body.ot_rate_type_id) : null;
  return body;
}

function validate(schema, data) {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const messages = parsed.error.errors.map((e) => e.path.join('.') + ': ' + e.message);
    throw new ValidationError('Validation failed', messages);
  }
  return parsed.data;
}

/** GET /api/tm/overtime/requests - list (query: tenant_id required; status?, date_from?, date_to?, search?, org_unit_id?, level_code?, page?, page_size?) */
export const list = asyncHandler(async (req, res) => {
  // FNDSEC: acting user_id comes strictly from the verified JWT. Query/header
  // user_id values are ignored for data access to prevent impersonation.
  const actingUserId = requireActingUserId(req, res);
  if (actingUserId == null) return; // 401 already sent

  const query = { ...req.query };
  if (query.tenant_id !== undefined) query.tenant_id = Number(query.tenant_id);
  const data = validate(listQuerySchema, query);

  let result;
  try {
    result = await listRequests(data.tenant_id, {
      user_id: actingUserId,
      bypass_employee_access: employeeAccessOptionsFromReq(req).bypass,
      status: data.status,
      date_from: data.date_from,
      date_to: data.date_to,
      search: data.search,
      org_unit_id: data.org_unit_id,
      level_code: data.level_code,
      page: data.page,
      page_size: data.page_size,
    });
  } catch (err) {
    handleSecuredQueryError(err, {
      route: ROUTE_TAG_LIST,
      friendlyMessage: 'Failed to fetch overtime requests. Please try again later.',
      context: { user_id: actingUserId, tenant_id: data.tenant_id }
    });
  }

  const { rows, total, page, pageSize } = result;
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
  const hasNext = page < totalPages;
  const hasPrevious = page > 1;

  logSecuredAccess(ROUTE_TAG_LIST, {
    user_id: actingUserId,
    tenant_id: data.tenant_id,
    returned: Array.isArray(rows) ? rows.length : 0,
    total
  });

  sendList(res, {
    message: 'Fetched successfully',
    data: rows,
    meta: {
      pagination: { page, pageSize, total, totalPages, hasNext, hasPrevious },
    },
  });
});

/** GET /api/tm/overtime/requests/export - same filters as list; returns Excel */
export const listExport = asyncHandler(async (req, res) => {
  const actingUserId = requireActingUserId(req, res);
  if (actingUserId == null) return;

  const query = { ...req.query };
  if (query.tenant_id !== undefined) query.tenant_id = Number(query.tenant_id);
  const data = validate(listQuerySchema, query);

  let rows;
  try {
    ({ rows } = await listOvertimeRequestsForExport(data.tenant_id, {
      user_id: actingUserId,
      bypass_employee_access: employeeAccessOptionsFromReq(req).bypass,
      status: data.status,
      date_from: data.date_from,
      date_to: data.date_to,
      search: data.search,
      org_unit_id: data.org_unit_id,
      level_code: data.level_code
    }));
  } catch (err) {
    handleSecuredQueryError(err, {
      route: ROUTE_TAG_EXPORT,
      friendlyMessage: 'Failed to export overtime requests. Please try again later.',
      context: { user_id: actingUserId, tenant_id: data.tenant_id }
    });
  }

  const { buffer, filename, rowCount } = await buildOvertimeRequestsExcelBuffer({
    rows,
    tenantId: data.tenant_id
  });

  if (rowCount === 0) {
    return res.status(404).json({ success: false, message: 'No overtime requests found to export' });
  }

  logSecuredAccess(ROUTE_TAG_EXPORT, {
    user_id: actingUserId,
    tenant_id: data.tenant_id,
    exported: rowCount
  });

  return sendExcelExport(res, buffer, filename);
});

/** GET /api/tm/overtime/requests/:ot_request_guid - get one (query: tenant_id) */
export const getOne = asyncHandler(async (req, res) => {
  const params = guidParamSchema.safeParse({ ot_request_guid: req.params.ot_request_guid });
  if (!params.success) throw new ValidationError('Invalid ot_request_guid', [params.error.message]);
  const query = { tenant_id: req.query.tenant_id != null ? Number(req.query.tenant_id) : undefined };
  const queryData = validate(getOneQuerySchema, query);
  const row = await getOneRequest(queryData.tenant_id, params.data.ot_request_guid);
  sendSuccess(res, { message: 'Fetched successfully', data: row });
});

/** POST /api/tm/overtime/requests - create */
export const create = asyncHandler(async (req, res) => {
  const body = parseBody(req);
  const data = validate(createSchema, body);
  const result = await createRequest(data);
  sendCreated(res, {
    message: 'Overtime request created.',
    data: result,
  });
});

/** PATCH /api/tm/overtime/requests/:ot_request_guid - update draft */
export const updateDraftHandler = asyncHandler(async (req, res) => {
  const params = guidParamSchema.safeParse({ ot_request_guid: req.params.ot_request_guid });
  if (!params.success) throw new ValidationError('Invalid ot_request_guid', [params.error.message]);
  const body = parseBody(req);
  const data = validate(updateDraftSchema, { ...body, tenant_id: body.tenant_id ?? req.body?.tenant_id });
  const tenantId = Number(data.tenant_id);
  const result = await updateDraft(tenantId, params.data.ot_request_guid, data);
  sendSuccess(res, {
    message: 'Draft updated.',
    data: result,
  });
});

/** POST /api/tm/overtime/requests/:ot_request_guid/submit */
export const submit = asyncHandler(async (req, res) => {
  const params = guidParamSchema.safeParse({ ot_request_guid: req.params.ot_request_guid });
  if (!params.success) throw new ValidationError('Invalid ot_request_guid', [params.error.message]);
  const body = parseBody(req);
  const data = validate(actionSchema, body);
  const result = await submitRequest(Number(data.tenant_id), params.data.ot_request_guid, data);
  sendSuccess(res, {
    message: 'Request submitted.',
    data: result,
  });
});

/** POST /api/tm/overtime/requests/:ot_request_guid/approve */
export const approve = asyncHandler(async (req, res) => {
  const params = guidParamSchema.safeParse({ ot_request_guid: req.params.ot_request_guid });
  if (!params.success) throw new ValidationError('Invalid ot_request_guid', [params.error.message]);
  const body = parseBody(req);
  const data = validate(actionSchema, body);
  const result = await approveRequest(Number(data.tenant_id), params.data.ot_request_guid, data);
  sendSuccess(res, {
    message: 'Request approved.',
    data: result,
  });
});

/** POST /api/tm/overtime/requests/:ot_request_guid/reject */
export const reject = asyncHandler(async (req, res) => {
  const params = guidParamSchema.safeParse({ ot_request_guid: req.params.ot_request_guid });
  if (!params.success) throw new ValidationError('Invalid ot_request_guid', [params.error.message]);
  const body = parseBody(req);
  const data = validate(actionSchema, body);
  const result = await rejectRequest(Number(data.tenant_id), params.data.ot_request_guid, data);
  sendSuccess(res, {
    message: 'Request rejected.',
    data: result,
  });
});

/** POST /api/tm/overtime/requests/:ot_request_guid/cancel */
export const cancel = asyncHandler(async (req, res) => {
  const params = guidParamSchema.safeParse({ ot_request_guid: req.params.ot_request_guid });
  if (!params.success) throw new ValidationError('Invalid ot_request_guid', [params.error.message]);
  const body = parseBody(req);
  const data = validate(actionSchema, body);
  const result = await cancelRequest(Number(data.tenant_id), params.data.ot_request_guid, data);
  sendSuccess(res, {
    message: result.status === 'DELETED' ? 'Request cancelled (deleted).' : 'Request withdrawn.',
    data: result,
  });
});

/*
  ========== Postman examples (JSON bodies) ==========

  Base URL: {{baseUrl}}/api/tm/overtime/requests

  --- Create (DRAFT) ---
  POST {{baseUrl}}/api/tm/overtime/requests
  Content-Type: application/json

  {
    "tenant_id": 1,
    "employee_guid": "a1b2c3d4e5f6789012345678abcdef01",
    "attendance_day_id": 100,
    "requested_hours": 2.5,
    "reason": "Project deadline",
    "actor": "john.doe"
  }

  --- Create (SUBMITTED) ---
  POST {{baseUrl}}/api/tm/overtime/requests
  Content-Type: application/json

  {
    "tenant_id": 1,
    "employee_guid": "a1b2c3d4-e5f6-7890-1234-5678abcdef01",
    "attendance_day_id": 100,
    "requested_hours": 2.5,
    "reason": "Project deadline",
    "status": "SUBMITTED",
    "actor": "john.doe"
  }

  --- Update draft ---
  PATCH {{baseUrl}}/api/tm/overtime/requests/:ot_request_guid
  Content-Type: application/json

  {
    "tenant_id": 1,
    "requested_hours": 3,
    "reason": "Updated reason",
    "actor": "john.doe"
  }

  --- Submit ---
  POST {{baseUrl}}/api/tm/overtime/requests/:ot_request_guid/submit
  Content-Type: application/json

  {
    "tenant_id": 1,
    "actor": "manager.user"
  }

  --- Approve ---
  POST {{baseUrl}}/api/tm/overtime/requests/:ot_request_guid/approve
  Content-Type: application/json

  {
    "tenant_id": 1,
    "actor": "approver.user"
  }

  --- Reject ---
  POST {{baseUrl}}/api/tm/overtime/requests/:ot_request_guid/reject
  Content-Type: application/json

  {
    "tenant_id": 1,
    "actor": "manager.user"
  }

  --- Cancel ---
  POST {{baseUrl}}/api/tm/overtime/requests/:ot_request_guid/cancel
  Content-Type: application/json

  {
    "tenant_id": 1,
    "actor": "john.doe"
  }

  Note: :ot_request_guid is the 32-char hex string returned from create (or with dashes).

  --- GET one ---
  GET {{baseUrl}}/api/tm/overtime/requests/:ot_request_guid?tenant_id=1

  --- GET list ---
  GET {{baseUrl}}/api/tm/overtime/requests?tenant_id=1
  GET {{baseUrl}}/api/tm/overtime/requests?tenant_id=1&status=SUBMITTED
  GET {{baseUrl}}/api/tm/overtime/requests?tenant_id=1&date_from=2025-01-01&date_to=2025-01-31&search=john&page=1&page_size=20
  GET {{baseUrl}}/api/tm/overtime/requests?tenant_id=1&org_unit_id=ABC123&level_code=LVL1
*/
