import express from 'express';
import multer from 'multer';
import LeaveDocumentModel from '../model/leaveDocumentModel.js';
import {
  sendLeaveDocumentList,
  sendLeaveDocument,
  sendCreated,
  sendUpdated,
  sendDeleted,
  sendBadRequest,
  sendServerError,
  sendNotFound,
  sendConflict
} from '../view/leaveDocumentView.js';
import { parseGuid } from '../../../../utils/guidUtils.js';

// Configure multer for file uploads (memory storage - files stored in memory as Buffer)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Middleware to accept either 'file' or 'file_base64' field name
// maxCount: 1 ensures only one file per field, but we'll take the first if multiple are sent
const uploadFile = upload.fields([
  { name: 'file', maxCount: 10 }, // Allow multiple but we'll only use first
  { name: 'file_base64', maxCount: 10 } // Allow multiple but we'll only use first
]);

const router = express.Router();

router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

function getUserId(req) {
  return req.headers['x-user-id'] || req.user?.id || 'SYSTEM';
}

function parsePagination(query) {
  let page = 1;
  let pageSize = 10;

  if (query.page !== undefined) {
    const parsedPage = parseInt(query.page);
    if (isNaN(parsedPage) || parsedPage < 1) {
      throw new Error('Invalid page number. Must be a positive integer.');
    }
    page = parsedPage;
  }

  if (query.page_size !== undefined) {
    const parsedPageSize = parseInt(query.page_size);
    if (isNaN(parsedPageSize) || parsedPageSize < 1) {
      throw new Error('Invalid page_size. Must be a positive integer.');
    }
    pageSize = Math.min(100, parsedPageSize);
  }

  return { page, pageSize };
}

function buildPaginationMeta(page, pageSize, totalCount) {
  const totalPages = Math.ceil(totalCount / pageSize);
  return {
    page,
    pageSize,
    total: totalCount,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1
  };
}

function normalizeRequestBody(data) {
  if (!data || typeof data !== 'object') return data;

  const normalized = {};
  const keyMap = {
    'leave_request_id': 'LEAVE_REQUEST_ID',
    'leave_request_guid': 'LEAVE_REQUEST_GUID',
    'file_name': 'FILE_NAME',
    'file_type': 'FILE_TYPE',
    'file_size': 'FILE_SIZE',
    'description': 'DESCRIPTION'
  };

  for (const [key, value] of Object.entries(data)) {
    const upperKey = keyMap[key.toLowerCase()] || key.toUpperCase();
    normalized[upperKey] = value;
  }

  return normalized;
}

function validateLeaveDocumentData(data, isUpdate = false) {
  const errors = [];

  if (!isUpdate) {
    // Required fields for creation
    if (!data.LEAVE_REQUEST_ID || data.LEAVE_REQUEST_ID === null) {
      errors.push('leave_request_id is required');
    }
    if (!data.FILE_CONTENT) {
      errors.push('file is required');
    }
    if (!data.FILE_NAME) {
      errors.push('file_name is required');
    }
  } else {
    // For updates, validate only provided fields
    if (data.LEAVE_REQUEST_ID !== undefined && data.LEAVE_REQUEST_ID === null) {
      errors.push('leave_request_id cannot be null');
    }
  }

  // Validate LEAVE_REQUEST_ID if provided
  if (data.LEAVE_REQUEST_ID !== undefined && data.LEAVE_REQUEST_ID !== null) {
    const leaveRequestId = parseInt(data.LEAVE_REQUEST_ID);
    if (isNaN(leaveRequestId) || leaveRequestId < 1) {
      errors.push('leave_request_id must be a valid positive number');
    }
  }

  // Validate FILE_SIZE if provided
  if (data.FILE_SIZE !== undefined && data.FILE_SIZE !== null) {
    const fileSize = parseInt(data.FILE_SIZE);
    if (isNaN(fileSize) || fileSize < 0) {
      errors.push('file_size must be a valid non-negative number');
    }
    // Max file size: 10MB (10 * 1024 * 1024)
    if (fileSize > 10 * 1024 * 1024) {
      errors.push('file_size must not exceed 10MB');
    }
  }

  return errors;
}

/**
 * Parse file from request body
 * Supports base64 encoded file or Buffer
 */
function parseFileFromBody(req) {
  if (!req.body) return null;

  // Check if file is in base64 format
  if (req.body.file_base64) {
    const base64Data = req.body.file_base64;
    // Remove data URL prefix if present (e.g., "data:image/png;base64,")
    const base64String = base64Data.includes(',') 
      ? base64Data.split(',')[1] 
      : base64Data;
    return Buffer.from(base64String, 'base64');
  }

  // Check if file is already a Buffer (from raw body parser)
  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }

  // Check if file_content is provided as buffer data
  if (req.body.file_content) {
    if (Buffer.isBuffer(req.body.file_content)) {
      return req.body.file_content;
    }
    if (typeof req.body.file_content === 'string') {
      return Buffer.from(req.body.file_content, 'base64');
    }
  }

  return null;
}

