import express from 'express';
import multer from 'multer';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { sendSuccess } from '../../../../utils/response.js';
import {
  createEmployeeCompensationComponents,
  editEmployeeCompensationComponents,
  classifyEmployeeCompOracleError,
  EMP_COMP_MAX_EDIT_DOCUMENTS
} from '../service/employeeCompensationService.js';
import { getEmployeePlanFullDetails } from '../service/employeePlanFullDetailsService.js';
import { parsePlanFullDetailsQuery } from '../validation/employeePlanFullDetailsQuery.js';

const router = express.Router();

const HTTP = { BAD_REQUEST: 400, OK: 200, SERVER_ERROR: 500 };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const SUCCESS_MESSAGE = 'Operation completed successfully';

const EDIT_MAX_FILE_MB = (() => {
  const raw = process.env.EMP_COMP_EDIT_MAX_FILE_MB;
  if (raw === undefined || raw === '') return 25;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n < 1) return 25;
  return Math.min(n, 200);
})();

/* Documents: memory only — never saved under the repo or server disk; Oracle stores BLOB (e.g. COMP_ADJUSTMENT_DOCS). */
const uploadEdit = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: EDIT_MAX_FILE_MB * 1024 * 1024,
    files: EMP_COMP_MAX_EDIT_DOCUMENTS + 5
  }
});

const uploadEditMiddleware = uploadEdit.fields([
  { name: 'documents', maxCount: EMP_COMP_MAX_EDIT_DOCUMENTS },
  { name: 'documents[]', maxCount: EMP_COMP_MAX_EDIT_DOCUMENTS }
]);

/**
 * @param {unknown} err
 * @param {import('express').Response} res
 * @returns {boolean} whether a response was sent
 */
function respondToEditMulterError(err, res) {
  if (!(err instanceof multer.MulterError)) return false;
  if (err.code === 'LIMIT_FILE_SIZE') {
    res.status(HTTP.BAD_REQUEST).json({
      success: false,
      message: `Each file must be at most ${EDIT_MAX_FILE_MB} MB`
    });
    return true;
  }
  if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
    res.status(HTTP.BAD_REQUEST).json({
      success: false,
      message: `At most ${EMP_COMP_MAX_EDIT_DOCUMENTS} document(s) allowed`
    });
    return true;
  }
  res.status(HTTP.BAD_REQUEST).json({
    success: false,
    message: 'Upload failed'
  });
  return true;
}

function stripOracleHelpUrl(text) {
  return (text || '').replace(/\s*Help:\s*https?:\/\/[^\s]*/gi, '').trim();
}

function primaryOracleLine(error) {
  return stripOracleHelpUrl(String(error?.message || '')).split(/\n/)[0].trim();
}

function toInt(value, field) {
  if (value === undefined || value === null || value === '') {
    return { ok: false, error: `${field} is required` };
  }
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    return { ok: false, error: `${field} must be a positive integer` };
  }
  return { ok: true, value: n };
}

/** Empty / missing → null; otherwise same rules as toInt. */
function toOptionalPositiveInt(value, field) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return { ok: true, value: null };
  }
  return toInt(value, field);
}

function toNumberAmount(value, field) {
  if (value === undefined || value === null || value === '') {
    return { ok: false, error: `${field} is required` };
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return { ok: false, error: `${field} must be a number` };
  }
  return { ok: true, value: n };
}

function toNonEmptyString(value, field) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return { ok: false, error: `${field} is required` };
  }
  return { ok: true, value: String(value).trim() };
}

/** ISO-style currency codes (e.g. USD, KWD); max 15 chars for Oracle VARCHAR2. */
function toCurrencyCode(value, fieldPath) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return { ok: false, error: `${fieldPath}.currency_code is required` };
  }
  const s = String(value).trim().toUpperCase();
  if (s.length > 15) {
    return { ok: false, error: `${fieldPath}.currency_code must be at most 15 characters` };
  }
  if (!/^[A-Z0-9]+$/.test(s)) {
    return {
      ok: false,
      error: `${fieldPath}.currency_code must contain only letters and digits`
    };
  }
  return { ok: true, value: s };
}

