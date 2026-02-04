import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import EmployeeModel from '../model/employeeModel.js';
import { getConnection } from '../../../config/db.js';
import {
  validateRequired,
  createEmployeeAllInOne,
  fromBody,
  fromBodyKeyContains
} from '../services/employeeCreateAllInOneService.js';
import {
  sendEmployeeList,
  sendEmployee,
  sendCreated,
  sendUpdated,
  sendDeleted,
  sendBadRequest,
  sendServerError,
  sendNotFound
} from '../view/employeeView.js';
import { ValidationError, NotFoundError } from '../../../utils/errors/index.js';
import { asyncHandler } from '../../../middleware/asyncHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Upload dir for all-in-one document (create if missing)
const UPLOADS_EMPLOYEES_DIR = path.resolve(__dirname, '../../../../uploads/employees');
if (!fs.existsSync(UPLOADS_EMPLOYEES_DIR)) {
  fs.mkdirSync(UPLOADS_EMPLOYEES_DIR, { recursive: true });
}

const uploadAllInOne = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, true)
}).single('document');

/** Only run multer when request is multipart (form-data with optional file). */
function maybeMulterAllInOne(req, res, next) {
  const contentType = (req.headers['content-type'] || '').toLowerCase();
  if (!contentType.includes('multipart/form-data')) {
    return next();
  }
  uploadAllInOne(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'File too large (max 10MB)'
        : (err.message || 'File upload error');
      return res.status(400).json({ success: false, message: msg, details: err.code || null });
    }
    next();
  });
}

// Middleware to track request start time for execution time calculation
router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

/**
 * Get enterprise ID from request
 * Checks query params, body, or environment variable
 */
function getEnterprise(req) {
  const v = req.query.enterprise_id ?? req.body.ENTERPRISE_ID ?? process.env.DEFAULT_ENTERPRISE_ID;
  return Number(v);
}

/**
 * Extract user ID from request
 */
function getUserId(req) {
  return req.headers['x-user-id'] || req.user?.id || 'SYSTEM';
}

/**
 * Map create-employee (all-in-one) Oracle errors to user-friendly messages.
 * @param {string} message - Raw error message
 * @returns {{ message: string, status?: number }}
 */
function getCreateEmployeeFriendlyMessage(message) {
  const m = String(message);

  // Civil ID duplicate (ORA-00001 / UK_DEMO_CIVILID)
  const isCivilIdConstraint = (m.includes('ORA-00001') || m.includes('UK_DEMO_CIVILID') || m.includes('CIVIL_ID_NUMBER')) && m.includes('already exists');
  if (isCivilIdConstraint) {
    const isNullConflict = /CIVIL_ID_NUMBER\s*:\s*NULL/i.test(m);
    return {
      message: isNullConflict
        ? 'Another employee already exists for this enterprise with no Civil ID. Provide a unique civil_id_number for this employee.'
        : 'An employee with this civil ID already exists for this enterprise. Please use a unique civil ID.',
      status: 409
    };
  }

  // ORA-20001: EMAIL already exists for this enterprise
  if (m.includes('ORA-20001') && /EMAIL\s+already\s+exists\s+for\s+this\s+enterprise/i.test(m)) {
    return {
      message: 'An employee with this email already exists for this enterprise. Please use a different email.',
      status: 409
    };
  }

  // Other ORA-20001: use the last (most specific) ORA-20001 message as the user message
  if (m.includes('ORA-20001')) {
    const match = m.match(/ORA-20001:\s*([^.\n]+(?:\.|$))/g);
    const last = match ? match[match.length - 1] : null;
    const text = last ? last.replace(/^ORA-20001:\s*/i, '').trim() : m;
    return { message: text || 'Employee creation failed. Please check your data and try again.' };
  }

  return { message: m };
}

/**
 * Validation helper
 */
