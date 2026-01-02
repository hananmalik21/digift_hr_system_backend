import { AppError } from './AppError.js';
import { ValidationError } from './ValidationError.js';
import { DatabaseError } from './DatabaseError.js';

/**
 * Centralized Error Handler
 * Formats error responses consistently across all APIs
 * 
 * Required Error Response Format:
 * {
 *   "status": false,
 *   "message": "<user friendly error message>",
 *   "error": {
 *     "code": "<APP_ERROR_CODE or HTTP_CODE_NAME>",
 *     "details": <object|array|string|null>,
 *     "stack": <only in non-production>
 *   }
 * }
 * 
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export function sendErrorResponse(err, req, res) {
  // If error is not an AppError, wrap it
  if (!(err instanceof AppError)) {
    err = new AppError(
      'An unexpected error occurred. Please try again later.',
      500,
      'INTERNAL_ERROR',
      err.message || 'Unknown error'
    );
  }

  // Get user-friendly message
  let userMessage = err.userMessage || err.message || 'An error occurred';
  
  // Build error details object
  let errorDetails = null;

  // Handle ValidationError with validation errors array
  if (err instanceof ValidationError && err.errors) {
    const errorArray = Array.isArray(err.errors) ? err.errors : [err.errors];
    errorDetails = errorArray;
    // Use the first validation error as the user message if message is generic
    if (errorArray.length > 0 && (userMessage === 'Validation failed' || !userMessage)) {
      userMessage = errorArray[0];
    }
  }

  // Handle DatabaseError with specific details
  if (err instanceof DatabaseError) {
    errorDetails = {};
    if (err.oracleCode) {
      errorDetails.oracle_code = err.oracleCode;
    }
    if (err.errorNum !== undefined) {
      errorDetails.error_num = err.errorNum;
    }
    if (err.constraint) {
      errorDetails.constraint = err.constraint;
    }
    if (err.columns) {
      errorDetails.columns = err.columns;
    }
    if (err.oracleError) {
      errorDetails.original_error = {
        message: err.oracleError.message,
        errorNum: err.oracleError.errorNum,
        code: err.oracleError.code
      };
    }
    // If no details were added, set to null
    if (Object.keys(errorDetails).length === 0) {
      errorDetails = null;
    }
  }

  // Build error object
  const errorObject = {
    code: err.code || 'INTERNAL_ERROR',
    details: errorDetails
  };

  // Add stack trace only in non-production
  if (process.env.NODE_ENV !== 'production' && err.stack) {
    errorObject.stack = err.stack;
  }

  // Build and send response
  const response = {
    status: false,
    message: userMessage,
    error: errorObject
  };

  // Log error to console for server-side debugging
  console.error('\n❌ Error occurred:');
  console.error('Error Type:', err.name || 'Error');
  console.error('User Message:', userMessage);
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

  // Send formatted error response
  res.status(err.statusCode || 500).json(response);
}

/**
 * Format error response (kept for backward compatibility, but not used in new format)
 * @deprecated Use sendErrorResponse directly
 */
export function formatErrorResponse(err, req = null) {
  // This function is kept for backward compatibility
  // but the new format is handled directly in sendErrorResponse
  return {
    statusCode: err.statusCode || 500,
    response: {
      status: false,
      message: err.userMessage || err.message || 'An error occurred',
      error: {
        code: err.code || 'INTERNAL_ERROR',
        details: null
      }
    }
  };
}