function parseActiveFlag(value, rowNumber) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return { ok: true, value: 'Y' };
  }
  const s = String(value).trim().toUpperCase();
  if (s === 'Y' || s === 'N') {
    return { ok: true, value: s };
  }
  return {
    ok: false,
    error: `active_flag must be Y or N at row ${rowNumber}`
  };
}

function parseTriFlag(value, fieldPath) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return { ok: true, value: null };
  }
  if (typeof value === 'boolean') {
    return { ok: true, value: value ? 'TRUE' : 'FALSE' };
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return { ok: false, error: `${fieldPath} must be a boolean` };
    }
    return { ok: true, value: value !== 0 ? 'TRUE' : 'FALSE' };
  }
  const s = String(value).trim().toUpperCase();
  if (s === 'TRUE' || s === 'FALSE' || s === '1' || s === '0' || s === 'Y' || s === 'N' || s === 'YES' || s === 'NO') {
    const truthy = s === 'TRUE' || s === '1' || s === 'Y' || s === 'YES';
    return { ok: true, value: truthy ? 'TRUE' : 'FALSE' };
  }
  return { ok: false, error: `${fieldPath} must be TRUE/FALSE (or boolean)` };
}

/**
 * @param {object[]} components
 * @param {{ requireAdjustmentMethod?: boolean }} [options]
 */
function validateComponentLines(components, options = {}) {
  const { requireAdjustmentMethod = false } = options;
  const errors = [];
  if (!Array.isArray(components)) {
    errors.push('components must be an array');
    return { ok: false, errors, normalized: null };
  }
  if (components.length === 0) {
    errors.push('components must be a non-empty array');
    return { ok: false, errors, normalized: null };
  }

  /** @type {{ ok: boolean, error?: string, value: string | null }[]} */
  const replaceFlags = [];
  /** @type {{ ok: boolean, error?: string, value: string | null }[]} */
  const deleteFlags = [];

  components.forEach((c, idx) => {
    const p = `components[${idx}]`;
    const rowNumber = idx + 1;
    const cid = toInt(c?.component_id, `${p}.component_id`);
    if (!cid.ok) errors.push(cid.error);
    const amt = toNumberAmount(c?.amount, `${p}.amount`);
    if (!amt.ok) errors.push(amt.error);
    const cur = toCurrencyCode(c?.currency_code, p);
    if (!cur.ok) errors.push(cur.error);
    if (requireAdjustmentMethod) {
      const am = toNonEmptyString(c?.adjustment_method, `${p}.adjustment_method`);
      if (!am.ok) errors.push(am.error);
    }
    const af = parseActiveFlag(c?.active_flag, rowNumber);
    if (!af.ok) errors.push(af.error);

    const replaceFlag = parseTriFlag(c?.replace_flag ?? c?.replace, `${p}.replace_flag`);
    replaceFlags[idx] = replaceFlag;
    if (!replaceFlag.ok) errors.push(replaceFlag.error);

    const deleteFlag = parseTriFlag(c?.delete_flag ?? c?.delete, `${p}.delete_flag`);
    deleteFlags[idx] = deleteFlag;
    if (!deleteFlag.ok) errors.push(deleteFlag.error);

    if (c?.plan_id != null && String(c.plan_id).trim() !== '') {
      const pid = toInt(c.plan_id, `${p}.plan_id`);
      if (!pid.ok) errors.push(pid.error);
    }

    if (replaceFlag.value === 'TRUE' && deleteFlag.value === 'TRUE') {
      errors.push(`${p} cannot set both replace and delete to true`);
    }
    if (
      c?.effective_start_date === undefined ||
      c?.effective_start_date === null ||
      String(c.effective_start_date).trim() === ''
    ) {
      errors.push(`${p}.effective_start_date is required`);
    } else if (!ISO_DATE.test(String(c.effective_start_date).trim().slice(0, 10))) {
      errors.push(`${p}.effective_start_date must be YYYY-MM-DD`);
    }
    if (
      c?.effective_end_date !== undefined &&
      c?.effective_end_date !== null &&
      String(c.effective_end_date).trim() !== ''
    ) {
      const endStr = String(c.effective_end_date).trim().slice(0, 10);
      if (!ISO_DATE.test(endStr)) {
        errors.push(`${p}.effective_end_date must be YYYY-MM-DD when provided`);
      } else {
        const startStr = String(c.effective_start_date).trim().slice(0, 10);
        if (ISO_DATE.test(startStr) && endStr < startStr) {
          errors.push(
            `${p}.effective_end_date cannot be before ${p}.effective_start_date`
          );
        }
      }
    }
  });

  if (errors.length > 0) {
    return { ok: false, errors, normalized: null };
  }

  const normalized = components.map((c, idx) => {
    const row = {
      component_id: Number(c.component_id),
      amount: Number(c.amount),
      currency_code: String(c.currency_code).trim().toUpperCase(),
      effective_start_date: String(c.effective_start_date).trim().slice(0, 10),
      effective_end_date:
        c.effective_end_date === undefined ||
        c.effective_end_date === null ||
        String(c.effective_end_date).trim() === ''
          ? null
          : String(c.effective_end_date).trim().slice(0, 10),
      active_flag: parseActiveFlag(c?.active_flag, idx + 1).value
    };
    if (requireAdjustmentMethod) {
      row.adjustment_method = toNonEmptyString(c.adjustment_method, 'adjustment_method').value;
    }

    const replaceFlag = replaceFlags[idx];
    const deleteFlag = deleteFlags[idx];
    if (replaceFlag.value != null) row.replace_flag = replaceFlag.value;
    if (deleteFlag.value != null) row.delete_flag = deleteFlag.value;

    if (c?.plan_id != null && String(c.plan_id).trim() !== '') {
      row.plan_id = Number(c.plan_id);
    }

    return row;
  });

  return { ok: true, errors: [], normalized };
}

