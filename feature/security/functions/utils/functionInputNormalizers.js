function trimToNull(v) {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function trimOnly(v) {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return String(v).trim();
}

function numOrNull(v) {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}

export function normalizeFunctionCode(v) {
  const trimmed = trimToNull(v);
  if (trimmed === undefined) return undefined;
  if (trimmed === null) return null;
  return String(trimmed).toUpperCase();
}

export function normalizePermissionKey(v) {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return String(v).trim();
}

export function normalizeCreateInput(input, actor) {
  const body = input || {};
  return {
    enterprise_id: body.enterprise_id ?? body.ENTERPRISE_ID,
    module_guid: trimOnly(body.module_guid ?? body.MODULE_GUID),
    function_code: normalizeFunctionCode(body.function_code ?? body.FUNCTION_CODE),
    function_name: trimOnly(body.function_name ?? body.FUNCTION_NAME),
    description: trimToNull(body.description ?? body.DESCRIPTION),
    function_type: trimToNull(body.function_type ?? body.FUNCTION_TYPE),
    permission_key: normalizePermissionKey(body.permission_key ?? body.PERMISSION_KEY),
    route_url: trimToNull(body.route_url ?? body.ROUTE_URL),
    display_order: numOrNull(body.display_order ?? body.DISPLAY_ORDER),
    active_flag: trimToNull(body.active_flag ?? body.ACTIVE_FLAG),
    is_system_flag: trimToNull(body.is_system_flag ?? body.IS_SYSTEM_FLAG),
    created_by: trimOnly(body.created_by ?? actor)
  };
}

export function normalizeUpdatePatch(patch, actor) {
  const body = patch || {};
  const out = {};

  if (body.enterprise_id !== undefined || body.ENTERPRISE_ID !== undefined) {
    out.enterprise_id = body.enterprise_id ?? body.ENTERPRISE_ID;
  }
  if (body.module_guid !== undefined || body.MODULE_GUID !== undefined) {
    out.module_guid = trimOnly(body.module_guid ?? body.MODULE_GUID);
  }
  if (body.function_code !== undefined || body.FUNCTION_CODE !== undefined) {
    out.function_code = normalizeFunctionCode(body.function_code ?? body.FUNCTION_CODE);
  }
  if (body.function_name !== undefined || body.FUNCTION_NAME !== undefined) {
    out.function_name = trimOnly(body.function_name ?? body.FUNCTION_NAME);
  }
  if (body.description !== undefined || body.DESCRIPTION !== undefined) {
    out.description = trimToNull(body.description ?? body.DESCRIPTION);
  }
  if (body.function_type !== undefined || body.FUNCTION_TYPE !== undefined) {
    out.function_type = trimToNull(body.function_type ?? body.FUNCTION_TYPE);
  }
  if (body.permission_key !== undefined || body.PERMISSION_KEY !== undefined) {
    out.permission_key = normalizePermissionKey(body.permission_key ?? body.PERMISSION_KEY);
  }
  if (body.route_url !== undefined || body.ROUTE_URL !== undefined) {
    out.route_url = trimToNull(body.route_url ?? body.ROUTE_URL);
  }
  if (body.display_order !== undefined || body.DISPLAY_ORDER !== undefined) {
    out.display_order = numOrNull(body.display_order ?? body.DISPLAY_ORDER);
  }
  if (body.active_flag !== undefined || body.ACTIVE_FLAG !== undefined) {
    out.active_flag = trimToNull(body.active_flag ?? body.ACTIVE_FLAG);
  }
  if (body.is_system_flag !== undefined || body.IS_SYSTEM_FLAG !== undefined) {
    out.is_system_flag = trimToNull(body.is_system_flag ?? body.IS_SYSTEM_FLAG);
  }

  out.updated_by = trimOnly(body.updated_by ?? body.last_updated_by ?? actor);
  return out;
}

export function normalizeListFilters(filters) {
  return {
    function_id: filters?.function_id ?? null,
    module_id: filters?.module_id ?? null,
    function_code: filters?.function_code != null ? normalizeFunctionCode(filters.function_code) : null,
    active_flag: filters?.active_flag != null ? String(filters.active_flag).trim() || null : null,
    search: filters?.search != null ? String(filters.search).trim() || null : null
  };
}
