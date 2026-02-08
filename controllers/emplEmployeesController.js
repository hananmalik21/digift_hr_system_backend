/**
 * Controller: Update Employee (All-in-One)
 * PUT /api/update-employee/:employeeId
 */

import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { updateEmployeeAllInOne, validateUpdateBody } from '../services/emplEmployeeAllInOneService.js';
import { getEmployeeListRowByEmployeeId } from '../feature/employees/controller/employeeController.js';

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
 * PUT /api/update-employee/:employeeId
 * Body: JSON or multipart/form-data (same field names as create, snake_case).
 * Optional file field "document" to update employee document.
 * 200: { success: true, employee_id, data? }
 * 400: { success: false, message, code } on validation or Oracle ORA- / -20001
 * 500: on unexpected error
 */
export async function updateEmployeeAllInOneHandler(req, res) {
  const employeeId = req.params.employeeId;
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