function validateEmployeeData(data, isUpdate = false) {
  const errors = [];

  const firstName = data.FIRST_NAME_EN ?? data.FIRST_NAME;
  const lastName = data.LAST_NAME_EN ?? data.LAST_NAME;

  if (!isUpdate) {
    // Required fields for creation
    if (!firstName || String(firstName).trim() === '') {
      errors.push('FIRST_NAME_EN (or FIRST_NAME) is required');
    }
    if (!lastName || String(lastName).trim() === '') {
      errors.push('LAST_NAME_EN (or LAST_NAME) is required');
    }
    if (!data.EMAIL || data.EMAIL.trim() === '') {
      errors.push('EMAIL is required');
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.EMAIL)) {
        errors.push('EMAIL must be a valid email address');
      }
    }
    if (!data.PHONE_NUMBER || data.PHONE_NUMBER.trim() === '') {
      errors.push('PHONE_NUMBER is required');
    }
    if (!data.DATE_OF_BIRTH) {
      errors.push('DATE_OF_BIRTH is required');
    } else {
      const dob = new Date(data.DATE_OF_BIRTH);
      if (isNaN(dob.getTime())) {
        errors.push('DATE_OF_BIRTH must be a valid date');
      }
    }
  } else {
    // For updates, validate only provided fields
    if ((data.FIRST_NAME_EN ?? data.FIRST_NAME) !== undefined && String(data.FIRST_NAME_EN ?? data.FIRST_NAME).trim() === '') {
      errors.push('FIRST_NAME_EN cannot be empty');
    }
    if ((data.LAST_NAME_EN ?? data.LAST_NAME) !== undefined && String(data.LAST_NAME_EN ?? data.LAST_NAME).trim() === '') {
      errors.push('LAST_NAME_EN cannot be empty');
    }
    if (data.EMAIL !== undefined) {
      if (data.EMAIL.trim() === '') {
        errors.push('EMAIL cannot be empty');
      } else {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(data.EMAIL)) {
          errors.push('EMAIL must be a valid email address');
        }
      }
    }
    if (data.PHONE_NUMBER !== undefined && data.PHONE_NUMBER.trim() === '') {
      errors.push('PHONE_NUMBER cannot be empty');
    }
    if (data.DATE_OF_BIRTH !== undefined) {
      const dob = new Date(data.DATE_OF_BIRTH);
      if (isNaN(dob.getTime())) {
        errors.push('DATE_OF_BIRTH must be a valid date');
      }
    }
  }

  // Validate STATUS if provided
  if (data.STATUS !== undefined) {
    const validStatuses = ['DRAFT', 'ACTIVE', 'INACTIVE', 'TERMINATED'];
    if (!validStatuses.includes(String(data.STATUS).toUpperCase())) {
      errors.push(`STATUS must be one of: ${validStatuses.join(', ')}`);
    }
  }

  // Validate IS_ACTIVE if provided
  if (data.IS_ACTIVE !== undefined) {
    const validValues = ['Y', 'N', true, false, 'true', 'false'];
    const value = String(data.IS_ACTIVE).toUpperCase();
    if (!validValues.includes(value) && value !== 'TRUE' && value !== 'FALSE') {
      errors.push('IS_ACTIVE must be Y/N or true/false');
    }
  }

  return errors;
}

/**
 * @route   GET /api/employees
 * @desc    Get all employees
 * @query   enterprise_id - Required. Filter by enterprise ID (must match the enterprise_id used when creating the employee)
 * @query   is_active - Filter by active status (true/false)
 * @query   status - Filter by status
 * @query   email - Search by email (partial match, case-insensitive)
 * @query   name - Search by name (partial match, case-insensitive)
 * @query   page - Page number (default: 1)
 * @query   page_size - Number of items per page (default: 10, max: 100)
 * @access  Public
 */
router.get('/', asyncHandler(async (req, res) => {
  try {
    const filters = {};
    const appliedFilters = {};
    
    const enterpriseId = getEnterprise(req);
    if (!enterpriseId || isNaN(enterpriseId)) {
      return sendBadRequest(res, req, 'ENTERPRISE_ID is required');
    }
    filters.enterpriseId = enterpriseId;
    appliedFilters.enterprise_id = enterpriseId;

  if (req.query.is_active !== undefined) {
    filters.isActive = req.query.is_active === 'true' || req.query.is_active === '1';
    appliedFilters.is_active = filters.isActive;
  }

  if (req.query.status) {
    filters.status = req.query.status;
    appliedFilters.status = filters.status;
  }

  if (req.query.email) {
    filters.email = req.query.email;
    appliedFilters.email = filters.email;
  }

  if (req.query.name) {
    filters.name = req.query.name;
    appliedFilters.name = filters.name;
  }

  // Parse pagination parameters
  let page = 1;
  let pageSize = 10;
  
    if (req.query.page !== undefined) {
      const parsedPage = parseInt(req.query.page);
      if (isNaN(parsedPage) || parsedPage < 1) {
        return sendBadRequest(res, req, 'Invalid page number. Must be a positive integer.');
      }
      page = parsedPage;
    }
    
    if (req.query.page_size !== undefined || req.query.limit !== undefined) {
      const parsedPageSize = parseInt(req.query.page_size || req.query.limit);
      if (isNaN(parsedPageSize) || parsedPageSize < 1) {
        return sendBadRequest(res, req, 'Invalid page_size. Must be a positive integer.');
      }
      pageSize = Math.min(100, parsedPageSize);
    }

  filters.pagination = {
    page,
    pageSize
  };

  const result = await EmployeeModel.findAll(filters);
  
  // Calculate pagination metadata
  const totalCount = result.total || result.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  const hasNext = page < totalPages;
  const hasPrevious = page > 1;
  
  const employees = result.employees || result;
  
  sendEmployeeList(res, req, employees, {
    ...(Object.keys(appliedFilters).length > 0 && { filters: appliedFilters }),
    pagination: {
      page,
      pageSize,
      total: totalCount,
      totalPages,
      hasNext,
      hasPrevious
    }
  });
  } catch (error) {
    sendServerError(res, req, 'Failed to fetch employees', error);
  }
}));