/**
 * @route   GET /api/abs/leave-documents
 * @desc    Get all leave documents with optional filtering and pagination (metadata only)
 * @query   leaveRequestId - Filter by LEAVE_REQUEST_ID
 * @query   leaveRequestGuid - Filter by LEAVE_REQUEST_GUID (32-hex string)
 * @query   page - Page number (default: 1)
 * @query   page_size - Page size (default: 10, max: 100)
 */
router.get('/', async (req, res) => {
  try {
    const filters = {};

    // Filter by LEAVE_REQUEST_ID
    if (req.query.leaveRequestId) {
      filters.leaveRequestId = parseInt(req.query.leaveRequestId);
      if (isNaN(filters.leaveRequestId)) {
        return sendBadRequest(res, req, 'Invalid leaveRequestId parameter');
      }
    }

    // Filter by LEAVE_REQUEST_GUID
    if (req.query.leaveRequestGuid) {
      filters.leaveRequestGuid = req.query.leaveRequestGuid;
    }

    // Parse pagination
    try {
      filters.pagination = parsePagination(req.query);
    } catch (paginationError) {
      return sendBadRequest(res, req, paginationError.message);
    }

    const result = await LeaveDocumentModel.findAll(filters);
    const { documents, total } = result;

    // Build pagination metadata
    const paginationMeta = buildPaginationMeta(
      filters.pagination.page,
      filters.pagination.pageSize,
      total
    );

    sendLeaveDocumentList(res, req, documents, {
      total,
      pagination: paginationMeta
    });
  } catch (error) {
    console.error('=== LEAVE DOCUMENT FINDALL ERROR (CONTROLLER) ===');
    console.error('Error:', error);
    console.error('Error message:', error?.message);
    console.error('Error code:', error?.code);
    console.error('Oracle errorNum:', error?.errorNum);
    console.error('Full error:', JSON.stringify(error, null, 2));
    console.error('===============================================');
    sendServerError(res, req, 'Failed to fetch leave documents', error);
  }
});

/**
 * @route   GET /api/abs/leave-documents/by-leave-request/:leaveRequestId
 * @desc    Get all documents for a leave request (metadata only)
 */
router.get('/by-leave-request/:leaveRequestId', async (req, res) => {
  try {
    const leaveRequestId = parseInt(req.params.leaveRequestId);
    if (isNaN(leaveRequestId)) {
      return sendBadRequest(res, req, 'Invalid leaveRequestId parameter');
    }

    const documents = await LeaveDocumentModel.findByLeaveRequestId(leaveRequestId);
    sendLeaveDocumentList(res, req, documents, { total: documents.length });
  } catch (error) {
    sendServerError(res, req, 'Failed to fetch leave documents', error);
  }
});

/**
 * @route   GET /api/abs/leave-documents/:guid
 * @desc    Get a single leave document metadata by GUID (no file content)
 */
router.get('/:guid', async (req, res) => {
  try {
    let guidHex32;
    try {
      guidHex32 = parseGuid(req.params.guid, 'guid');
    } catch (parseError) {
      return sendBadRequest(res, req, parseError.message);
    }

    const document = await LeaveDocumentModel.findByGuid(guidHex32);

    if (!document) {
      return sendNotFound(res, req, 'Leave document not found');
    }

    sendLeaveDocument(res, req, document);
  } catch (error) {
    if (error.message?.includes('must be a 32-character hex GUID') || error.message?.includes('Invalid guid format')) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to fetch leave document', error);
  }
});

/**
 * @route   GET /api/abs/leave-documents/:guid/preview
 * @desc    Preview a leave document file in browser (inline display)
 */
router.get('/:guid/preview', async (req, res) => {
  try {
    let guidHex32;
    try {
      guidHex32 = parseGuid(req.params.guid, 'guid');
    } catch (parseError) {
      return sendBadRequest(res, req, parseError.message);
    }

    const document = await LeaveDocumentModel.findBlobByGuid(guidHex32);

    if (!document) {
      return sendNotFound(res, req, 'Leave document not found');
    }

    // Set headers for inline preview (view in browser)
    const contentType = document.fileType || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${document.fileName || 'document'}"`);
    
    // Convert FILE_SIZE_MB to bytes for Content-Length
    const fileSizeBytes = document.fileSizeMb ? Math.round(document.fileSizeMb * 1024 * 1024) : 0;
    if (fileSizeBytes > 0) {
      res.setHeader('Content-Length', fileSizeBytes);
    }
    
    // Cache control for preview
    res.setHeader('Cache-Control', 'private, max-age=3600');
    
    // Add CORS headers if needed for cross-origin preview
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Stream the BLOB/Buffer to response
    if (document.fileContent instanceof Buffer) {
      res.send(document.fileContent);
    } else {
      // If it's a LOB, handle streaming
      res.send(document.fileContent);
    }
  } catch (error) {
    if (error.message?.includes('must be a 32-character hex GUID') || error.message?.includes('Invalid guid format')) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to preview leave document', error);
  }
});

