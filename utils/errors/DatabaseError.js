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
      const constraint = DatabaseError.extractConstraint(oracleError) || '';
      if (constraint.includes('FK_TM_TSL_PROJECT')) {
        return 'Invalid project_id. Parent record not found.';
      }
      if (constraint.includes('FK_TM_TSL_TASK')) {
        return 'Invalid task_id. Parent record not found.';
      }
      // Check for specific entity types in error message
      const upperMessage = message.toUpperCase();
      if (upperMessage.includes('LEAVE_TYPE') || upperMessage.includes('LEAVE TYPE')) {
        return 'The leave type does not exist. Please verify that the leave_type_id is valid and exists in the system.';
      }
      if (upperMessage.includes('TENANT') || upperMessage.includes('TENANT_ID')) {
        return 'The tenant does not exist. Please verify that the tenant_id is valid.';
      }
      if (upperMessage.includes('EMPLOYEE') || upperMessage.includes('ENTERPRISE')) {
        return 'Invalid employee/enterprise reference.';
      }
      return 'The referenced record does not exist. Please check your input.';
    }

    // Foreign key constraint - child record exists
    if (errorNum === 2292 || message.includes('ORA-02292')) {
      return 'Cannot delete this record because it is referenced by other records.';
    }

    // Not null constraint - append column name from "cannot insert NULL into ("SCHEMA"."TABLE"."COLUMN")"
    if (errorNum === 1400 || message.includes('ORA-01400')) {
      const colMatch = message.match(/\."([^"]+)"\s*\)/) || message.match(/"([^"]+)"\s*\)\s*$/);
      const col = colMatch ? colMatch[1] : null;
      return col
        ? `Required fields are missing. Please provide all required information. (NULL not allowed for column: ${col})`
        : 'Required fields are missing. Please provide all required information.';
    }

    // Check constraint violation (ORA-02290)
    if (errorNum === 2290 || message.includes('ORA-02290')) {
      // Try to extract constraint name and column from error message
      const constraint = DatabaseError.extractConstraint(oracleError);
      const columns = DatabaseError.extractColumns(oracleError);
      
      // Try to extract column name from common error message patterns
      let columnName = null;
      const columnMatch = message.match(/column\s+["']?(\w+)["']?/i) || 
                         message.match(/\((\w+)\)/);
      if (columnMatch) {
        columnName = columnMatch[1];
      }
      
      // Build specific error message
      if (constraint) {
        const constraintName = constraint.includes('.') ? constraint.split('.').pop() : constraint;
        
        // Map common constraint names to user-friendly messages
        const constraintMessages = {
          'ABS_LEAVE_POLICIES_C1': 'Invalid policy status. Status must be ACTIVE or INACTIVE.',
          'ABS_LEAVE_POLICIES_C2': 'Invalid accrual method code. Please provide a valid accrual method.',
          'ABS_LEAVE_POLICIES_C3': 'Invalid entitlement days. Entitlement days must be a positive number.',
          'ABS_LEAVE_POLICIES_C4': 'Invalid grade range. Grade from must be less than or equal to grade to.',
          'ABS_LEAVE_POLICIES_C5': 'Invalid grade entitlement. Grade entitlement days must be a positive number.',
          'CK_ABS_LP_ENT_ACCRUAL_METHOD': 'Invalid accrual_method_code. The value is not allowed by the database. Set ALLOWED_ACCRUAL_METHOD_CODES in feature/abs_leave_policies/config.js to match the DB check constraint (e.g. MONTHLY, YEARLY, WEEKLY, DAILY, NONE) and ensure request body only uses those values.',
        };
        
        if (constraintMessages[constraintName]) {
          return constraintMessages[constraintName];
        }
        
        // Generic message with constraint name
        return `The provided data violates the validation rule: ${constraintName}. Please check your input and ensure all values meet the required constraints.`;
      }
      
      if (columnName) {
        return `Invalid value for ${columnName}. Please check your input and ensure the value meets the required validation rules.`;
      }
      
      // Try to extract more context from the error message
      if (message.includes('check constraint')) {
        const constraintMatch = message.match(/check constraint\s+["']?([^"']+)["']?/i);
        if (constraintMatch) {
          return `The provided data violates the validation rule: ${constraintMatch[1]}. Please check your input.`;
        }
      }
      
      return 'The provided data violates a validation rule. Please check your input and ensure all values meet the required constraints.';
    }

    // Invalid number
    if (errorNum === 1722 || message.includes('ORA-01722')) {
      return 'Invalid numeric value provided. Please check your input.';
    }

    // Date format error
    if (errorNum === 1847 || message.includes('ORA-01847')) {
      return 'Invalid date format. Please provide a valid date.';
    }

    // ORA-01403: no data found — often SELECT INTO in a trigger when validation fails
    if (errorNum === 1403 || message.includes('ORA-01403')) {
      const upper = message.toUpperCase();
      if (
        upper.includes('FNDSEC_LKP_VAL') ||
        upper.includes('FNDSEC_LOOKUP_VALUES') ||
        upper.includes('LKP_VAL_BIU')
      ) {
        return 'This lookup value cannot be saved: the lookup type was not found, or it is not valid for your enterprise (global vs enterprise-specific rows). Check that lookup_type_id exists, and send enterprise_id when the parent type or rules are scoped to an enterprise.';
      }
      if (upper.includes('FNDSEC_LKP_TYP') || upper.includes('FNDSEC_LOOKUP_TYPES')) {
        return 'This lookup type could not be validated. Check enterprise_id and that the type exists for your enterprise.';
      }
      return 'No matching record was found for the data you submitted. Check IDs and try again.';
    }

    // ORA-04088: error during trigger — keep message friendly when FNDSEC lookup triggers wrap ORA-01403
    if (errorNum === 4088 || message.includes('ORA-04088')) {
      const upper = message.toUpperCase();
      // If the trigger failure wraps an application error (ORA-20001 / ORA-20xxx), prefer the real message.
      const appErrMatch = message.match(/ORA-(20\d{3}):\s*([^\n\r]+)/i);
      if (appErrMatch) {
        const extracted = String(appErrMatch[2] ?? '').trim();
        if (extracted) return extracted;
      }
      if (upper.includes('FNDSEC_LKP_VAL') || upper.includes('FNDSEC_LOOKUP_VALUES')) {
        return 'This lookup value cannot be saved: the database validation trigger failed. Usually lookup_type_id is wrong or missing, or enterprise_id does not match a global/enterprise lookup type. Verify the type exists and include enterprise_id if required.';
      }
      if (upper.includes('FNDSEC_LKP_TYP') || upper.includes('FNDSEC_LOOKUP_TYPES')) {
        return 'This lookup type could not be saved because a database validation failed. Check enterprise_id and required fields.';
      }
      if (upper.includes('FNDSEC_LKP') || upper.includes('FNDSEC_LOOKUP')) {
        return 'The database could not save this security lookup record. Check parent references and enterprise_id.';
      }
      if (message.includes('ORA-01403')) {
        return 'The operation failed because a required related record was not found. Check your IDs and enterprise context.';
      }
      return 'The database could not complete this action because a trigger reported an error. Verify your input or contact support.';
    }

    // EMPL lookup cross-scope (global vs enterprise) trigger errors
    if (
      (errorNum >= 20010 && errorNum <= 20013) ||
      /ORA-2001[0-3]/.test(message)
    ) {
      const m = message.match(/ORA-2001[0-3]:\s*([^\n\r]+)/i);
      if (m?.[1]) return String(m[1]).trim();
    }

    // ORA-20001: user-defined – use message for "Attendance Day does not exist", else schedule overlap
    if (errorNum === 20001 || message.includes('ORA-20001')) {
      const upper = message.toUpperCase();
      if (upper.includes('ATTENDANCE DAY') && (upper.includes('DOES NOT EXIST') || upper.includes('NOT EXIST'))) {
        const extracted = message.replace(/ORA-20001:\s*/i, '').split(/\n/)[0].trim();
        return extracted || 'Attendance Day does not exist for the given enterprise, employee, and date.';
      }
      // Prefer the actual application error message raised by trigger/package.
      // Keep only the first line and strip Oracle stack traces.
      // First try to pull the explicit "ORA-20001: ..." line if present anywhere.
      const m = message.match(/ORA-20001:\s*([^\n\r]+)/i);
      let extracted = m ? String(m[1] ?? '').trim() : message.replace(/ORA-20001:\s*/i, '');
      extracted = extracted.split(/\nORA-\d{5}:/)[0].trim();
      extracted = extracted.split('\n')[0].trim();
      return extracted || 'Schedule assignment overlaps with an existing assignment. Please adjust the effective dates.';
    }

    // Mutating table error (trigger reading from same table being modified)
    if (errorNum === 4091 || message.includes('ORA-04091')) {
      // Try to infer context from error message or table name
      if (message.includes('LEAVE_REQUESTS') || message.includes('LEAVE_REQUEST')) {
        return 'Cannot update leave request due to a database constraint conflict. Please verify the dates and try again, or contact support if the issue persists.';
      }
      if (message.includes('SCHEDULE') || message.includes('ASSIGNMENT')) {
        return 'Cannot update schedule assignment due to a database constraint conflict. The assignment may overlap with existing assignments. Please verify the dates and try again, or contact support if the issue persists.';
      }
      // Generic message for other contexts
      return 'Cannot update the record due to a database constraint conflict. A trigger or constraint is preventing this update. Please verify your input and try again, or contact support if the issue persists.';
    }

    // Package body does not exist or is invalid (ORA-04067)
    if (errorNum === 4067 || message.includes('ORA-04067')) {
      const pkgMatch = message.match(/package body\s+"([^"]+)"/i) || message.match(/package\s+"([^"]+)"/i);
      const packageName = pkgMatch?.[1] || 'requested package';
      return `The database package ${packageName} does not exist or its body is invalid. Please verify that the package exists and is properly compiled. Contact the database administrator to resolve this issue.`;
    }

    // PL/SQL compilation error (ORA-06550)
    if (errorNum === 6550 || message.includes('ORA-06550')) {
      // Extract the actual error message from ORA-06550 (it usually contains the real error)
      const match = message.match(/ORA-06550[^\n]*\n([^\n]+)/);
      const actualError = match ? match[1].trim() : message;
      // Try to extract procedure/package name from message (e.g. UPSERT_MARK_ATTENDANCE, CREATE_POLICY_WITH_GRADES)
      const procMatch = message.match(/call to '([^']+)'/i) || message.match(/['"](\w+\.\w+)['"]/);
      const procedureRef = procMatch ? procMatch[1] : 'procedure';
      // Check for leave type related errors
      const upperError = actualError.toUpperCase();
      if (upperError.includes('LEAVE_TYPE') || upperError.includes('LEAVE TYPE') || upperError.includes('NOT FOUND')) {
        return 'The leave type does not exist. Please verify that the leave_type_id is valid and exists in the system.';
      }
      return `PL/SQL compilation error: ${actualError}. Please verify that ${procedureRef} exists and parameter names, types and count match the package specification.`;
    }

    // Parallel query server error (ORA-12801) - wrapper error, extract underlying error
    if (errorNum === 12801 || message.includes('ORA-12801')) {
      // ORA-12801 is a wrapper - the actual error follows it
      // Try to extract the underlying error message
      const lines = message.split('\n');
      const underlyingError = lines.find(line => 
        line.includes('ORA-') && !line.includes('ORA-12801')
      ) || lines[lines.length - 1];
      
      // Check for leave type related errors in underlying error
      const upperError = underlyingError.toUpperCase();
      if (upperError.includes('LEAVE_TYPE') || upperError.includes('LEAVE TYPE') || upperError.includes('NOT FOUND')) {
        return 'The leave type does not exist. Please verify that the leave_type_id is valid and exists in the system.';
      }
      
      return `Database error: ${underlyingError.trim() || 'An error occurred during query execution. Please check the database logs for details.'}`;
    }

    // Application errors (ORA-20000 to ORA-20999) - user-defined errors from PL/SQL
    if ((errorNum >= 20000 && errorNum <= 20999) || message.includes('ORA-20')) {
      // Extract the user-friendly message (first line before stack trace)
      let userMessage = message;
      
      // Remove Oracle stack traces (ORA-06512, ORA-04088, etc.)
      const stackTracePattern = /\nORA-\d{5}:/;
      if (stackTracePattern.test(userMessage)) {
        // Get everything before the first stack trace
        userMessage = userMessage.split(stackTracePattern)[0].trim();
      }
      
      // Remove "Help: https://..." links
      userMessage = userMessage.replace(/Help:\s*https?:\/\/[^\n]*/gi, '').trim();
      
      // Check for project-not-found (before generic NOT FOUND / leave type)
      const upperMessage = userMessage.toUpperCase();
      if (upperMessage.includes('PROJECT') && upperMessage.includes('NOT FOUND')) {
        return 'Project not found for update. Check project_id or project_guid and enterprise_id.';
      }
      // ORA-20008: COMPONENT_CODE already exists for this TENANT_ID
      if (errorNum === 20008 || message.includes('ORA-20008')) {
        if (upperMessage.includes('COMPONENT_CODE') && upperMessage.includes('ALREADY EXISTS')) {
          return 'This component code already exists for this tenant. Please use a different component code.';
        }
      }
      // ORA-20010: Current component version not found for given GUID and TENANT_ID
      if (errorNum === 20010 || message.includes('ORA-20010')) {
        if (upperMessage.includes('CURRENT COMPONENT VERSION') && upperMessage.includes('NOT FOUND')) {
          return 'No current version of this component found for the given tenant. Check that the component_guid and tenant_id are correct and that the component exists.';
        }
      }
      // Check for specific lookup validation errors (leave type)
      if (upperMessage.includes('LEAVE_TYPE') || upperMessage.includes('LEAVE TYPE') || upperMessage.includes('NOT FOUND')) {
        return 'The leave type does not exist. Please verify that the leave_type_id is valid and exists in the system.';
      }
      
      // Check for lookup validation errors
      if (upperMessage.includes('MUST EXIST IN LOOKUP') || upperMessage.includes('INVALID') && upperMessage.includes('CODE')) {
        // Extract the field name and lookup name
        const fieldMatch = userMessage.match(/INVALID\s+(\w+)/i);
        const lookupMatch = userMessage.match(/LOOKUP\s+(\w+)/i);
        
        if (fieldMatch && lookupMatch) {
          const fieldName = fieldMatch[1].replace(/_/g, ' ').toLowerCase();
          const lookupName = lookupMatch[1].replace(/_/g, ' ');
          return `Invalid ${fieldName}. The value must exist in the ${lookupName} lookup table. Please provide a valid value.`;
        }
        
        // Generic lookup error message
        return userMessage || 'Invalid value provided. The value must exist in the lookup table. Please check your input.';
      }
      
      // Return the cleaned user message
      return userMessage || message;
    }

    // Table or view does not exist (ORA-00942)
    if (errorNum === 942 || message.includes('ORA-00942')) {
      return 'The required database table or view does not exist or is not accessible. Please contact the administrator to create or grant access to the object.';
    }

    // Invalid identifier / column name (ORA-00904)
    if (errorNum === 904 || message.includes('ORA-00904')) {
      return 'A column or expression referenced in the query is invalid or does not exist. Please contact the administrator to align the schema with the application.';
    }

    // Default database error - try to extract more details from message
    if (message && message.length > 0 && message !== 'A database error occurred. Please try again later.') {
      // If there's a detailed message, use it
      const upperMessage = message.toUpperCase();
      if (upperMessage.includes('LEAVE_TYPE') || upperMessage.includes('LEAVE TYPE')) {
        return 'The leave type does not exist. Please verify that the leave_type_id is valid and exists in the system.';
      }
      // Return first 200 chars of the actual error message if available
      return message.length > 200 ? message.substring(0, 200) + '...' : message;
    }
    
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
    if (errorNum === 20001 || message.includes('ORA-20001')) {
      const upper = (oracleError.message || '').toUpperCase();
      if (upper.includes('ATTENDANCE DAY') && (upper.includes('DOES NOT EXIST') || upper.includes('NOT EXIST'))) return 404;
      return 409; // Conflict - Schedule overlap
    }
    if (errorNum === 4091 || message.includes('ORA-04091')) return 409; // Conflict - Mutating table (overlap check)
    if (errorNum === 2291 || message.includes('ORA-02291')) return 400; // Bad Request
    if (errorNum === 2292 || message.includes('ORA-02292')) return 409; // Conflict
    if (errorNum === 1400 || message.includes('ORA-01400')) return 400; // Bad Request
    if (errorNum === 2290 || message.includes('ORA-02290')) return 400; // Bad Request
    if (errorNum === 20090 || message.includes('ORA-20090')) return 400; // Check constraint (e.g. attendance)
    if (errorNum === 1403 || message.includes('ORA-01403')) return 400; // No data found (e.g. trigger validation)
    if (errorNum === 4088 || message.includes('ORA-04088')) {
      const upper = message.toUpperCase();
      if (upper.includes('FNDSEC_LKP') || upper.includes('FNDSEC_LOOKUP') || message.includes('ORA-01403')) {
        return 400;
      }
      return 500;
    }
    if (errorNum === 20010 || message.includes('ORA-20010')) return 404; // Current component version not found (GUID + tenant)
    if (errorNum >= 20000 && errorNum <= 20999) return 400; // Application / user-defined errors

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
    if (errorNum === 20001 || message.includes('ORA-20001')) {
      const upper = (oracleError.message || '').toUpperCase();
      if (upper.includes('ATTENDANCE DAY') && (upper.includes('DOES NOT EXIST') || upper.includes('NOT EXIST'))) return 'ATTENDANCE_DAY_NOT_FOUND';
      return 'SCHEDULE_OVERLAP_CONFLICT';
    }
    if (errorNum === 4091 || message.includes('ORA-04091')) return 'SCHEDULE_OVERLAP_CONFLICT';
    if (errorNum === 2291 || message.includes('ORA-02291')) return 'FOREIGN_KEY_CONSTRAINT';
    if (errorNum === 2292 || message.includes('ORA-02292')) return 'FOREIGN_KEY_CONSTRAINT';
    if (errorNum === 1400 || message.includes('ORA-01400')) return 'NOT_NULL_CONSTRAINT';
    if (errorNum === 2290 || message.includes('ORA-02290')) return 'CHECK_CONSTRAINT_VIOLATION';
    if (errorNum === 20010 || message.includes('ORA-20010')) return 'COMPONENT_VERSION_NOT_FOUND';
    if (errorNum === 1403 || message.includes('ORA-01403')) return 'NO_DATA_FOUND';
    if (errorNum === 4088 || message.includes('ORA-04088')) {
      const upper = message.toUpperCase();
      if (upper.includes('FNDSEC_LKP') || upper.includes('FNDSEC_LOOKUP') || message.includes('ORA-01403')) {
        return 'NO_DATA_FOUND';
      }
      return 'TRIGGER_EXECUTION_ERROR';
    }

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

