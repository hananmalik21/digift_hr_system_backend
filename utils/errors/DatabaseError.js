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
      
      // Map specific constraint names to user-friendly messages
      if (constraint) {
        // Remove schema prefix if present (e.g., "ENT.TM_SHIFTS_U1" -> "TM_SHIFTS_U1")
        const constraintName = constraint.includes('.') 
          ? constraint.split('.').pop() 
          : constraint;
        
        const constraintMessages = {
          'TM_SHIFTS_U1': 'A shift with this code already exists for this tenant.',
          'TM_SHIFTS_PK': 'This shift already exists.',
          'TM_WORK_PATTERNS_U1': 'Pattern code already exists for this tenant.',
          'TM_WORK_PATTERNS_PK': 'This work pattern already exists.',
          'TM_WORK_SCHEDULES_U1': 'A work schedule with this code already exists for this tenant.',
          'TM_WORK_SCHEDULES_PK': 'This work schedule already exists.',
          'TM_WORK_SCHEDULE_LINES_U1': 'A day of week already exists for this work schedule.',
          'TM_SCHEDULE_ASSIGNMENTS_U1': 'A schedule assignment already exists for this combination.',
          'TM_SCHEDULE_ASSIGNMENTS_PK': 'This schedule assignment already exists.',
          'COMPANIES_U1': 'A company with this code already exists.',
          'COMPANIES_PK': 'This company already exists.',
          'ENTERPRISES_U1': 'An enterprise with this code already exists.',
          'ENTERPRISES_PK': 'This enterprise already exists.',
        };
        
        // Check if we have a specific message for this constraint
        if (constraintMessages[constraintName]) {
          return constraintMessages[constraintName];
        }
        
        // For other constraints, try to infer from table name
        if (constraintName.includes('SHIFTS') && (constraintName.includes('U') || constraintName.includes('UK'))) {
          return 'A shift with this information already exists. Please use a different shift code.';
        }
        if (constraintName.includes('WORK_PATTERNS') && (constraintName.includes('U') || constraintName.includes('UK'))) {
          return 'Pattern code already exists for this tenant.';
        }
        if (constraintName.includes('WORK_SCHEDULES') && (constraintName.includes('U') || constraintName.includes('UK'))) {
          return 'Schedule code already exists for this tenant.';
        }
        if (constraintName.includes('WORK_SCHEDULE_LINES') && (constraintName.includes('U') || constraintName.includes('UK'))) {
          return 'A day of week already exists for this work schedule.';
        }
        if (constraintName.includes('SCHEDULE_ASSIGNMENTS') && (constraintName.includes('U') || constraintName.includes('UK'))) {
          return 'A schedule assignment already exists for this combination. Please check for duplicate assignments.';
        }
        if (constraintName.includes('COMPANIES') && (constraintName.includes('U') || constraintName.includes('UK'))) {
          return 'A company with this code already exists.';
        }
        if (constraintName.includes('ENTERPRISES') && (constraintName.includes('U') || constraintName.includes('UK'))) {
          return 'An enterprise with this code already exists.';
        }
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

    // Schedule overlap error (user-defined error from trigger)
    if (errorNum === 20001 || message.includes('ORA-20001')) {
      return 'Schedule assignment overlaps with an existing assignment. Please adjust the effective dates.';
    }

    // Mutating table error (trigger reading from same table being modified)
    if (errorNum === 4091 || message.includes('ORA-04091')) {
      return 'Cannot update schedule assignment due to a database constraint conflict. The assignment may overlap with existing assignments. Please verify the dates and try again, or contact support if the issue persists.';
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
    if (errorNum === 20001 || message.includes('ORA-20001')) return 409; // Conflict - Schedule overlap
    if (errorNum === 4091 || message.includes('ORA-04091')) return 409; // Conflict - Mutating table (overlap check)
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
    if (errorNum === 20001 || message.includes('ORA-20001')) return 'SCHEDULE_OVERLAP_CONFLICT';
    if (errorNum === 4091 || message.includes('ORA-04091')) return 'SCHEDULE_OVERLAP_CONFLICT';
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