function httpStatusForOracle(error) {
  const { kind, message } = classifyEmployeeCompOracleError(error);
  if (kind === 'already_attached' || kind === 'not_attached' || kind === 'missing_active_component') {
    return { status: HTTP.BAD_REQUEST, message };
  }
  return {
    status: HTTP.SERVER_ERROR,
    message: message || primaryOracleLine(error) || 'Something went wrong'
  };
}

function validateCreateBody(body) {
  const errors = [];

  const ent = toInt(body?.enterprise_id, 'enterprise_id');
  if (!ent.ok) errors.push(ent.error);
  const emp = toInt(body?.employee_id, 'employee_id');
  if (!emp.ok) errors.push(emp.error);

  if (
    body?.plan_id !== undefined &&
    body?.plan_id !== null &&
    String(body.plan_id).trim() !== ''
  ) {
    errors.push(
      'plan_id must not be sent at the top level for create; set a positive plan_id on each components[] row'
    );
  }

  const created = toNonEmptyString(body?.created_by, 'created_by');
  if (!created.ok) errors.push(created.error);

  const lines = validateComponentLines(body?.components);
  if (!lines.ok) errors.push(...lines.errors);

  /** @type {Array<object & { plan_id: number }> | null} */
  let mergedComponents = null;
  if (lines.ok && lines.normalized) {
    mergedComponents = [];
    for (let idx = 0; idx < lines.normalized.length; idx++) {
      const row = lines.normalized[idx];
      const pid = toInt(row.plan_id, `components[${idx}].plan_id`);
      if (!pid.ok) {
        errors.push(pid.error);
      } else {
        mergedComponents.push({ ...row, plan_id: pid.value });
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    payload: {
      enterprise_id: ent.value,
      employee_id: emp.value,
      plan_id: null,
      created_by: created.value,
      components: mergedComponents
    }
  };
}

function parseComponentsJson(raw, errors) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    errors.push('components is required');
    return null;
  }
  const str = String(raw).trim();
  try {
    const parsed = JSON.parse(str);
    if (!Array.isArray(parsed)) {
      errors.push('components must be a JSON array (e.g. wrap your object in [ ])');
      return null;
    }
    return parsed;
  } catch (e) {
    const detail = e instanceof SyntaxError ? e.message : String(e?.message || e);
    const arrayHint =
      /^\s*\{/.test(str) && !/^\s*\[/.test(str)
        ? ' Send a JSON array: [ { ... } ] not a lone { ... }.'
        : '';
    errors.push(`components must be valid JSON (${detail}).${arrayHint}`);
    return null;
  }
}

function parseDocumentDescriptions(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return [];
  }
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed.map((x) => (x == null ? '' : String(x))) : [];
  } catch {
    return [];
  }
}