/**
 * @route   GET /api/employees/by-guid/:guid
 * @desc    Get single employee by GUID
 * @param   guid - Employee GUID (32-char hex)
 * @access  Public
 */
router.get('/by-guid/:guid', asyncHandler(async (req, res) => {
  try {
    const employee = await EmployeeModel.findByGuidHex(req.params.guid);
    sendEmployee(res, req, employee);
  } catch (error) {
    if (error instanceof ValidationError) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to fetch employee', error);
  }
}));

/**
 * Helper function to check if a string is a 32-character hex GUID
 */
function isHex32(v) {
  return typeof v === 'string' && /^[0-9a-fA-F]{32}$/.test(v.replace(/-/g, ''));
}

/**
 * Helper function to normalize GUID (remove hyphens, uppercase)
 */
function normalizeHex32(v) {
  return typeof v === 'string' ? v.trim().replace(/-/g, '').toUpperCase() : v;
}

/**
 * @route   GET /api/employees/:id
 * @desc    Get single employee by ID or GUID
 * @param   id - Employee ID (numeric) or GUID (32-char hex)
 * @access  Public
 */
router.get('/:id', asyncHandler(async (req, res) => {
  try {
    const idParam = req.params.id;
    const normalizedId = normalizeHex32(idParam);
    
    // Check if it's a GUID (32-char hex)
    if (isHex32(normalizedId)) {
      const employee = await EmployeeModel.findByGuidHex(normalizedId);
      sendEmployee(res, req, employee);
      return;
    }
    
    // Otherwise, treat as numeric ID
    const enterpriseId = getEnterprise(req);
    if (!enterpriseId || isNaN(enterpriseId)) {
      return sendBadRequest(res, req, 'ENTERPRISE_ID is required');
    }

    const employeeId = parseInt(idParam);
    
    if (isNaN(employeeId)) {
      return sendBadRequest(res, req, 'Invalid EMPLOYEE_ID format. Must be numeric ID or 32-character GUID');
    }

    const employee = await EmployeeModel.findById(enterpriseId, employeeId);
    sendEmployee(res, req, employee);
  } catch (error) {
    if (error instanceof ValidationError) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to fetch employee', error);
  }
}));

/**
 * @route   POST /api/employees
 * @desc    Create a new employee
 * @body    { FIRST_NAME, LAST_NAME, EMAIL, PHONE_NUMBER, DATE_OF_BIRTH, ... }
 * @access  Public
 */
/**
 * @route   POST /api/create-employee
 * @desc    Create employee via EMPL.EMPL_EMPLOYEE_CREATE_API_PKG.CREATE_EMPLOYEE_ALL_IN_ONE (all logic in PL/SQL)
 * @body    Example request JSON (see below)
 * @access  Public
 *
 * Example request JSON:
 * {
 *   "enterprise_id": 1,
 *   "first_name_en": "Ahmed",
 *   "last_name_en": "Ali",
 *   "email": "ahmed.ali@example.com",
 *   "phone_number": "+96550000000",
 *   "date_of_birth": "1990-05-15",
 *   "gender_code": "M",
 *   "nationality": "KW",
 *   "contact_name": "Sara Ali",
 *   "relationship": "Spouse",
 *   "emerg_phone": "+96551111111",
 *   "work_schedule_id": 1,
 *   "bank_code": "BANK01",
 *   "account_number": "1234567890",
 *   "org_unit_id_hex": "A1B2C3D4E5F60718293A4B5C6D7E8F90",
 *   "enterprise_hire_date": "2024-01-01",
 *   "contract_type_code": "FULL_TIME",
 *   "employment_status": "ACTIVE",
 *   "housing_kwd": 150,
 *   "transport_kwd": 50,
 *   "other_kwd": 0
 * }
 *
 * Form-data (multipart): same fields as form fields + optional file field "document".
 * When "document" is uploaded, doc_file_name, doc_mime_type, doc_access_url, doc_hash_sha256 are set from the file.
 */
