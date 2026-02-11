/**
 * Controller: Update Employee (All-in-One)
 * PUT /api/update-employee/:idOrGuid (employee_id or employee_guid)
 *
 * Example request payloads:
 *
 * 1) ADD with file upload (multipart/form-data):
 *    PUT /api/update-employee/123
 *    Content-Type: multipart/form-data
 *    Body: doc_action=ADD, document_type_code=EMPLOYEE_DOC, file=<binary>
 *
 * 2) REPLACE by type with file upload (multipart/form-data):
 *    PUT /api/update-employee/123
 *    Body: doc_action=REPLACE, document_type_code=EMPLOYEE_DOC, file=<binary>
 *
 * 3) REPLACE specific document_id with file upload (multipart/form-data):
 *    PUT /api/update-employee/123
 *    Body: doc_action=REPLACE, replace_document_id=68, document_type_code=EMPLOYEE_DOC, file=<binary>
 *
 * 4) ADD with access_url (application/json):
 *    PUT /api/update-employee/123
 *    Content-Type: application/json
 *    Body: { "doc_action": "ADD", "document_type_code": "EMPLOYEE_DOC", "doc_access_url": "https://...", "doc_file_name": "contract.pdf" }
 */

import multer from 'multer';
import { updateEmployeeAllInOne, validateUpdateBody } from '../services/emplEmployeeAllInOneService.js';
import { getConnection } from '../config/db.js';
import { getEmplEmployeesList } from '../services/emplEmployeeListService.js';
import { getEmployeeListRowByEmployeeId } from '../feature/employees/controller/employeeController.js';
import EmployeeModel from '../feature/employees/model/employeeModel.js';

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
 * Body: JSON or multipart/form-data. Document fields:
 *   doc_action: 'ADD' | 'REPLACE' (default 'ADD')
 *   replace_document_id: number (optional; when REPLACE, target specific doc row)
 *   document_type_code: required for file upload or when doc_access_url provided
 *   doc_access_url, doc_file_name: required when adding doc by URL (no file)
 *   File: field name "file" or "document" (multipart only).
 * 200: { success: true, employee_id, document?: { document_id, document_guid, access_url, doc_action }, data? }
 * 400: validation or Oracle error
 * 404: employee not found
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
    body.doc_file_name = uploadedFile.originalname || 'document';
    body.doc_mime_type = uploadedFile.mimetype || 'application/octet-stream';
    const docType = body.document_type_code ?? body.documentTypeCode;
    if (!docType || String(docType).trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'document_type_code is required when uploading a file',
        code: 'VALIDATION_ERROR'
      });
    }
    body.document_type_code = String(docType).trim();
  } else {
    const docAccessUrl = body.doc_access_url ?? body.docAccessUrl;
    const docFileName = body.doc_file_name ?? body.docFileName;
    const docType = body.document_type_code ?? body.documentTypeCode;
    if (docAccessUrl != null && String(docAccessUrl).trim() !== '') {
      if (!docType || String(docType).trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'document_type_code is required when doc_access_url is provided',
          code: 'VALIDATION_ERROR'
        });
      }
      if (!docFileName || String(docFileName).trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'doc_file_name is required when doc_access_url is provided',
          code: 'VALIDATION_ERROR'
        });
      }
    }
  }

  const validation = validateUpdateBody(body, employeeId);
  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      message: validation.message,
      code: validation.code || 'VALIDATION_ERROR'
    });
  }

  let connection;
  try {
    connection = await getConnection();
    const fileOpts = uploadedFile
      ? {
          fileContent: uploadedFile.buffer,
          fileName: uploadedFile.originalname,
          mimeType: uploadedFile.mimetype
        }
      : {};
    const { documentId, documentGuid, docAction } = await updateEmployeeAllInOne(connection, employeeId, body, fileOpts);
    const data = await getEmployeeListRowByEmployeeId(parseInt(employeeId, 10));
    const accessUrl = documentGuid ? `/documents/${documentGuid}/download` : null;
    const document = documentGuid
      ? {
          document_id: documentId,
          document_guid: documentGuid,
          access_url: accessUrl,
          doc_action: docAction
        }
      : null;
    return res.status(200).json({
      success: true,
      employee_id: parseInt(employeeId, 10),
      document,
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
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) {}
    }
  }
}
