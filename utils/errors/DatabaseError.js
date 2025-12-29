import { AppError } from './AppError.js';

/**
 * Database Error
 * Thrown when database operations fail
 */
export class DatabaseError extends AppError {
  constructor(message, oracleError = null, userMessage = null) {
    const technicalMsg = oracleError?.message || message;
    const userFriendlyMsg = userMessage || DatabaseError.getUserFriendlyMessage(oracleError);
    
    super(
      userFriendlyMsg,
      DatabaseError.getStatusCode(oracleError),
      DatabaseError.getErrorCode(oracleError),
      technicalMsg
    );
    
    this.oracleError = oracleError;
    this.errorNum = oracleError?.errorNum;
    this.oracleCode = this.constructor.getOracleCode(oracleError);
    this.constraint = this.constructor.extractConstraint(oracleError);
    this.columns = this.constructor.extractColumns(oracleError);
  }

  /**
   * Get user-friendly message based on Oracle error code
   */
  static getUserFriendlyMessage(oracleError) {
    if (!oracleError) {
      return 'A database error occurred. Please try again later.';
    }

    const errorNum = oracleError.errorNum;
    const message = oracleError.message || '';

    // Unique constraint violation
    if (errorNum === 1 || message.includes('ORA-00001') || message.includes('unique constraint')) {
      const constraint = DatabaseError.extractConstraint(oracleError);
      if (constraint) {
        return `This record already exists. The ${constraint} constraint is violated.`;
      }
      return 'This record already exists. Please check for duplicate entries.';
    }

    // Foreign key constraint - parent key not found
    if (errorNum === 2291 || message.includes('ORA-02291')) {
      return 'The referenced record does not exist. Please check your input.';
    }

    // Foreign key constraint - child record exists
    if (errorNum === 2292 || message.includes('ORA-02292')) {
      return 'Cannot delete this record because it is referenced by other records.';
    }

    // Not null constraint
    if (errorNum === 1400 || message.includes('ORA-01400')) {
      return 'Required fields are missing. Please provide all required information.';
    }

    // Check constraint violation
    if (errorNum === 2290 || message.includes('ORA-02290')) {
      return 'The provided data violates a validation rule. Please check your input.';
    }

    // Invalid number
    if (errorNum === 1722 || message.includes('ORA-01722')) {
      return 'Invalid numeric value provided. Please check your input.';
    }

    // Date format error
    if (errorNum === 1847 || message.includes('ORA-01847')) {
      return 'Invalid date format. Please provide a valid date.';
    }

    // Default database error
    return 'A database error occurred. Please try again later.';
  }

  /**
   * Get HTTP status code based on Oracle error
   */
  static getStatusCode(oracleError) {
    if (!oracleError) return 500;

    const errorNum = oracleError.errorNum;
    const message = oracleError.message || '';

    if (errorNum === 1 || message.includes('ORA-00001')) return 409; // Conflict
    if (errorNum === 2291 || message.includes('ORA-02291')) return 400; // Bad Request
    if (errorNum === 2292 || message.includes('ORA-02292')) return 409; // Conflict
    if (errorNum === 1400 || message.includes('ORA-01400')) return 400; // Bad Request
    if (errorNum === 2290 || message.includes('ORA-02290')) return 400; // Bad Request

    return 500; // Internal Server Error
  }

  /**
   * Get error code based on Oracle error
   */
  static getErrorCode(oracleError) {
    if (!oracleError) return 'DATABASE_ERROR';

    const errorNum = oracleError.errorNum;
    const message = oracleError.message || '';

    if (errorNum === 1 || message.includes('ORA-00001')) return 'UNIQUE_CONSTRAINT_VIOLATION';
    if (errorNum === 2291 || message.includes('ORA-02291')) return 'FOREIGN_KEY_CONSTRAINT';
    if (errorNum === 2292 || message.includes('ORA-02292')) return 'FOREIGN_KEY_CONSTRAINT';
    if (errorNum === 1400 || message.includes('ORA-01400')) return 'NOT_NULL_CONSTRAINT';
    if (errorNum === 2290 || message.includes('ORA-02290')) return 'CHECK_CONSTRAINT_VIOLATION';

    return 'DATABASE_ERROR';
  }

  /**
   * Extract Oracle error code
   */
  static getOracleCode(oracleError) {
    if (!oracleError) return null;

    const message = oracleError.message || '';
    const match = message.match(/ORA-(\d{5})/);
    return match ? `ORA-${match[1]}` : null;
  }

  /**
   * Extract constraint name from error message
   */
  static extractConstraint(oracleError) {
    if (!oracleError) return null;

    const message = oracleError.message || '';
    // Try to match constraint name in parentheses
    const match = message.match(/\(([A-Z_][A-Z0-9_.]+)\)/);
    return match ? match[1] : null;
  }

  /**
   * Extract column names from error message
   */
  static extractColumns(oracleError) {
    if (!oracleError) return null;

    const message = oracleError.message || '';
    // Try to match columns in parentheses after "columns"
    const match = message.match(/columns?\s*\(([^)]+)\)/i);
    if (match) {
      return match[1].split(',').map(col => col.trim());
    }
    return null;
  }
}

