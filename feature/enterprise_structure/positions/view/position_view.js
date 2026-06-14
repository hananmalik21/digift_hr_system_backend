/**
 * HTTP responses for the positions router (shape, status codes, meta envelope).
 * @module feature/enterprise_structure/positions/view/position_view
 */
const API_VERSION = '1.0.0';

function meta(req, extra = {}) {
  return { api_version: API_VERSION, ...extra };
}

/** @param {import('express').Response} res @param {import('express').Request} req */
export function sendPositionList(res, req, data, m = {}) {
  const rows = Array.isArray(data) ? data : [];
  res.json({
    success: true,
    meta: meta(req, { count: rows.length, ...m }),
    data: rows,
  });
}

/** @param {import('express').Response} res @param {import('express').Request} req */
export function sendPosition(res, req, data) {
  if (!data) {
    return res.status(404).json({
      success: false,
      error: 'Position not found',
      meta: meta(req),
    });
  }
  res.json({ success: true, meta: meta(req), data });
}

/** @param {import('express').Response} res @param {import('express').Request} req */
export function sendCreated(res, req, data) {
  res.status(201).json({
    success: true,
    message: 'Position created successfully',
    meta: meta(req, { position_id: data?.position_id }),
    data,
  });
}

/** @param {import('express').Response} res @param {import('express').Request} req */
export function sendUpdated(res, req, data) {
  res.json({
    success: true,
    message: 'Position updated successfully',
    meta: meta(req, { position_id: data?.position_id }),
    data,
  });
}

/** @param {import('express').Response} res @param {import('express').Request} req */
export function sendDeleted(res, req, message, id) {
  res.json({
    success: true,
    message,
    meta: meta(req, { position_id: id }),
  });
}

/** @param {import('express').Response} res @param {import('express').Request} req */
export function sendBadRequest(res, req, errors) {
  const arr = Array.isArray(errors) ? errors : [errors];
  const firstError = arr.length > 0 ? arr[0] : 'Validation failed';
  res.status(400).json({
    success: false,
    error: firstError,
    error_details: {
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      type: 'ValidationError',
      validation_errors: arr,
    },
  });
}

/**
 * @param {import('express').Response} res
 * @param {import('express').Request} req
 * @param {string} message
 * @param {unknown} [_cause] Optional; reserved for server-side logging (not exposed in JSON).
 */
export function sendConflict(res, req, message, _cause) {
  void _cause;
  res.status(409).json({
    success: false,
    error: message,
    error_details: {
      message,
      code: 'CONFLICT',
      type: 'ConflictError',
    },
  });
}

/** @param {import('express').Response} res @param {import('express').Request} req */
export function sendServerError(res, req, message, error = null) {
  // IMPORTANT: log the real error server-side
  console.error('API ERROR:', message, error?.message || error, error?.stack);

  res.status(500).json({
    success: false,
    error: message || 'Internal server error',
    error_details: {
      message: error?.message || message || 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR',
      type: 'Error',
      // Keep stack only for dev; if you want: gate by NODE_ENV
      stack: process.env.NODE_ENV === 'production' ? undefined : error?.stack,
    },
  });
}

/** @param {import('express').Response} res @param {import('express').Request} req */
export function sendReportingRelationships(res, req, data) {
  const relationships = Array.isArray(data) ? data : [];
  res.json({
    success: true,
    meta: meta(req, { count: relationships.length }),
    data: relationships,
  });
}

/**
 * Paginated list for GET /api/positions/by-org-unit — meta contains pagination only.
 *
 * @param {import('express').Response} res
 * @param {object[]} data
 * @param {object} pagination - snake_case pagination fields
 */
export function sendPositionsByOrgUnitList(res, data, pagination) {
  res.json({
    success: true,
    meta: { pagination },
    data: Array.isArray(data) ? data : [],
  });
}

/** @param {import('express').Response} res @param {string} message */
export function sendForbidden(res, message) {
  res.status(403).json({ success: false, message });
}