function collectEditUploadFiles(req) {
  const bag = req.files;
  if (!bag) return [];
  const a = bag.documents || [];
  const b = bag['documents[]'] || [];
  return [...a, ...b].slice(0, EMP_COMP_MAX_EDIT_DOCUMENTS);
}

function validateEditMultipart(req) {
  const errors = [];
  const body = req.body || {};

  const ent = toInt(body.enterprise_id, 'enterprise_id');
  if (!ent.ok) errors.push(ent.error);
  const emp = toInt(body.employee_id, 'employee_id');
  if (!emp.ok) errors.push(emp.error);
  const planOpt = toOptionalPositiveInt(body.plan_id, 'plan_id');
  if (!planOpt.ok) errors.push(planOpt.error);

  const adjType = toNonEmptyString(body.adjustment_type, 'adjustment_type');
  if (!adjType.ok) errors.push(adjType.error);

  if (
    body.effective_date === undefined ||
    body.effective_date === null ||
    String(body.effective_date).trim() === ''
  ) {
    errors.push('effective_date is required');
  } else if (!ISO_DATE.test(String(body.effective_date).trim().slice(0, 10))) {
    errors.push('effective_date must be YYYY-MM-DD');
  }

  const reason = toNonEmptyString(body.reason_code, 'reason_code');
  if (!reason.ok) errors.push(reason.error);
  const budget = toNonEmptyString(body.budget_code, 'budget_code');
  if (!budget.ok) errors.push(budget.error);
  const just = toNonEmptyString(body.justification_text, 'justification_text');
  if (!just.ok) errors.push(just.error);

  const updated = toNonEmptyString(body.updated_by, 'updated_by');
  if (!updated.ok) errors.push(updated.error);

  const componentsRaw = parseComponentsJson(body.components, errors);
  let lines = { ok: false, errors: [], normalized: null };
  if (componentsRaw != null) {
    lines = validateComponentLines(componentsRaw, { requireAdjustmentMethod: true });
    if (!lines.ok) errors.push(...lines.errors);
  }

  /** @type {Array<object & { plan_id: number }> | null} */
  let mergedComponents = null;
  if (lines.ok && lines.normalized) {
    mergedComponents = [];
    const defaultPlanId = planOpt.value;
    for (let idx = 0; idx < lines.normalized.length; idx++) {
      const row = lines.normalized[idx];
      const resolved =
        row.plan_id != null && Number.isFinite(Number(row.plan_id))
          ? Number(row.plan_id)
          : defaultPlanId;
      if (resolved == null || !Number.isFinite(resolved) || resolved <= 0) {
        errors.push(
          `components[${idx}] needs a positive plan_id, or provide top-level plan_id for rows that omit it`
        );
      } else {
        mergedComponents.push({ ...row, plan_id: resolved });
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const perfRaw = body.performance_rating;
  const perf =
    perfRaw === undefined || perfRaw === null || String(perfRaw).trim() === ''
      ? null
      : String(perfRaw).trim();

  const notesRaw = body.internal_notes;
  const notes =
    notesRaw === undefined || notesRaw === null ? null : String(notesRaw);

  const files = collectEditUploadFiles(req);
  const descriptions = parseDocumentDescriptions(body.document_descriptions);

  const distinctPlanIds =
    mergedComponents != null
      ? [...new Set(mergedComponents.map((r) => r.plan_id))].sort((a, b) => a - b)
      : [];

  return {
    ok: true,
    payload: {
      enterprise_id: ent.value,
      employee_id: emp.value,
      /** When all rows target one plan, set for backward compatibility; null if multiple plans. */
      plan_id: distinctPlanIds.length === 1 ? distinctPlanIds[0] : null,
      adjustment_type: adjType.value,
      effective_date: String(body.effective_date).trim().slice(0, 10),
      reason_code: reason.value,
      budget_code: budget.value,
      justification_text: just.value,
      performance_rating: perf,
      internal_notes: notes,
      updated_by: updated.value,
      components: mergedComponents
    },
    files,
    documentDescriptions: descriptions
  };
}

/**
 * GET /api/comp/employee-compensation
 *
 * Rows from COMP.V_EMPLOYEE_PLAN_FULL_DETAILS; totals aggregated from COMP.V_EMP_ASSIGNED_COMPONENTS_FULL.
 * Query: enterprise_id (required); employee_id / plan_id (optional); employee_guid / plan_guid (optional,
 * 32-char hex, hyphens optional). When a GUID query param is present and valid, it filters instead of the
 * corresponding numeric id. Response rows include employee_guid and plan_guid as uppercase hex strings.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = parsePlanFullDetailsQuery(req.query);
    if (!parsed.ok) {
      return res.status(HTTP.BAD_REQUEST).json({
        status: false,
        message: parsed.message,
        data: null
      });
    }

    try {
      const { enterprise_id, employee_id, plan_id, employee_guid_hex, plan_guid_hex, page, limit } =
        parsed.data;
      const { rows, total } = await getEmployeePlanFullDetails(
        { enterprise_id, employee_id, plan_id, employee_guid_hex, plan_guid_hex },
        { page, limit }
      );
      const totalPages = limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1;
      return sendSuccess(res, {
        message: 'Fetched successfully',
        data: rows,
        meta: {
          pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
          }
        },
        statusCode: HTTP.OK
      });
    } catch {
      return res.status(HTTP.SERVER_ERROR).json({
        status: false,
        message: 'Failed to fetch employee plan full details',
        data: null
      });
    }
  })
);

router.post('/create', asyncHandler(async (req, res) => {
  const validation = validateCreateBody(req.body || {});
  if (!validation.ok) {
    return res.status(HTTP.BAD_REQUEST).json({
      success: false,
      message: 'Validation failed',
      errors: validation.errors
    });
  }

  try {
    const result = await createEmployeeCompensationComponents(validation.payload);
    const success = result?.success === true;
    return res.status(success ? HTTP.OK : HTTP.BAD_REQUEST).json({
      success,
      message: result?.message ?? ''
    });
  } catch {
    return res.status(HTTP.BAD_REQUEST).json({
      success: false,
      message: 'Unable to process request'
    });
  }
}));

router.post(
  '/edit',
  (req, res, next) => {
    uploadEditMiddleware(req, res, (err) => {
      if (respondToEditMulterError(err, res)) return;
      if (err) {
        return res.status(HTTP.SERVER_ERROR).json({
          success: false,
          message: 'Upload failed'
        });
      }
      next();
    });
  },
  asyncHandler(async (req, res) => {
    const validation = validateEditMultipart(req);
    if (!validation.ok) {
      return res.status(HTTP.BAD_REQUEST).json({
        success: false,
        message: 'Validation failed',
        errors: validation.errors
      });
    }

    try {
      const result = await editEmployeeCompensationComponents(
        validation.payload,
        validation.files,
        validation.documentDescriptions
      );
      const success = result?.success === true;
      return res.status(success ? HTTP.OK : HTTP.BAD_REQUEST).json({
        success,
        message: result?.message ?? ''
      });
    } catch {
      return res.status(HTTP.BAD_REQUEST).json({
        success: false,
        message: 'Unable to process request'
      });
    }
  })
);

export default router;