/**
 * @route   GET /api/abs/leave-documents/:guid/download
 * @desc    Download a leave document file (streams BLOB from database)
 */
router.get('/:guid/download', async (req, res) => {
  try {
    let guidHex32;
    try {
      guidHex32 = parseGuid(req.params.guid, 'guid');
    } catch (parseError) {
      return sendBadRequest(res, req, parseError.message);
    }

    const document = await LeaveDocumentModel.findBlobByGuid(guidHex32);

    if (!document) {
      return sendNotFound(res, req, 'Leave document not found');
    }

    // Set headers for file download
    res.setHeader('Content-Type', document.fileType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${document.fileName || 'document'}"`);
    // Convert FILE_SIZE_MB to bytes for Content-Length
    const fileSizeBytes = document.fileSizeMb ? Math.round(document.fileSizeMb * 1024 * 1024) : 0;
    res.setHeader('Content-Length', fileSizeBytes);
    res.setHeader('Cache-Control', 'private, max-age=3600');

    // Stream the BLOB/Buffer to response
    if (document.fileContent instanceof Buffer) {
      res.send(document.fileContent);
    } else {
      // If it's a LOB, handle streaming
      res.send(document.fileContent);
    }
  } catch (error) {
    if (error.message?.includes('must be a 32-character hex GUID') || error.message?.includes('Invalid guid format')) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to download leave document', error);
  }
});

/**
 * @route   POST /api/abs/leave-documents
 * @desc    Upload a new leave document
 * @body    multipart/form-data with fields:
 *          - file (required) - The file to upload
 *          - leave_request_id (required) - ID of the leave request
 *          - description (optional) - Document description
 */
router.post('/', uploadFile, async (req, res) => {
  try {
    let bodyData = {};
    let fileBuffer = null;
    let uploadedFile = null;

    // Handle multipart/form-data (from multer)
    // Check for either 'file' or 'file_base64' field name
    if (!req.files || (!req.files['file'] && !req.files['file_base64'])) {
      return sendBadRequest(res, req, 'No file provided. Please upload a file using multipart/form-data with "file" or "file_base64" field.');
    }

    // If multiple files are uploaded, only use the first one (we only allow one document per request)
    uploadedFile = req.files['file']?.[0] || req.files['file_base64']?.[0];
    
    if (!uploadedFile) {
      return sendBadRequest(res, req, 'File upload failed. Please ensure a valid file is provided.');
    }
    
    // Log if multiple files were provided (for debugging)
    const fileCount = req.files['file']?.length || req.files['file_base64']?.length || 0;
    if (fileCount > 1) {
      console.log(`Warning: ${fileCount} files uploaded, only using the first one.`);
    }

    fileBuffer = uploadedFile.buffer;
    // Use uploaded file's originalname and mimetype
    bodyData.FILE_NAME = uploadedFile.originalname || 'uploaded_file';
    bodyData.FILE_TYPE = uploadedFile.mimetype || 'application/octet-stream';
    bodyData.FILE_SIZE = uploadedFile.size;
    
    // Get other form fields
    if (req.body.leave_request_id) {
      bodyData.LEAVE_REQUEST_ID = req.body.leave_request_id;
    }
    if (req.body.description) {
      bodyData.DESCRIPTION = req.body.description;
    }

    // Normalize request body keys
    const normalizedBody = normalizeRequestBody(bodyData);

    // Add file data
    if (fileBuffer) {
      normalizedBody.FILE_CONTENT = fileBuffer;
      normalizedBody.FILE_SIZE = normalizedBody.FILE_SIZE || fileBuffer.length;
      if (!normalizedBody.FILE_NAME) {
        normalizedBody.FILE_NAME = 'uploaded_file';
      }
      if (!normalizedBody.FILE_TYPE) {
        normalizedBody.FILE_TYPE = 'application/octet-stream';
      }
    }

    // Validate required fields
    const errors = validateLeaveDocumentData(normalizedBody, false);
    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Normalize data values (remove DESCRIPTION as it's not in the table)
    const normalizedData = {
      LEAVE_REQUEST_ID: parseInt(normalizedBody.LEAVE_REQUEST_ID),
      FILE_CONTENT: normalizedBody.FILE_CONTENT,
      FILE_NAME: normalizedBody.FILE_NAME,
      FILE_TYPE: normalizedBody.FILE_TYPE || 'application/octet-stream',
      FILE_SIZE: normalizedBody.FILE_SIZE || normalizedBody.FILE_CONTENT.length
    };

    const userId = getUserId(req);
    const newDocument = await LeaveDocumentModel.create(normalizedData, userId);

    sendCreated(res, req, newDocument);
  } catch (error) {
    // Handle multer errors
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return sendBadRequest(res, req, 'File size exceeds 10MB limit');
      }
      return sendBadRequest(res, req, `File upload error: ${error.message}`);
    }
    
    if (error.code === 'FOREIGN_KEY_CONSTRAINT') {
      return sendBadRequest(res, req, error.message || 'Invalid foreign key reference');
    }
    if (error.code === 'NOT_NULL_CONSTRAINT') {
      return sendBadRequest(res, req, error.message || 'Required fields are missing');
    }
    if (error.code === 'TRIGGER_ERROR') {
      return sendServerError(res, req, error.message || 'Database trigger error', error);
    }
    if (error.message?.includes('Validation failed')) {
      return sendBadRequest(res, req, error.message);
    }
    // Log the full error for debugging
    console.error('=== LEAVE DOCUMENT UPLOAD ERROR (CONTROLLER) ===');
    console.error('Error:', error);
    console.error('Error message:', error?.message);
    console.error('Error code:', error?.code);
    console.error('Error stack:', error?.stack);
    console.error('Full error:', JSON.stringify(error, null, 2));
    console.error('================================================');
    
    sendServerError(res, req, 'Failed to upload leave document', error);
  }
});

