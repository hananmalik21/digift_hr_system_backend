const API_VERSION = '1.0.0';

function reqId() {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function meta(req, extra = {}) {
  return {
    version: API_VERSION,
    timestamp: new Date().toISOString(),
    request_id: req.headers['x-request-id'] || reqId(),
    ...extra
  };
}

export function sendPositionList(res, req, data, m = {}) {
  const rows = Array.isArray(data) ? data : [];

  res.json({
    success: true,
    meta: meta(req, {
      count: rows.length,
      ...m
    }),
    data: rows
  });
}


export function sendPosition(res, req, data) {
  if (!data) {
    return res.status(404).json({
      success: false,
      error: 'Position not found',
      meta: meta(req)
    });
  }
  res.json({ success: true, meta: meta(req), data });
}

export function sendCreated(res, req, data) {
  res.status(201).json({
    success: true,
    message: 'Position created successfully',
    meta: meta(req, { position_id: data.position_id }),
    data
  });
}

export function sendUpdated(res, req, data) {
  res.json({
    success: true,
    message: 'Position updated successfully',
    meta: meta(req, { position_id: data.position_id }),
    data
  });
}

export function sendDeleted(res, req, message, id) {
  res.json({
    success: true,
    message,
    meta: meta(req, { position_id: id })
  });
}

export function sendBadRequest(res, req, errors) {
  const arr = Array.isArray(errors) ? errors : [errors];
  res.status(400).json({
    success: false,
    error: 'Validation failed',
    errors: arr,
    meta: meta(req, { error_code: 'VALIDATION_ERROR', error_count: arr.length })
  });
}

export function sendConflict(res, req, message, details = null) {
  res.status(409).json({
    success: false,
    error: message,
    meta: meta(req, { error_code: 'CONFLICT', ...(details?.columns ? { columns: details.columns } : {}) })
  });
}

export function sendServerError(res, req, message, error = null) {
  res.status(500).json({
    success: false,
    error: message || 'Internal server error',
    meta: meta(req, {
      error_code: 'INTERNAL_SERVER_ERROR',
      ...(process.env.NODE_ENV !== 'production' && error
        ? { error_details: { message: error.message } }
        : {})
    })
  });
}