async function createEmployeeAllInOneHandler(req, res) {
  const body = { ...(req.body || {}) };

  // Force-read from raw req.body (form-data keys can vary)
  const raw = req.body || {};
  const civilVal = fromBody(raw, 'civil_id_number', 'civilIdNumber', 'CIVIL_ID_NUMBER', 'civil_id', 'CIVIL_ID', 'civil_number', 'civilID');
  let passportVal = fromBody(raw, 'passport_number', 'passportNumber', 'PASSPORT_NUMBER', 'passport', 'PASSPORT', 'passport_no', 'passportNo', 'PASSPORT_NO');
  if (passportVal == null) passportVal = fromBodyKeyContains(raw, 'passport');
  const visaVal = fromBody(raw, 'visa_number', 'visaNumber', 'VISA_NUMBER', 'visa_no', 'visaNo', 'VISA_NO');
  const visaExpiryVal = raw.visa_expiry ?? raw.visaExpiry ?? raw.VISA_EXPIRY;
  const workPermitNumVal = fromBody(raw, 'work_permit_number', 'workPermitNumber', 'WORK_PERMIT_NUMBER', 'work_permit_no', 'workPermitNo');
  const workPermitExpiryVal = raw.work_permit_expiry ?? raw.workPermitExpiry ?? raw.WORK_PERMIT_EXPIRY ?? raw.work_permit_expiry_date ?? raw.workPermitExpiryDate;
  if (civilVal != null) body.civil_id_number = civilVal;
  if (passportVal != null) body.passport_number = passportVal;
  if (visaVal != null) body.visa_number = visaVal;
  if (visaExpiryVal != null && String(visaExpiryVal).trim() !== '' && String(visaExpiryVal).toLowerCase() !== 'null') body.visa_expiry = visaExpiryVal;
  if (workPermitNumVal != null) body.work_permit_number = workPermitNumVal;
  if (workPermitExpiryVal != null && String(workPermitExpiryVal).trim() !== '' && String(workPermitExpiryVal).toLowerCase() !== 'null') body.work_permit_expiry = workPermitExpiryVal;

  // If a file was uploaded, save it, compute hash, and set document fields for the procedure
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
    if (body.document_type_code == null || body.document_type_code === '') {
      body.document_type_code = 'EMPLOYEE_DOC';
    }
  }

  const validation = validateRequired(body);
  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      message: `Missing or invalid required field(s): ${validation.missing.join(', ')}`,
      details: null
    });
  }

  const enterpriseId = Number(body.enterprise_id ?? body.ENTERPRISE_ID ?? getEnterprise(req));
  let connection;
  try {
    connection = await getConnection();
    const { employeeId } = await createEmployeeAllInOne(connection, body);
    const employee = await EmployeeModel.findById(enterpriseId, employeeId);
    res.status(201).json({
      success: true,
      employee_id: employeeId,
      employee: employee || { employee_id: employeeId }
    });
  } catch (err) {
    const message = err.message || String(err);
    const friendly = getCreateEmployeeFriendlyMessage(message);
    const status = friendly.status ?? 500;
    const details = err.errorNum != null
      ? `ORA-${String(err.errorNum).padStart(5, '0')}: ${message}`
      : message;
    return res.status(status).json({
      success: false,
      message: friendly.message,
      details
    });
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) {}
    }
  }
}

// Canonical URL: POST {{baseUrl}}/api/create-employee
const createEmployeeRouter = express.Router();
createEmployeeRouter.post('/create-employee', maybeMulterAllInOne, asyncHandler(createEmployeeAllInOneHandler));