/**
 * @route   PUT /api/abs/leave-documents/:guid
 * @desc    Update leave document metadata (not file content)
 * @body    { leave_request_id?, file_name?, description? }
 */
router.put('/:guid', async (req, res) => {
  try {
    let guidHex32;
    try {
      guidHex32 = parseGuid(req.params.guid, 'guid');
    } catch (parseError) {
      return sendBadRequest(res, req, parseError.message);
    }

    // Check if leave document exists
    const existingDocument = await LeaveDocumentModel.findByGuid(guidHex32);
    if (!existingDocument) {
      return sendNotFound(res, req, 'Leave document not found');
    }

    // Normalize request body keys (lowercase to uppercase)
    const normalizedBody = normalizeRequestBody(req.body);

    // Validate provided fields
    const errors = validateLeaveDocumentData(normalizedBody, true);
    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Normalize data values (only metadata, not file content)
    const normalizedData = {};
    if (normalizedBody.LEAVE_REQUEST_ID !== undefined) {
      normalizedData.LEAVE_REQUEST_ID = normalizedBody.LEAVE_REQUEST_ID !== null ? parseInt(normalizedBody.LEAVE_REQUEST_ID) : null;
    }
    if (normalizedBody.FILE_NAME !== undefined) {
      normalizedData.FILE_NAME = normalizedBody.FILE_NAME || null;
    }
    if (normalizedBody.DESCRIPTION !== undefined) {
      normalizedData.DESCRIPTION = normalizedBody.DESCRIPTION || null;
    }

    const userId = getUserId(req);
    const updatedDocument = await LeaveDocumentModel.updateByGuid(guidHex32, normalizedData, userId);

    sendUpdated(res, req, updatedDocument);
  } catch (error) {
    if (error.code === 'FOREIGN_KEY_CONSTRAINT') {
      return sendBadRequest(res, req, error.message || 'Invalid foreign key reference');
    }
    if (error.message?.includes('must be a 32-character hex GUID') || error.message?.includes('Invalid guid format')) {
      return sendBadRequest(res, req, error.message);
    }
    if (error.message?.includes('not found')) {
      return sendNotFound(res, req, error.message);
    }
    if (error.message?.includes('Validation failed')) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to update leave document', error);
  }
});

/**
 * @route   DELETE /api/abs/leave-documents/:guid
 * @desc    Delete a leave document by GUID (hard delete - removes BLOB and record)
 */
router.delete('/:guid', async (req, res) => {
  try {
    let guidHex32;
    try {
      guidHex32 = parseGuid(req.params.guid, 'guid');
    } catch (parseError) {
      return sendBadRequest(res, req, parseError.message);
    }

    // Check if leave document exists
    const existingDocument = await LeaveDocumentModel.findByGuid(guidHex32);
    if (!existingDocument) {
      return sendNotFound(res, req, 'Leave document not found');
    }

    await LeaveDocumentModel.deleteByGuid(guidHex32);

    sendDeleted(res, req, 'Leave document deleted successfully', guidHex32);
  } catch (error) {
    if (error.message?.includes('must be a 32-character hex GUID') || error.message?.includes('Invalid guid format')) {
      return sendBadRequest(res, req, error.message);
    }
    if (error.message?.includes('not found')) {
      return sendNotFound(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to delete leave document', error);
  }
});

export default router;
