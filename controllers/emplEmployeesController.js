/**
 * Controller: Update Employee (All-in-One)
 * PUT /api/update-employee/:idOrGuid (employee_id or employee_guid)
 */

import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { updateEmployeeAllInOne, validateUpdateBody } from '../services/emplEmployeeAllInOneService.js';
import { getEmplEmployeesList } from '../services/emplEmployeeListService.js';
import { getEmployeeListRowByEmployeeId } from '../feature/employees/controller/employeeController.js';
import EmployeeModel from '../feature/employees/model/employeeModel.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_EMPLOYEES_DIR = path.resolve(__dirname, '../uploads/employees');
if (!fs.existsSync(UPLOADS_EMPLOYEES_DIR)) {
  fs.mkdirSync(UPLOADS_EMPLOYEES_DIR, { recursive: true });
}

const uploadAllInOne = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, true)
}).single('document');

/**
 * GET /api/empl/employees
 * Cursor-based pagination. Query: enterprise_id (required), limit, cursor, sort_by, sort_dir, filters (org_unit_id, position_id, job_family_id, job_level_id, grade_id, employment_status, contract_type_code, work_location_id, search).
 * Rows are normalized in service: org_structure_list and a single position (from view or flat columns) are returned.
 * 200: { success, message, meta: { pagination: { limit, has_next, next_cursor } }, data }
 * 400: enterprise_id missing/invalid
 */
export async function getEmplEmployeesListHandler(req, res) {
  const q = req.query || {};
  const enterpriseId = q.enterprise_id ?? q.enterpriseId;
  if (enterpriseId == null || enterpriseId === '') {
    return res.status(400).json({
      success: false,
      message: 'enterprise_id is required',
      code: 'VALIDATION_ERROR'
    });
  }
  try {
    const { data, next_cursor, has_next } = await getEmplEmployeesList({
      enterprise_id: enterpriseId,
      limit: q.limit,
      cursor: q.cursor,
      sort_by: q.sort_by,
      sort_dir: q.sort_dir,
      org_unit_id: q.org_unit_id,
      position_id: q.position_id,
      job_family_id: q.job_family_id,
      job_level_id: q.job_level_id,
      grade_id: q.grade_id,
      employment_status: q.employment_status,
      employee_status: q.employee_status ?? q.employeeStatus,
      contract_type_code: q.contract_type_code,
      work_location_id: q.work_location_id,
      search: q.search
    });
    const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 10));
    return res.status(200).json({
      success: true,
      message: 'Employees fetched successfully',
      meta: {
        pagination: {
          limit,
          has_next,
          next_cursor: next_cursor ?? null
        }
      },
      data
    });
  } catch (err) {
    const msg = err?.message ?? String(err);
    const isValidation = msg.includes('enterprise_id') || err.code === 'VALIDATION_ERROR';
    return res.status(isValidation ? 400 : 500).json({
      success: false,
      message: msg,
      code: isValidation ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR'
    });
  }
}

/** Run multer only when Content-Type is multipart/form-data (so JSON and form-data both work). */
export function maybeMulterUpdateAllInOne(req, res, next) {
  const contentType = (req.headers['content-type'] || '').toLowerCase();
  if (!contentType.includes('multipart/form-data')) {
    return next();
  }
  uploadAllInOne(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'File too large (max 10MB)'
        : (err.message || 'File upload error');
      return res.status(400).json({ success: false, message: msg, code: 'UPLOAD_ERROR' });
    }
    next();
  });
}

/**
 * PUT /api/update-employee/:idOrGuid
 * :idOrGuid = employee_id (number) or employee_guid (32-char hex).
 * Body: JSON or multipart/form-data (same field names as create, snake_case).
 * Optional file field "document" to update employee document.
 * 200: { success: true, employee_id, data? }
 * 400: { success: false, message, code } on validation or Oracle ORA- / -20001
 * 404: employee not found (when guid is used)
 * 500: on unexpected error
 */
export async function updateEmployeeAllInOneHandler(req, res) {
  const param = String(req.params.idOrGuid ?? '').trim();
  const normalizedGuid = param.replace(/-/g, '').toUpperCase();
  const isNumericId = /^\d+$/.test(param);
  const isGuid = normalizedGuid.length === 32 && /^[0-9A-Fa-f]+$/.test(normalizedGuid);

  let employeeId;
  if (isNumericId) {
    employeeId = parseInt(param, 10);
  } else if (isGuid) {
    const employee = await EmployeeModel.findByGuidHex(param);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found',
        code: 'NOT_FOUND'
      });
    }
    employeeId = employee.employee_id ?? employee.EMPLOYEE_ID;
  } else {
    return res.status(400).json({
      success: false,
      message: 'Parameter must be employee_id (numeric) or employee_guid (32-char hex)',
      code: 'VALIDATION_ERROR'
    });
  }

  const body = { ...(req.body || {}) };

  // If a file was uploaded, save it and set document fields for the procedure
  if (req.file) {
    const hash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    const ext = path.extname(req.file.originalname) || '';
    const base = path.basename(req.file.originalname, ext).replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = `${crypto.randomUUID()}${base ? `-${base}` : ''}${ext}`;
    const filepath = path.join(UPLOADS_EMPLOYEES_DIR, filename);
    fs.writeFileSync(filepath, req.file.buffer);
    body.doc_file_name = req.file.originalname || filename;
    body.doc_mime_type = req.file.mimetype || 'application/octet-stream';
    body.doc_access_url = `/uploads/employees/${filename}`;
    body.doc_hash_sha256 = hash;
    body.document_type_code = body.document_type_code || 'EMPLOYEE_DOC';
  }

  const validation = validateUpdateBody(body, employeeId);
  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      message: validation.message,
      code: validation.code || 'VALIDATION_ERROR'
    });
  }

  try {
    await updateEmployeeAllInOne(employeeId, body);
    const data = await getEmployeeListRowByEmployeeId(parseInt(employeeId, 10));
    return res.status(200).json({
      success: true,
      employee_id: parseInt(employeeId, 10),
      ...(data != null && { data })
    });
  } catch (err) {
    const msg = err?.message ?? String(err);
    const isOracle = err?.errorNum != null || /^ORA-\d{5}/.test(msg) || /ORA-\d{5}/.test(msg) || /-20001/.test(msg);
    if (isOracle) {
      return res.status(400).json({
        success: false,
        message: msg,
        code: err?.errorNum != null ? `ORA-${String(err.errorNum).padStart(5, '0')}` : 'ORACLE_ERROR'
      });
    }
    return res.status(500).json({
      success: false,
      message: msg,
      code: 'INTERNAL_ERROR'
    });
  }
}