router.post('/', asyncHandler(async (req, res) => {
  try {
    const data = req.body;
    const errors = validateEmployeeData(data, false);

    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    const enterpriseId = getEnterprise(req);
    if (!enterpriseId || isNaN(enterpriseId)) {
      return sendBadRequest(res, req, 'ENTERPRISE_ID is required');
    }

    const userId = getUserId(req);
    const newEmployee = await EmployeeModel.create(data, enterpriseId, userId);
    sendCreated(res, req, newEmployee);
  } catch (error) {
    if (error instanceof ValidationError) {
      return sendBadRequest(res, req, error.message || 'Validation failed');
    }
    sendServerError(res, req, 'Failed to create employee', error);
  }
}));

/**
 * @route   PUT /api/employees/:id
 * @desc    Update an existing employee
 * @param   id - Employee ID (numeric) or GUID (32-char hex)
 * @body    { FIRST_NAME?, LAST_NAME?, EMAIL?, ... }
 * @access  Public
 */
router.put('/:id', asyncHandler(async (req, res) => {
  try {
    const idParam = req.params.id;
    const normalizedId = normalizeHex32(idParam);
    
    let enterpriseId;
    let employeeId;
    let employeeGuid = null;
    
    // Check if it's a GUID (32-char hex)
    if (isHex32(normalizedId)) {
      // For GUID lookup, we need to find the employee first to get enterprise_id
      const existingEmployee = await EmployeeModel.findByGuidHex(normalizedId);
      if (!existingEmployee) {
        return sendEmployee(res, req, null);
      }
      enterpriseId = existingEmployee.enterprise_id;
      employeeId = existingEmployee.employee_id;
      employeeGuid = normalizedId;
    } else {
      // Otherwise, treat as numeric ID
      enterpriseId = getEnterprise(req);
      if (!enterpriseId || isNaN(enterpriseId)) {
        return sendBadRequest(res, req, 'ENTERPRISE_ID is required');
      }

      employeeId = parseInt(idParam);
      
      if (isNaN(employeeId)) {
        return sendBadRequest(res, req, 'Invalid EMPLOYEE_ID format. Must be numeric ID or 32-character GUID');
      }
    }

    const data = req.body;
    const errors = validateEmployeeData(data, true);

    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Check if employee exists (if not already checked for GUID)
    if (!employeeGuid) {
      const existingEmployee = await EmployeeModel.findById(enterpriseId, employeeId);
      if (!existingEmployee) {
        return sendEmployee(res, req, null);
      }
    }

    const userId = getUserId(req);
    const updatedEmployee = await EmployeeModel.update(enterpriseId, employeeId, data, userId);
    sendUpdated(res, req, updatedEmployee);
  } catch (error) {
    if (error instanceof ValidationError) {
      return sendBadRequest(res, req, error.message || 'Validation failed');
    }
    sendServerError(res, req, 'Failed to update employee', error);
  }
}));

/**
 * @route   DELETE /api/employees/:id
 * @desc    Delete an employee (hard delete)
 * @param   id - Employee ID (numeric) or GUID (32-char hex)
 * @access  Public
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  try {
    const idParam = req.params.id;
    const normalizedId = normalizeHex32(idParam);
    
    let enterpriseId;
    let employeeId;
    
    let employeeToDelete;
    
    // Check if it's a GUID (32-char hex)
    if (isHex32(normalizedId)) {
      // For GUID lookup, we need to find the employee first to get enterprise_id and employee_id
      employeeToDelete = await EmployeeModel.findByGuidHex(normalizedId);
      if (!employeeToDelete) {
        return sendEmployee(res, req, null);
      }
      enterpriseId = employeeToDelete.enterprise_id;
      employeeId = employeeToDelete.employee_id;
    } else {
      // Otherwise, treat as numeric ID
      enterpriseId = getEnterprise(req);
      if (!enterpriseId || isNaN(enterpriseId)) {
        return sendBadRequest(res, req, 'ENTERPRISE_ID is required');
      }

      employeeId = parseInt(idParam);
      
      if (isNaN(employeeId)) {
        return sendBadRequest(res, req, 'Invalid EMPLOYEE_ID format. Must be numeric ID or 32-character GUID');
      }
      
      // Get the employee data before deleting
      employeeToDelete = await EmployeeModel.findById(enterpriseId, employeeId);
      if (!employeeToDelete) {
        return sendEmployee(res, req, null);
      }
    }

    // Delete the employee
    const result = await EmployeeModel.remove(enterpriseId, employeeId);
    sendDeleted(res, req, 'Employee deleted successfully', employeeToDelete);
  } catch (error) {
    sendServerError(res, req, 'Failed to delete employee', error);
  }
}));

export default router;
export { createEmployeeRouter };
