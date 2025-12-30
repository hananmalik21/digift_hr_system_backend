import { AppError } from './AppError.js';
import { ValidationError } from './ValidationError.js';
import { DatabaseError } from './DatabaseError.js';


/**
 * Centralized Error Handler
 * Formats error responses consistently across all APIs
 * 
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @returns {Object} Formatted error response
 */
export function formatErrorResponse(err, req = null) {

  // If error is not an AppError, wrap it
  if (!(err instanceof AppError)) {
    err = new AppError(
      'An unexpected error occurred. Please try again later.',
      500,
      'INTERNAL_ERROR',
      err.message || 'Unknown error'
    );
    // Preserve original error
    err.originalError = err;
  }

  // Build error details object
  const errorDetails = {
    message: err.technicalMessage || err.message,
    code: err.code,
    type: err.name || 'Error',
  };

  // Add stack trace
  if (err.stack) {
    errorDetails.stack = err.stack;
  }

  // Add specific error properties based on error type
  let userMessage = err.userMessage || err.message;
  
  if (err instanceof ValidationError && err.errors) {
    errorDetails.validation_errors = err.errors;
    // Use the first validation error as the user message
    const errorArray = Array.isArray(err.errors) ? err.errors : [err.errors];
    if (errorArray.length > 0) {
      userMessage = errorArray[0];
    }
  }

  if (err instanceof DatabaseError) {
    errorDetails.oracle_code = err.oracleCode;
    errorDetails.error_num = err.errorNum;
    if (err.oracleError) {
      errorDetails.original_error = {
        message: err.oracleError.message,
        errorNum: err.oracleError.errorNum,
        code: err.oracleError.code
      };
    }
  }

  // Build response object (no meta field)
  const response = {
    success: false,
    error: userMessage, // User-friendly message (first validation error for ValidationError)
    error_details: errorDetails // Technical details
  };

  return {
    statusCode: err.statusCode || 500,
    response
  };
}

/**
 * Send error response
 * Logs error and sends formatted response
 * 
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export function sendErrorResponse(err, req, res) {
  // Log error to console for server-side debugging
  console.error('\n❌ Error occurred:');
  console.error('Error Type:', err.name || 'Error');
  console.error('User Message:', err.userMessage || err.message);
  console.error('Technical Message:', err.technicalMessage || err.message);
  console.error('Status Code:', err.statusCode || 500);
  console.error('Error Code:', err.code);
  
  if (err.stack) {
    console.error('\nStack Trace:');
    console.error(err.stack);
  }

  if (err instanceof DatabaseError && err.oracleError) {
    console.error('\nOracle Error Details:');
    console.error('Error Number:', err.oracleError.errorNum);
    console.error('Oracle Code:', err.oracleCode);
    console.error('Original Message:', err.oracleError.message);
  }

  // Format and send error response
  const { statusCode, response } = formatErrorResponse(err, req);
  res.status(statusCode).json(response);
}

