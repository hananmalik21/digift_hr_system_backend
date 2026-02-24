/**
 * Controller: Update Employee (All-in-One)
 * PUT /api/update-employee/:idOrGuid — see handler JSDoc for body/response.
 */

import multer from 'multer';
import { updateEmployeeAllInOne, validateUpdateBody } from '../services/emplEmployeeAllInOneService.js';
import { getConnection } from '../config/db.js';
import { getEmplEmployeesList } from '../services/emplEmployeeListService.js';
import { getEmployeeListRowByEmployeeId } from '../feature/employee_management/employees/controller/employeeController.js';
import EmployeeModel from '../feature/employee_management/employees/model/employeeModel.js';

const ORA_ERROR_REGEX = /ORA-\d{5}|-20001/;

const uploadAllInOne = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, true)
}).fields([{ name: 'file', maxCount: 1 }, { name: 'document', maxCount: 1 }]);

function getUploadedFile(req) {
  const files = req.files;
  if (!files) return null;
  return files.file?.[0] ?? files.document?.[0] ?? null;
}

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
        : err.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Use only one file field: "file" or "document"'
          : (err.message || 'File upload error');
      return res.status(400).json({ success: false, message: msg, code: 'UPLOAD_ERROR' });
    }
    next();
  });
}

/**
 * PUT /api/update-employee/:idOrGuid
 * :idOrGuid = employee_id (number) or employee_guid (32-char hex).
 * Body: JSON or multipart/form-data. Required: enterprise_id. All document fields optional.
 *   first_name_ar, middle_name_ar, last_name_ar (Arabic names) are optional.
 *   doc_action: 'ADD' | 'REPLACE' (default 'ADD')
 *   replace_document_id: number (optional; when REPLACE, target specific doc row)
 *   document_type_code, doc_file_name, doc_mime_type, doc_access_url, doc_hash_sha256, doc_file_content: optional
 *   File: field name "file" or "document" (multipart only); optional.
 * 200: { success: true, employee_id, data? } or with document: { documentId, documentGuid } when a doc op was performed
 * 400: validation or Oracle error
 * 404: employee not found
 */
export async function updateEmployeeAllInOneHandler(req, res) {
  const param = String(req.params.idOrGuid ?? '').trim();
  const hex = param.replace(/-/g, '').toUpperCase();
  const isNumericId = /^\d+$/.test(param);
  const isGuid = hex.length === 32 && /^[0-9A-F]+$/.test(hex);

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
  body.doc_action = body.doc_action ?? body.docAction ?? 'ADD';
  const replaceDocIdRaw = body.replace_document_id ?? body.replaceDocumentId;
  if (replaceDocIdRaw !== undefined && replaceDocIdRaw !== null && replaceDocIdRaw !== '') {
    const n = Number(replaceDocIdRaw);
    body.replace_document_id = Number.isFinite(n) ? n : null;
  } else {
    body.replace_document_id = null;
  }

  const uploadedFile = getUploadedFile(req);
  if (uploadedFile) {
    body.doc_file_name = uploadedFile.originalname?.trim() || undefined;
    body.doc_mime_type = uploadedFile.mimetype?.trim() || undefined;
    const docType = body.document_type_code ?? body.documentTypeCode;
    if (docType != null && String(docType).trim() !== '') body.document_type_code = String(docType).trim();
    if (body.doc_access_url != null || body.docAccessUrl != null) body.doc_access_url = null;
  }

  const validation = validateUpdateBody(body, employeeId);
  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      message: validation.message,
      code: validation.code || 'VALIDATION_ERROR'
    });
  }

  const empId = Number(employeeId);
  let connection;
  try {
    connection = await getConnection();
    const fileOpts = uploadedFile
      ? { fileContent: uploadedFile.buffer, fileName: uploadedFile.originalname, mimeType: uploadedFile.mimetype }
      : {};
    const { documentId, documentGuid } = await updateEmployeeAllInOne(connection, employeeId, body, fileOpts);
    const data = await getEmployeeListRowByEmployeeId(empId);
    const payload = { success: true, employee_id: empId, ...(data != null && { data }) };
    if (documentId != null || documentGuid != null) {
      payload.document = { documentId: documentId ?? null, documentGuid: documentGuid ?? null };
    }
    return res.status(200).json(payload);
  } catch (err) {
    const msg = err?.message ?? String(err);
    const isOracle = err?.errorNum != null || ORA_ERROR_REGEX.test(msg);
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
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) {}
    }
  }
}
