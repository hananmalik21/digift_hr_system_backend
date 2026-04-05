import express from 'express';
import multer from 'multer';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  createEmployeeCompensationComponents,
  editEmployeeCompensationComponents,
  classifyEmployeeCompOracleError,
  EMP_COMP_MAX_EDIT_DOCUMENTS
} from '../service/employeeCompensationService.js';

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

function validateComponentLines(components) {
  const errors = [];
  if (!Array.isArray(components)) {
    errors.push('components must be an array');
    return { ok: false, errors, normalized: null };
  }
  if (components.length === 0) {
    errors.push('components must be a non-empty array');
    return { ok: false, errors, normalized: null };
  }

  components.forEach((c, idx) => {
    const p = `components[${idx}]`;
    const rowNumber = idx + 1;
    const cid = toInt(c?.component_id, `${p}.component_id`);
    if (!cid.ok) errors.push(cid.error);
    const amt = toNumberAmount(c?.amount, `${p}.amount`);
    if (!amt.ok) errors.push(amt.error);
    const af = parseActiveFlag(c?.active_flag, rowNumber);
    if (!af.ok) errors.push(af.error);
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

  const normalized = components.map((c, idx) => ({
    component_id: Number(c.component_id),
    amount: Number(c.amount),
    effective_start_date: String(c.effective_start_date).trim().slice(0, 10),
    effective_end_date:
      c.effective_end_date === undefined ||
      c.effective_end_date === null ||
      String(c.effective_end_date).trim() === ''
        ? null
        : String(c.effective_end_date).trim().slice(0, 10),
    active_flag: parseActiveFlag(c?.active_flag, idx + 1).value
  }));

  return { ok: true, errors: [], normalized };
}

function httpStatusForOracle(error) {
  const { kind, message } = classifyEmployeeCompOracleError(error);
  if (kind === 'already_attached' || kind === 'not_attached') {
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
  const plan = toInt(body?.plan_id, 'plan_id');
  if (!plan.ok) errors.push(plan.error);

  const created = toNonEmptyString(body?.created_by, 'created_by');
  if (!created.ok) errors.push(created.error);

  const lines = validateComponentLines(body?.components);
  if (!lines.ok) errors.push(...lines.errors);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    payload: {
      enterprise_id: ent.value,
      employee_id: emp.value,
      plan_id: plan.value,
      created_by: created.value,
      components: lines.normalized
    }
  };
}

function parseComponentsJson(raw, errors) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    errors.push('components is required');
    return null;
  }
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) {
      errors.push('components must be a JSON array');
      return null;
    }
    return parsed;
  } catch {
    errors.push('components must be valid JSON');
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
  const plan = toInt(body.plan_id, 'plan_id');
  if (!plan.ok) errors.push(plan.error);

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
    lines = validateComponentLines(componentsRaw);
    if (!lines.ok) errors.push(...lines.errors);
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

  return {
    ok: true,
    payload: {
      enterprise_id: ent.value,
      employee_id: emp.value,
      plan_id: plan.value,
      adjustment_type: adjType.value,
      effective_date: String(body.effective_date).trim().slice(0, 10),
      reason_code: reason.value,
      budget_code: budget.value,
      justification_text: just.value,
      performance_rating: perf,
      internal_notes: notes,
      updated_by: updated.value,
      components: lines.normalized
    },
    files,
    documentDescriptions: descriptions
  };
}

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
    await createEmployeeCompensationComponents(validation.payload);
    return res.status(HTTP.OK).json({
      success: true,
      message: SUCCESS_MESSAGE
    });
  } catch (error) {
    const { status, message } = httpStatusForOracle(error);
    return res.status(status).json({
      success: false,
      message
    });
  }
}));

router.post(
  '/edit',
  (req, res, next) => {
    uploadEditMiddleware(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(HTTP.BAD_REQUEST).json({
            success: false,
            message: `Each file must be at most ${EDIT_MAX_FILE_MB} MB`
          });
        }
        if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(HTTP.BAD_REQUEST).json({
            success: false,
            message: `At most ${EMP_COMP_MAX_EDIT_DOCUMENTS} document(s) allowed`
          });
        }
        return res.status(HTTP.BAD_REQUEST).json({
          success: false,
          message: err.message || 'Upload failed'
        });
      }
      if (err) {
        return res.status(HTTP.SERVER_ERROR).json({
          success: false,
          message: err.message || 'Upload failed'
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
      await editEmployeeCompensationComponents(
        validation.payload,
        validation.files,
        validation.documentDescriptions
      );
      return res.status(HTTP.OK).json({
        success: true,
        message: SUCCESS_MESSAGE
      });
    } catch (error) {
      const { status, message } = httpStatusForOracle(error);
      return res.status(status).json({
        success: false,
        message
      });
    }
  })
);

export default router;
