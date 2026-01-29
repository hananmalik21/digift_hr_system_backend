// leaveRequestModel.js
import db from '../../../config/db.js';
import oracledb from 'oracledb';
import crypto from 'crypto';
import { DatabaseError, ValidationError } from '../../../utils/errors/index.js';
import { ensureHex32, hexToRawBuffer, generateSysGuid } from '../../../utils/guidUtils.js';

/**
 * Leave Request Model
 * Handles all database operations for ABS.ABS_LEAVE_REQUESTS table
 * (START_PORTION_CODE / END_PORTION_CODE removed)
 */
class LeaveRequestModel {
  static TABLE_NAME = 'ABS.ABS_LEAVE_REQUESTS';

  /**
   * Convert object keys from UPPER_CASE to lowercase snake_case
   * Convert Buffer (RAW/GUID) to HEX string
   */
  static convertKeysToSnakeCase(obj) {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date) return obj;
    if (obj instanceof Buffer) return obj.toString('hex').toUpperCase();
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => this.convertKeysToSnakeCase(item));

    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
      const newKey = key.toLowerCase();
      if (value === null || value === undefined) converted[newKey] = value;
      else if (value instanceof Date) converted[newKey] = value;
      else if (value instanceof Buffer) converted[newKey] = value.toString('hex').toUpperCase();
      else if (typeof value === 'object') converted[newKey] = this.convertKeysToSnakeCase(value);
      else converted[newKey] = value;
    }
    return converted;
  }

  /**
   * Execute query using shared db helper
   */
  static async executeQuery(query, bindParams = [], options = {}) {
    const result = await db.executeQuery(query, bindParams, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      ...options
    });

    if (result.rows) result.rows = this.convertKeysToSnakeCase(result.rows);
    return result;
  }

  /**
   * Execute a callback with transaction handling
   */
  static async executeWithTransaction(callback) {
    let connection;
    try {
      connection = await db.getConnection();
      const result = await callback(connection);
      await connection.commit();
      return result;
    } catch (error) {
      if (connection && connection.rollback) {
        try {
          await connection.rollback();
        } catch (rollbackErr) {
          console.error('Error during rollback:', rollbackErr);
        }
      }
      throw error;
    } finally {
      if (connection && connection.close) {
        try {
          await connection.close();
        } catch (err) {
          console.error('Error closing connection:', err);
        }
      }
    }
  }

  /**
   * Get all leave requests with optional filters + pagination
   * Optimized for performance with proper indexing and query structure
   */
  static async findAll(filters = {}) {
    try {
      // Build WHERE conditions with bind parameters
      const conditions = [];
      const bindParams = [];
      let paramIndex = 1;

      // TENANT_ID should be prioritized for index usage (multi-tenant filtering)
      if (filters.tenantId) {
        conditions.push(`a.TENANT_ID = :${paramIndex}`);
        bindParams.push(parseInt(filters.tenantId));
        paramIndex++;
      }

      // EMPLOYEE_ID filter (high selectivity)
      if (filters.employeeId) {
        conditions.push(`a.EMPLOYEE_ID = :${paramIndex}`);
        bindParams.push(parseInt(filters.employeeId));
        paramIndex++;
      }

      // REQUEST_STATUS filter
      if (filters.status) {
        conditions.push(`a.REQUEST_STATUS = :${paramIndex}`);
        bindParams.push(filters.status);
        paramIndex++;
      }

      // LEAVE_TYPE_ID filter
      if (filters.leaveTypeId) {
        conditions.push(`a.LEAVE_TYPE_ID = :${paramIndex}`);
        bindParams.push(parseInt(filters.leaveTypeId));
        paramIndex++;
      }

      // Date range filters (optimized for START_DATE index)
      if (filters.startDateFrom) {
        conditions.push(`a.START_DATE >= :${paramIndex}`);
        bindParams.push(filters.startDateFrom);
        paramIndex++;
      }

      if (filters.startDateTo) {
        conditions.push(`a.START_DATE <= :${paramIndex}`);
        bindParams.push(filters.startDateTo);
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

      // Execute pagination
      const pagination = filters.pagination || {};
      const page = pagination.page || 1;
      const pageSize = pagination.pageSize || 10;
      const offset = (page - 1) * pageSize;
      
      // Execute COUNT query (optimized - uses same WHERE clause and bind params for plan reuse)
      // Oracle will reuse the execution plan between COUNT and SELECT queries
      const countQuery = `SELECT COUNT(*) AS total FROM ${this.TABLE_NAME} a${whereClause}`;
      const countResult = await this.executeQuery(countQuery, bindParams);
      const total = countResult.rows[0]?.total || 0;

      // Optimized data query with proper ordering for index usage
      // ORDER BY START_DATE DESC first (most selective), then CREATION_DATE DESC as tiebreaker
      // This ordering supports efficient index scans
      // JOIN with EMPL.EMPLOYEES and ABS.ABS_LEAVE_TYPES to get employee and leave type details
      const dataQuery = `SELECT 
        a.LEAVE_REQUEST_ID,
        RAWTOHEX(a.LEAVE_REQUEST_GUID) AS LEAVE_REQUEST_GUID,
        a.TENANT_ID,
        a.EMPLOYEE_ID,
        a.LEAVE_TYPE_ID,
        a.START_DATE,
        a.END_DATE,
        a.START_TS,
        a.END_TS,
        a.TOTAL_DAYS,
        a.REQUEST_STATUS,
        a.SUBMITTED_AT,
        a.APPROVED_AT,
        a.REJECTED_AT,
        a.CREATION_DATE,
        a.CREATED_BY,
        a.LAST_UPDATE_DATE,
        a.LAST_UPDATED_BY,
        -- Employee information (limited fields)
        e.EMPLOYEE_ID AS EMP_EMPLOYEE_ID,
        RAWTOHEX(e.EMPLOYEE_GUID) AS EMP_EMPLOYEE_GUID,
        e.FIRST_NAME_EN AS EMP_FIRST_NAME_EN,
        e.MIDDLE_NAME_EN AS EMP_MIDDLE_NAME_EN,
        e.LAST_NAME_EN AS EMP_LAST_NAME_EN,
        e.FIRST_NAME_AR AS EMP_FIRST_NAME_AR,
        e.MIDDLE_NAME_AR AS EMP_MIDDLE_NAME_AR,
        e.LAST_NAME_AR AS EMP_LAST_NAME_AR,
        e.FAMILY_NAME_AR AS EMP_FAMILY_NAME_AR,
        e.EMAIL AS EMP_EMAIL,
        -- Leave type information (limited fields)
        lt.LEAVE_TYPE_ID AS LT_LEAVE_TYPE_ID,
        RAWTOHEX(lt.LEAVE_TYPE_GUID) AS LT_LEAVE_TYPE_GUID,
        lt.LEAVE_NAME_EN AS LT_LEAVE_NAME_EN,
        lt.LEAVE_NAME_AR AS LT_LEAVE_NAME_AR,
        lt.LEAVE_CODE AS LT_LEAVE_CODE
      FROM ${this.TABLE_NAME} a
      LEFT JOIN EMPL.EMPLOYEES e
        ON a.EMPLOYEE_ID = e.EMPLOYEE_ID
       AND a.TENANT_ID = e.ENTERPRISE_ID
      LEFT JOIN ABS.ABS_LEAVE_TYPES lt
        ON a.LEAVE_TYPE_ID = lt.LEAVE_TYPE_ID
       AND a.TENANT_ID = lt.TENANT_ID
      ${whereClause}
      ORDER BY a.START_DATE DESC NULLS LAST, a.CREATION_DATE DESC
      OFFSET :${paramIndex} ROWS FETCH NEXT :${paramIndex + 1} ROWS ONLY`;
      
      bindParams.push(offset);
      bindParams.push(pageSize);

      const dataResult = await this.executeQuery(dataQuery, bindParams);

      // Convert PENDING to SUBMITTED for all rows (PENDING is not a valid status, should be SUBMITTED)
      // Note: rows are already converted to snake_case by executeQuery
      // Structure employee and leave type information into separate objects
      const leaveRequests = (dataResult.rows || []).map(row => {
        if (row.request_status && String(row.request_status).toUpperCase() === 'PENDING') {
          row.request_status = 'SUBMITTED';
        }

        // Build employee_info object (limited fields)
        const employeeInfo = row.emp_employee_id ? {
          employee_id: row.emp_employee_id,
          employee_guid: row.emp_employee_guid,
          first_name_en: row.emp_first_name_en,
          middle_name_en: row.emp_middle_name_en,
          last_name_en: row.emp_last_name_en,
          first_name_ar: row.emp_first_name_ar,
          middle_name_ar: row.emp_middle_name_ar,
          last_name_ar: row.emp_last_name_ar,
          family_name_ar: row.emp_family_name_ar,
          email: row.emp_email
        } : null;

        // Build leave_type_info object (limited fields)
        const leaveTypeInfo = row.lt_leave_type_id ? {
          leave_type_id: row.lt_leave_type_id,
          leave_type_guid: row.lt_leave_type_guid,
          leave_name_en: row.lt_leave_name_en,
          leave_name_ar: row.lt_leave_name_ar,
          leave_code: row.lt_leave_code
        } : null;

        // Remove prefixed fields from main row
        const {
          emp_employee_id,
          emp_employee_guid,
          emp_first_name_en,
          emp_middle_name_en,
          emp_last_name_en,
          emp_first_name_ar,
          emp_middle_name_ar,
          emp_last_name_ar,
          emp_family_name_ar,
          emp_email,
          lt_leave_type_id,
          lt_leave_type_guid,
          lt_leave_name_en,
          lt_leave_name_ar,
          lt_leave_code,
          ...leaveRequestData
        } = row;

        // Add structured employee and leave type info
        return {
          ...leaveRequestData,
          employee_info: employeeInfo,
          leave_type_info: leaveTypeInfo
        };
      });

      return { leaveRequests, total };
    } catch (error) {
      if (error?.errorNum !== undefined || error?.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to fetch leave requests', error);
    }
  }

  /**
   * Get single leave request by GUID (HEX32)
   */
  static async findByGuid(guidHex32) {
    try {
      const hexGuid = ensureHex32(guidHex32, 'guid');
      const guidBuffer = hexToRawBuffer(hexGuid);

      const query = `SELECT 
        a.LEAVE_REQUEST_ID,
        RAWTOHEX(a.LEAVE_REQUEST_GUID) AS LEAVE_REQUEST_GUID,
        a.TENANT_ID,
        a.EMPLOYEE_ID,
        a.LEAVE_TYPE_ID,
        a.START_DATE,
        a.END_DATE,
        a.START_TS,
        a.END_TS,
        a.TOTAL_DAYS,
        a.REQUEST_STATUS,
        a.SUBMITTED_AT,
        a.APPROVED_AT,
        a.REJECTED_AT,
        a.CREATION_DATE,
        a.CREATED_BY,
        a.LAST_UPDATE_DATE,
        a.LAST_UPDATED_BY,
        -- Employee information (limited fields)
        e.EMPLOYEE_ID AS EMP_EMPLOYEE_ID,
        RAWTOHEX(e.EMPLOYEE_GUID) AS EMP_EMPLOYEE_GUID,
        e.FIRST_NAME_EN AS EMP_FIRST_NAME_EN,
        e.MIDDLE_NAME_EN AS EMP_MIDDLE_NAME_EN,
        e.LAST_NAME_EN AS EMP_LAST_NAME_EN,
        e.FIRST_NAME_AR AS EMP_FIRST_NAME_AR,
        e.MIDDLE_NAME_AR AS EMP_MIDDLE_NAME_AR,
        e.LAST_NAME_AR AS EMP_LAST_NAME_AR,
        e.FAMILY_NAME_AR AS EMP_FAMILY_NAME_AR,
        e.EMAIL AS EMP_EMAIL,
        -- Leave type information (limited fields)
        lt.LEAVE_TYPE_ID AS LT_LEAVE_TYPE_ID,
        RAWTOHEX(lt.LEAVE_TYPE_GUID) AS LT_LEAVE_TYPE_GUID,
        lt.LEAVE_NAME_EN AS LT_LEAVE_NAME_EN,
        lt.LEAVE_NAME_AR AS LT_LEAVE_NAME_AR,
        lt.LEAVE_CODE AS LT_LEAVE_CODE
      FROM ${this.TABLE_NAME} a
      LEFT JOIN EMPL.EMPLOYEES e
        ON a.EMPLOYEE_ID = e.EMPLOYEE_ID
       AND a.TENANT_ID = e.ENTERPRISE_ID
      LEFT JOIN ABS.ABS_LEAVE_TYPES lt
        ON a.LEAVE_TYPE_ID = lt.LEAVE_TYPE_ID
       AND a.TENANT_ID = lt.TENANT_ID
      WHERE a.LEAVE_REQUEST_GUID = :1`;

      const result = await this.executeQuery(query, [guidBuffer]);
      if (result.rows?.[0]) {
        const row = result.rows[0];
        // Convert PENDING to SUBMITTED (PENDING is not a valid status, should be SUBMITTED)
        // Note: row is already converted to snake_case by executeQuery
        if (row.request_status && String(row.request_status).toUpperCase() === 'PENDING') {
          row.request_status = 'SUBMITTED';
        }

        // Build employee_info object (limited fields)
        const employeeInfo = row.emp_employee_id ? {
          employee_id: row.emp_employee_id,
          employee_guid: row.emp_employee_guid,
          first_name_en: row.emp_first_name_en,
          middle_name_en: row.emp_middle_name_en,
          last_name_en: row.emp_last_name_en,
          first_name_ar: row.emp_first_name_ar,
          middle_name_ar: row.emp_middle_name_ar,
          last_name_ar: row.emp_last_name_ar,
          family_name_ar: row.emp_family_name_ar,
          email: row.emp_email
        } : null;

        // Build leave_type_info object (limited fields)
        const leaveTypeInfo = row.lt_leave_type_id ? {
          leave_type_id: row.lt_leave_type_id,
          leave_type_guid: row.lt_leave_type_guid,
          leave_name_en: row.lt_leave_name_en,
          leave_name_ar: row.lt_leave_name_ar,
          leave_code: row.lt_leave_code
        } : null;

        // Remove prefixed fields from main row
        const {
          emp_employee_id,
          emp_employee_guid,
          emp_first_name_en,
          emp_middle_name_en,
          emp_last_name_en,
          emp_first_name_ar,
          emp_middle_name_ar,
          emp_last_name_ar,
          emp_family_name_ar,
          emp_email,
          lt_leave_type_id,
          lt_leave_type_guid,
          lt_leave_name_en,
          lt_leave_name_ar,
          lt_leave_code,
          ...leaveRequestData
        } = row;

        // Add structured employee and leave type info
        return {
          ...leaveRequestData,
          employee_info: employeeInfo,
          leave_type_info: leaveTypeInfo
        };
      }
      return null;
    } catch (error) {
      if (error?.message?.includes('must be a 32-character hex GUID')) throw error;
      if (error?.errorNum !== undefined || error?.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to fetch leave request', error);
    }
  }

  /**
   * Create a new leave request
   */
  static async create(data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        // Duplicate check (optional)
        if (data.EMPLOYEE_ID && data.START_DATE && data.END_DATE) {
          const checkQuery = `SELECT COUNT(*) AS count 
            FROM ${this.TABLE_NAME}
            WHERE EMPLOYEE_ID = :1
              AND START_DATE = :2
              AND END_DATE = :3`;

          const checkParams = [
            parseInt(data.EMPLOYEE_ID),
            data.START_DATE instanceof Date ? data.START_DATE : new Date(data.START_DATE),
            data.END_DATE instanceof Date ? data.END_DATE : new Date(data.END_DATE)
          ];

          const checkResult = await connection.execute(checkQuery, checkParams, {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });

          if (checkResult.rows?.[0]?.COUNT > 0) {
            const conflictError = new DatabaseError(
              'Leave Request already exists',
              null,
              'Leave Request already exists'
            );
            conflictError.code = 'DUPLICATE_LEAVE_REQUEST';
            throw conflictError;
          }
        }

        // Next ID
        let leaveRequestId;
        try {
          const seqQuery = `SELECT ABS.ABS_LEAVE_REQUESTS_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`;
          const seqResult = await connection.execute(seqQuery, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
          leaveRequestId = seqResult.rows[0].NEXT_ID;
        } catch {
          const maxQuery = `SELECT NVL(MAX(LEAVE_REQUEST_ID), 0) + 1 AS NEXT_ID FROM ${this.TABLE_NAME}`;
          const maxResult = await connection.execute(maxQuery, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
          leaveRequestId = maxResult.rows[0].NEXT_ID;
        }

        // GUID
        let guidBuffer = null;
        try {
          const { buffer } = await generateSysGuid(connection);
          guidBuffer = buffer;
        } catch (guidError) {
          console.error('Failed to generate GUID (will rely on DB trigger if exists):', guidError);
        }

        const now = new Date();

        const insertSql = `INSERT INTO ${this.TABLE_NAME} (
          LEAVE_REQUEST_ID,
          LEAVE_REQUEST_GUID,
          TENANT_ID,
          EMPLOYEE_ID,
          LEAVE_TYPE_ID,
          START_DATE,
          END_DATE,
          START_TS,
          END_TS,
          TOTAL_DAYS,
          REQUEST_STATUS,
          SUBMITTED_AT,
          APPROVED_AT,
          REJECTED_AT,
          CREATION_DATE,
          CREATED_BY,
          LAST_UPDATE_DATE,
          LAST_UPDATED_BY
        ) VALUES (
          :1,:2,:3,:4,:5,:6,:7,:8,:9,:10,:11,:12,:13,:14,:15,:16,:17,:18
        )`;

        const totalDays = (() => {
          if (data.TOTAL_DAYS !== undefined && data.TOTAL_DAYS !== null && !isNaN(data.TOTAL_DAYS)) {
            return parseFloat(data.TOTAL_DAYS);
          }
          if (data.START_DATE && data.END_DATE) {
            const start = data.START_DATE instanceof Date ? data.START_DATE : new Date(data.START_DATE);
            const end = data.END_DATE instanceof Date ? data.END_DATE : new Date(data.END_DATE);
            
            // Check if same calendar day
            const startDateOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
            const endDateOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate());
            const isSameDay = startDateOnly.getTime() === endDateOnly.getTime();
            
            if (isSameDay) {
              // Same day = 1 day
              return 1;
            } else {
              // Different days: calculate calendar days inclusively
              const diffTime = end - start;
              const diffDays = diffTime / (1000 * 60 * 60 * 24);
              const calendarDays = Math.floor(diffDays) + 1; // +1 for inclusive count
              return calendarDays > 0 ? calendarDays : 1;
            }
          }
          return 1;
        })();

        const bindParams = [
          leaveRequestId,
          guidBuffer,
          data.TENANT_ID !== undefined && data.TENANT_ID !== null ? parseInt(data.TENANT_ID) : null,
          data.EMPLOYEE_ID !== undefined && data.EMPLOYEE_ID !== null ? parseInt(data.EMPLOYEE_ID) : null,
          data.LEAVE_TYPE_ID !== undefined && data.LEAVE_TYPE_ID !== null ? parseInt(data.LEAVE_TYPE_ID) : null,
          data.START_DATE || null,
          data.END_DATE || null,
          data.START_TS || null,
          data.END_TS || null,
          totalDays,
          data.REQUEST_STATUS || 'DRAFT',
          data.SUBMITTED_AT || now,
          data.APPROVED_AT || null,
          data.REJECTED_AT || null,
          now,
          userId || 'SYSTEM',
          now,
          userId || 'SYSTEM'
        ];

        await connection.execute(insertSql, bindParams, { outFormat: oracledb.OUT_FORMAT_OBJECT });

        const selectSql = `SELECT 
          a.LEAVE_REQUEST_ID,
          RAWTOHEX(a.LEAVE_REQUEST_GUID) AS LEAVE_REQUEST_GUID,
          a.TENANT_ID,
          a.EMPLOYEE_ID,
          a.LEAVE_TYPE_ID,
          a.START_DATE,
          a.END_DATE,
          a.START_TS,
          a.END_TS,
          a.TOTAL_DAYS,
          a.REQUEST_STATUS,
          a.SUBMITTED_AT,
          a.APPROVED_AT,
          a.REJECTED_AT,
          a.CREATION_DATE,
          a.CREATED_BY,
          a.LAST_UPDATE_DATE,
          a.LAST_UPDATED_BY
        FROM ${this.TABLE_NAME} a
        WHERE a.LEAVE_REQUEST_ID = :1`;

        const selectResult = await connection.execute(selectSql, [leaveRequestId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        if (selectResult.rows?.length) return this.convertKeysToSnakeCase(selectResult.rows[0]);
        throw new DatabaseError('Failed to retrieve created leave request');
      });
    } catch (error) {
      // ✅ IMPORTANT: log raw Oracle error once (for debugging your 409 issue)

      if (error?.errorNum === 2291 || error?.message?.includes('ORA-02291')) {
        const userMessage =
          'The referenced record does not exist. Please verify employee_id, leave_type_id, tenant_id (if provided), and employee belongs to tenant.';
        const fkError = new DatabaseError(userMessage, error, userMessage);
        fkError.code = 'FOREIGN_KEY_CONSTRAINT';
        throw fkError;
      }

      if (error?.errorNum === 1400 || error?.message?.includes('ORA-01400')) {
        const notNullError = new DatabaseError('Required fields are missing.', error, 'Required fields are missing.');
        notNullError.code = 'NOT_NULL_CONSTRAINT';
        throw notNullError;
      }

      if (error?.errorNum !== undefined || error?.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to create leave request', error);
    }
  }

  /**
   * Resolve employee GUID to employee ID (static method for use in controller)
   */
  static async resolveEmployeeIdByGuidStatic(tenantId, employeeGuid) {
    let connection;
    try {
      connection = await db.getConnection();
      return await this.resolveEmployeeIdByGuid(connection, tenantId, employeeGuid);
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch {}
      }
    }
  }

  /**
   * Resolve employee GUID to employee ID
   */
  static async resolveEmployeeIdByGuid(connection, tenantId, employeeGuid) {
    try {
      if (!employeeGuid) {
        return null;
      }
      const employeeGuidHex = ensureHex32(employeeGuid, 'employeeGuid');
      const query = `SELECT EMPLOYEE_ID
        FROM EMPL.EMPLOYEES
        WHERE ENTERPRISE_ID = :1
          AND RAWTOHEX(EMPLOYEE_GUID) = :2`;
      const result = await connection.execute(query, [tenantId, employeeGuidHex], {
        outFormat: oracledb.OUT_FORMAT_OBJECT
      });
      if (!result.rows || result.rows.length === 0 || !result.rows[0]) {
        return null;
      }
      return result.rows[0].EMPLOYEE_ID || null;
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new DatabaseError('Failed to resolve employee ID by GUID', error);
    }
  }

  /**
   * Check if employee already has a leave request with overlapping dates
   * @param {Object} connection - Database connection
   * @param {number} tenantId - Tenant ID
   * @param {number} employeeId - Employee ID
   * @param {Date} startDate - Start date of new leave request
   * @param {Date} endDate - End date of new leave request
   * @param {number} excludeLeaveRequestId - Optional: exclude this leave request ID (for updates)
   * @returns {Object|null} Existing leave request with overlapping dates, or null
   */
  static async checkOverlappingLeaveRequest(connection, tenantId, employeeId, startDate, endDate, excludeLeaveRequestId = null) {
    let bindParams;
    try {
      const startDateObj = startDate instanceof Date ? startDate : new Date(startDate);
      const endDateObj = endDate instanceof Date ? endDate : new Date(endDate);

      // Simplified overlap check: two date ranges overlap if:
      // existing_start <= new_end AND existing_end >= new_start
      // This covers all overlap scenarios (partial, complete containment, etc.)
      bindParams = [
        tenantId,
        employeeId,
        endDateObj,    // :3 - new end date
        startDateObj  // :4 - new start date
      ];
      
      let query = `SELECT 
        LEAVE_REQUEST_ID,
        RAWTOHEX(LEAVE_REQUEST_GUID) AS LEAVE_REQUEST_GUID,
        START_DATE,
        END_DATE,
        REQUEST_STATUS
      FROM ${this.TABLE_NAME}
      WHERE TENANT_ID = :1
        AND EMPLOYEE_ID = :2
        AND REQUEST_STATUS NOT IN ('CANCELLED', 'REJECTED', 'WITHDRAWN')
        AND START_DATE <= :3
        AND END_DATE >= :4`;

      if (excludeLeaveRequestId !== null && excludeLeaveRequestId !== undefined) {
        query += ` AND LEAVE_REQUEST_ID != :5`;
        bindParams.push(parseInt(excludeLeaveRequestId)); // Ensure it's an integer
      }

      query += ` ORDER BY START_DATE DESC`;

      const result = await connection.execute(query, bindParams, {
        outFormat: oracledb.OUT_FORMAT_OBJECT
      });

      // Get first row if any exist
      if (result.rows && result.rows.length > 0) {
        const row = this.convertKeysToSnakeCase(result.rows[0]);
        // Convert PENDING to SUBMITTED in the response (PENDING is not a valid status)
        if (row.request_status && String(row.request_status).toUpperCase() === 'PENDING') {
          row.request_status = 'SUBMITTED';
        }
        return row;
      }
      return null;
    } catch (error) {
      throw new DatabaseError('Failed to check for overlapping leave requests', error);
    }
  }

  /**
   * Validate leave type exists and is active for tenant
   */
  static async validateLeaveType(connection, tenantId, leaveTypeId) {
    try {
      const sql = `SELECT LEAVE_TYPE_ID, TENANT_ID, STATUS
        FROM ABS.ABS_LEAVE_TYPES
        WHERE TENANT_ID = :1
          AND LEAVE_TYPE_ID = :2
          AND NVL(STATUS, 'ACTIVE') = 'ACTIVE'`;
      const r = await connection.execute(sql, [tenantId, leaveTypeId], {
        outFormat: oracledb.OUT_FORMAT_OBJECT
      });
      return !!r.rows?.[0];
    } catch (error) {
      throw new DatabaseError('Failed to validate leave type', error);
    }
  }

  /**
   * Compute START_TS, END_TS, and TOTAL_DAYS from dates and portions
   */
  static _computeTimestamps(startDate, endDate, startPortion, endPortion) {
    const start = startDate instanceof Date ? startDate : new Date(startDate);
    const end = endDate instanceof Date ? endDate : new Date(endDate);
    
    // Check if start and end dates are on the same calendar day
    const startDateOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endDateOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    const isSameDay = startDateOnly.getTime() === endDateOnly.getTime();
    
    // Set START_TS based on portion
    let startTs = new Date(start);
    if (startPortion === 'HALF_PM') {
      startTs.setHours(12, 0, 0, 0);
    } else if (startPortion === 'HALF_AM') {
      startTs.setHours(0, 0, 0, 0);
    } else if (startPortion === 'HOURS') {
      startTs.setHours(0, 0, 0, 0);
    } else {
      startTs.setHours(0, 0, 0, 0);
    }

    // Set END_TS based on portion
    let endTs = new Date(end);
    if (endPortion === 'HALF_AM') {
      endTs.setHours(12, 0, 0, 0);
    } else if (endPortion === 'HALF_PM') {
      endTs.setHours(23, 59, 59, 999);
    } else if (endPortion === 'HOURS') {
      endTs.setHours(23, 59, 59, 999);
    } else {
      endTs.setHours(23, 59, 59, 999);
    }

    // Calculate total days (inclusive)
    let totalDays;
    if (isSameDay) {
      // Same day: calculate based on portions
      if (startPortion === 'HALF_AM' && endPortion === 'HALF_AM') {
        totalDays = 0.5; // Morning half-day
      } else if (startPortion === 'HALF_PM' && endPortion === 'HALF_PM') {
        totalDays = 0.5; // Afternoon half-day
      } else if ((startPortion === 'HALF_AM' && endPortion === 'HALF_PM') || 
                 (startPortion === 'HALF_PM' && endPortion === 'HALF_AM')) {
        totalDays = 1; // Full day (AM + PM)
      } else if (startPortion === 'HALF_AM' || startPortion === 'HALF_PM' || 
                 endPortion === 'HALF_AM' || endPortion === 'HALF_PM') {
        totalDays = 1; // Mixed half-day scenarios
      } else {
        totalDays = 1; // Same day, full day = 1 day
      }
    } else {
      // Different days: calculate based on time difference
      const diffTime = endTs - startTs;
      const diffDays = diffTime / (1000 * 60 * 60 * 24);
      // For multi-day ranges, use Math.ceil to round up partial days, then add 1 for inclusive count
      // But we need to handle this more carefully
      const calendarDays = Math.floor(diffDays);
      const remainingHours = (diffDays - calendarDays) * 24;
      
      // Count calendar days inclusively (start day + end day + days in between)
      totalDays = calendarDays + 1;
      
      // Adjust for half-days
      if (startPortion === 'HALF_AM' || startPortion === 'HALF_PM') {
        totalDays -= 0.5;
      }
      if (endPortion === 'HALF_AM' || endPortion === 'HALF_PM') {
        totalDays -= 0.5;
      }
      
      // Ensure minimum of 1 day for any leave request
      totalDays = Math.max(0.5, totalDays);
    }

    return { startTs, endTs, totalDays: totalDays > 0 ? totalDays : 0.5 };
  }

  /**
   * Create leave request with contact and documents in one transaction
   */
  static async createWithContactAndDocuments(data, tenantId, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        const now = new Date();

        // 1. Resolve employee_guid to employee_id
        const employeeId = await this.resolveEmployeeIdByGuid(connection, tenantId, data.employee_guid);
        if (!employeeId) {
          throw new ValidationError(`Employee not found for GUID: ${data.employee_guid}`);
        }

        // 2. Resolve delegated_employee_guid if provided
        let delegatedEmployeeId = null;
        if (data.delegated_employee_guid) {
          delegatedEmployeeId = await this.resolveEmployeeIdByGuid(connection, tenantId, data.delegated_employee_guid);
          if (!delegatedEmployeeId) {
            throw new ValidationError(`Delegated employee not found for GUID: ${data.delegated_employee_guid}`);
          }
        }

        // 3. Validate leave_type_id
        const leaveTypeId = parseInt(data.leave_type_id);
        if (isNaN(leaveTypeId) || leaveTypeId < 1) {
          throw new ValidationError('leave_type_id must be a positive number');
        }
        const isValidLeaveType = await this.validateLeaveType(connection, tenantId, leaveTypeId);
        if (!isValidLeaveType) {
          throw new ValidationError(`Leave type ${leaveTypeId} not found or inactive for tenant ${tenantId}`);
        }

        // 4. Compute timestamps and total days
        const { startTs, endTs, totalDays } = this._computeTimestamps(
          data.start_date,
          data.end_date,
          data.start_portion,
          data.end_portion
        );

        // 4.5. Check for overlapping leave requests
        const startDateObj = startTs instanceof Date ? startTs : new Date(startTs);
        const endDateObj = endTs instanceof Date ? endTs : new Date(endTs);
        const existingRequest = await this.checkOverlappingLeaveRequest(
          connection,
          tenantId,
          employeeId,
          startDateObj,
          endDateObj
        );
        if (existingRequest) {
          const existingStartDate = new Date(existingRequest.start_date).toISOString().split('T')[0];
          const existingEndDate = new Date(existingRequest.end_date).toISOString().split('T')[0];
          throw new ValidationError(
            `You already applied for leaves on these dates. Existing leave request (${existingRequest.request_status}) from ${existingStartDate} to ${existingEndDate}`
          );
        }

        // 5. Generate leave request GUID
        const { buffer: leaveRequestGuidBuffer } = await generateSysGuid(connection);

        // 6. Get next LEAVE_REQUEST_ID
        let leaveRequestId;
        try {
          const seqQuery = `SELECT ABS.ABS_LEAVE_REQUESTS_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`;
          const seqResult = await connection.execute(seqQuery, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
          leaveRequestId = seqResult.rows[0].NEXT_ID;
        } catch {
          const maxQuery = `SELECT NVL(MAX(LEAVE_REQUEST_ID), 0) + 1 AS NEXT_ID FROM ${this.TABLE_NAME}`;
          const maxResult = await connection.execute(maxQuery, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
          leaveRequestId = maxResult.rows[0].NEXT_ID;
        }

        // 7. Determine request status
        // Handle submit field: if explicitly false (boolean or string 'false'), set to DRAFT, otherwise SUBMITTED
        const isSubmitFalse = data.submit === false || data.submit === 'false';
        const requestStatus = isSubmitFalse ? 'DRAFT' : 'SUBMITTED';
        const submittedAt = requestStatus === 'SUBMITTED' ? now : null;

        // 8. Insert leave request
        const insertRequestSql = `INSERT INTO ${this.TABLE_NAME} (
          LEAVE_REQUEST_ID,
          LEAVE_REQUEST_GUID,
          TENANT_ID,
          EMPLOYEE_ID,
          LEAVE_TYPE_ID,
          START_DATE,
          END_DATE,
          START_TS,
          END_TS,
          TOTAL_DAYS,
          REQUEST_STATUS,
          SUBMITTED_AT,
          CREATION_DATE,
          CREATED_BY,
          LAST_UPDATE_DATE,
          LAST_UPDATED_BY
        ) VALUES (
          :1, :2, :3, :4, :5, :6, :7, :8, :9, :10, :11, :12, :13, :14, :15, :16
        )`;

        await connection.execute(insertRequestSql, [
          leaveRequestId,
          leaveRequestGuidBuffer,
          tenantId,
          employeeId,
          leaveTypeId,
          new Date(data.start_date),
          new Date(data.end_date),
          startTs,
          endTs,
          totalDays,
          requestStatus,
          submittedAt,
          now,
          userId || 'SYSTEM',
          now,
          userId || 'SYSTEM'
        ], { autoCommit: false });

        // 9. Insert contact if at least one contact field is provided
        let contact = null;
        const hasContactData = data.reason_for_leave || data.address_during_leave || 
                               data.contact_phone || data.emergency_contact_name || 
                               data.emergency_contact_phone || data.additional_notes || 
                               delegatedEmployeeId;

        if (hasContactData) {
          const { buffer: contactGuidBuffer } = await generateSysGuid(connection);
          let contactId;
          try {
            const seqQuery = `SELECT ABS.ABS_LEAVE_CONTACTS_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`;
            const seqResult = await connection.execute(seqQuery, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
            contactId = seqResult.rows[0].NEXT_ID;
          } catch {
            const maxQuery = `SELECT NVL(MAX(LEAVE_CONTACT_ID), 0) + 1 AS NEXT_ID FROM ABS.ABS_LEAVE_CONTACTS`;
            const maxResult = await connection.execute(maxQuery, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
            contactId = maxResult.rows[0].NEXT_ID;
          }

          const insertContactSql = `INSERT INTO ABS.ABS_LEAVE_CONTACTS (
            LEAVE_CONTACT_ID,
            LEAVE_CONTACT_GUID,
            LEAVE_REQUEST_ID,
            REASON_FOR_LEAVE,
            DELEGATED_EMPLOYEE_ID,
            ADDRESS_DURING_LEAVE,
            CONTACT_PHONE,
            EMERGENCY_CONTACT_NAME,
            EMERGENCY_CONTACT_PHONE,
            ADDITIONAL_NOTES,
            CREATION_DATE,
            CREATED_BY,
            LAST_UPDATE_DATE,
            LAST_UPDATED_BY
          ) VALUES (
            :1, :2, :3, :4, :5, :6, :7, :8, :9, :10, :11, :12, :13, :14
          )`;

          await connection.execute(insertContactSql, [
            contactId,
            contactGuidBuffer,
            leaveRequestId,
            data.reason_for_leave || null,
            delegatedEmployeeId,
            data.address_during_leave || null,
            data.contact_phone || null,
            data.emergency_contact_name || null,
            data.emergency_contact_phone || null,
            data.additional_notes || null,
            now,
            userId || 'SYSTEM',
            now,
            userId || 'SYSTEM'
          ], { autoCommit: false });

          // Construct contact response from inserted data instead of SELECT (performance optimization)
          // Convert GUID buffer to hex string
          const contactGuidHex = contactGuidBuffer.toString('hex').toUpperCase();
          contact = {
            LEAVE_CONTACT_ID: contactId,
            LEAVE_CONTACT_GUID: contactGuidHex,
            LEAVE_REQUEST_ID: leaveRequestId,
            REASON_FOR_LEAVE: data.reason_for_leave || null,
            DELEGATED_EMPLOYEE_ID: delegatedEmployeeId,
            ADDRESS_DURING_LEAVE: data.address_during_leave || null,
            CONTACT_PHONE: data.contact_phone || null,
            EMERGENCY_CONTACT_NAME: data.emergency_contact_name || null,
            EMERGENCY_CONTACT_PHONE: data.emergency_contact_phone || null,
            ADDITIONAL_NOTES: data.additional_notes || null,
            CREATION_DATE: now,
            CREATED_BY: userId || 'SYSTEM',
            LAST_UPDATE_DATE: now,
            LAST_UPDATED_BY: userId || 'SYSTEM'
          };
          contact = this.convertKeysToSnakeCase(contact);
        }

        // 10. Insert documents (optimized: batch GUID generation, skip unnecessary SELECTs)
        const documents = [];
        if (data.documents && Array.isArray(data.documents) && data.documents.length > 0) {
          // Process documents in parallel for better performance
          const documentPromises = data.documents
            .filter(doc => doc.file_name) // Filter out invalid documents first
            .map(async (doc) => {
              const { buffer: docGuidBuffer } = await generateSysGuid(connection);
              let documentId;
              try {
                const seqQuery = `SELECT ABS.ABS_LEAVE_DOCUMENTS_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`;
                const seqResult = await connection.execute(seqQuery, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
                documentId = seqResult.rows[0].NEXT_ID;
              } catch {
                const maxQuery = `SELECT NVL(MAX(DOCUMENT_ID), 0) + 1 AS NEXT_ID FROM ABS.ABS_LEAVE_DOCUMENTS`;
                const maxResult = await connection.execute(maxQuery, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
                documentId = maxResult.rows[0].NEXT_ID;
              }

              let fileBuffer = null;
              let fileHash = null;
              let fileUrl = null;

              // Support both file_buffer (from multipart) and file_base64 (from JSON)
              if (doc.file_buffer && Buffer.isBuffer(doc.file_buffer)) {
                fileBuffer = doc.file_buffer;
                fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex').toUpperCase();
              } else if (doc.file_base64) {
                fileBuffer = Buffer.from(doc.file_base64, 'base64');
                fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex').toUpperCase();
              } else if (doc.file_url) {
                fileUrl = doc.file_url;
              }

              const fileSizeBytes = fileBuffer ? fileBuffer.length : (doc.file_size_mb ? doc.file_size_mb * 1024 * 1024 : 0);
              const fileSizeMb = Math.round((fileSizeBytes / (1024 * 1024)) * 100) / 100;

              const insertDocSql = `INSERT INTO ABS.ABS_LEAVE_DOCUMENTS (
                DOCUMENT_ID,
                DOCUMENT_GUID,
                LEAVE_REQUEST_ID,
                FILE_NAME,
                FILE_TYPE,
                FILE_SIZE_MB,
                FILE_URL,
                FILE_BLOB,
                FILE_HASH,
                CREATION_DATE,
                CREATED_BY,
                LAST_UPDATE_DATE,
                LAST_UPDATED_BY
              ) VALUES (
                :1, :2, :3, :4, :5, :6, :7, :8, :9, :10, :11, :12, :13
              )`;

              await connection.execute(insertDocSql, [
                documentId,
                docGuidBuffer,
                leaveRequestId,
                doc.file_name,
                doc.file_type || 'application/octet-stream',
                fileSizeMb,
                fileUrl,
                fileBuffer,
                fileHash,
                now,
                userId || 'SYSTEM',
                now,
                userId || 'SYSTEM'
              ], { autoCommit: false });

              // Construct response from inserted data instead of SELECT (performance optimization)
              // We know the GUID from docGuidBuffer, convert it to hex string
              const docGuidHex = docGuidBuffer.toString('hex').toUpperCase();
              
              return {
                DOCUMENT_ID: documentId,
                DOCUMENT_GUID: docGuidHex,
                LEAVE_REQUEST_ID: leaveRequestId,
                FILE_NAME: doc.file_name,
                FILE_TYPE: doc.file_type || 'application/octet-stream',
                FILE_SIZE_MB: fileSizeMb,
                FILE_URL: fileUrl,
                FILE_HASH: fileHash,
                CREATION_DATE: now,
                CREATED_BY: userId || 'SYSTEM',
                LAST_UPDATE_DATE: now,
                LAST_UPDATED_BY: userId || 'SYSTEM'
              };
            });

          // Wait for all documents to be inserted
          const insertedDocs = await Promise.all(documentPromises);
          documents.push(...insertedDocs.map(doc => this.convertKeysToSnakeCase(doc)));
        }

        // 11. Construct leave request response from inserted data instead of SELECT (performance optimization)
        // Convert GUID buffer to hex string
        const leaveRequestGuidHex = leaveRequestGuidBuffer.toString('hex').toUpperCase();
        const leaveRequest = {
          LEAVE_REQUEST_ID: leaveRequestId,
          LEAVE_REQUEST_GUID: leaveRequestGuidHex,
          TENANT_ID: tenantId,
          EMPLOYEE_ID: employeeId,
          LEAVE_TYPE_ID: leaveTypeId,
          START_DATE: new Date(data.start_date),
          END_DATE: new Date(data.end_date),
          START_TS: startTs,
          END_TS: endTs,
          TOTAL_DAYS: totalDays,
          REQUEST_STATUS: requestStatus,
          SUBMITTED_AT: submittedAt,
          APPROVED_AT: null,
          REJECTED_AT: null,
          CREATION_DATE: now,
          CREATED_BY: userId || 'SYSTEM',
          LAST_UPDATE_DATE: now,
          LAST_UPDATED_BY: userId || 'SYSTEM'
        };
        
        const leaveRequestConverted = this.convertKeysToSnakeCase(leaveRequest);

        return {
          leave_request: leaveRequestConverted,
          contact: contact,
          documents: documents
        };
      });
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      if (error?.errorNum === 2291 || error?.message?.includes('ORA-02291')) {
        const fkError = new DatabaseError(
          'The referenced record does not exist. Please verify employee_id, leave_type_id, tenant_id.',
          error
        );
        fkError.code = 'FOREIGN_KEY_CONSTRAINT';
        throw fkError;
      }
      if (error?.errorNum !== undefined || error?.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to create leave request with contact and documents', error);
    }
  }

  /**
   * Update a leave request by GUID (HEX32)
   */
  static async updateByGuid(guidHex32, data, userId) {
    try {
      const hexGuid = ensureHex32(guidHex32, 'guid');
      const guidBuffer = hexToRawBuffer(hexGuid);

      return await this.executeWithTransaction(async (connection) => {
        // Current status (for transition timestamps)
        const currentSelect = `SELECT REQUEST_STATUS, APPROVED_AT, REJECTED_AT
          FROM ${this.TABLE_NAME}
          WHERE LEAVE_REQUEST_GUID = :1`;

        const currentResult = await connection.execute(currentSelect, [guidBuffer], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        const currentStatus = currentResult.rows?.[0]?.REQUEST_STATUS || null;

        // Auto timestamps on status transitions
        const now = new Date();
        
        // Handle submit flag - if submit is true, set status to SUBMITTED
        if (data.submit === true || data.submit === 'true') {
          data.REQUEST_STATUS = 'SUBMITTED';
        } else if (data.submit === false || data.submit === 'false') {
          // If submit is false and status was SUBMITTED, revert to DRAFT
          if (currentStatus && String(currentStatus).toUpperCase() === 'SUBMITTED') {
            data.REQUEST_STATUS = 'DRAFT';
          }
        }
        
        if (data.REQUEST_STATUS !== undefined && currentStatus !== null) {
          let newStatus = String(data.REQUEST_STATUS || '').toUpperCase();
          const oldStatus = String(currentStatus || '').toUpperCase();

          // If status is set to PENDING, change it to SUBMITTED (PENDING is not a valid status for updates)
          if (newStatus === 'PENDING') {
            newStatus = 'SUBMITTED';
            data.REQUEST_STATUS = 'SUBMITTED';
          }

          // If updating a DRAFT request without explicit status, automatically set to SUBMITTED
          if (oldStatus === 'DRAFT' && !data.REQUEST_STATUS) {
            newStatus = 'SUBMITTED';
            data.REQUEST_STATUS = 'SUBMITTED';
          }

          if (newStatus === 'APPROVED' && oldStatus !== 'APPROVED') {
            if (data.APPROVED_AT === undefined) data.APPROVED_AT = now;
            if (data.REJECTED_AT === undefined) data.REJECTED_AT = null;
          } else if (newStatus === 'REJECTED' && oldStatus !== 'REJECTED') {
            if (data.REJECTED_AT === undefined) data.REJECTED_AT = now;
            if (data.APPROVED_AT === undefined) data.APPROVED_AT = null;
          } else if (newStatus === 'SUBMITTED' && oldStatus === 'DRAFT') {
            // When changing from DRAFT to SUBMITTED, set submitted_at if not provided
            if (data.SUBMITTED_AT === undefined) data.SUBMITTED_AT = now;
          } else if (newStatus === 'CANCELLED' || newStatus === 'DRAFT') {
            if (data.APPROVED_AT === undefined) data.APPROVED_AT = null;
            if (data.REJECTED_AT === undefined) data.REJECTED_AT = null;
          }
        } else if (!data.REQUEST_STATUS && currentStatus) {
          // If no status provided but current status is DRAFT, auto-upgrade to SUBMITTED
          const oldStatus = String(currentStatus || '').toUpperCase();
          if (oldStatus === 'DRAFT') {
            data.REQUEST_STATUS = 'SUBMITTED';
            if (data.SUBMITTED_AT === undefined) data.SUBMITTED_AT = now;
          }
        }

        // Build UPDATE dynamically
        const updateFields = [];
        const bindParams = [];
        let i = 1;

        if (data.TENANT_ID !== undefined) {
          updateFields.push(`TENANT_ID = :${i}`);
          bindParams.push(data.TENANT_ID !== null ? parseInt(data.TENANT_ID) : null);
          i++;
        }
        if (data.EMPLOYEE_ID !== undefined) {
          updateFields.push(`EMPLOYEE_ID = :${i}`);
          bindParams.push(data.EMPLOYEE_ID !== null ? parseInt(data.EMPLOYEE_ID) : null);
          i++;
        }
        if (data.LEAVE_TYPE_ID !== undefined) {
          updateFields.push(`LEAVE_TYPE_ID = :${i}`);
          bindParams.push(data.LEAVE_TYPE_ID !== null ? parseInt(data.LEAVE_TYPE_ID) : null);
          i++;
        }
        if (data.START_DATE !== undefined) {
          updateFields.push(`START_DATE = :${i}`);
          bindParams.push(data.START_DATE || null);
          i++;
        }
        if (data.END_DATE !== undefined) {
          updateFields.push(`END_DATE = :${i}`);
          bindParams.push(data.END_DATE || null);
          i++;
        }
        if (data.START_TS !== undefined) {
          updateFields.push(`START_TS = :${i}`);
          bindParams.push(data.START_TS || null);
          i++;
        }
        if (data.END_TS !== undefined) {
          updateFields.push(`END_TS = :${i}`);
          bindParams.push(data.END_TS || null);
          i++;
        }
        if (data.TOTAL_DAYS !== undefined) {
          updateFields.push(`TOTAL_DAYS = :${i}`);
          bindParams.push(data.TOTAL_DAYS !== null ? parseFloat(data.TOTAL_DAYS) : null);
          i++;
        }
        if (data.REQUEST_STATUS !== undefined) {
          let statusValue = data.REQUEST_STATUS ? String(data.REQUEST_STATUS).toUpperCase() : null;
          // Convert PENDING to SUBMITTED
          if (statusValue === 'PENDING') {
            statusValue = 'SUBMITTED';
          }
          updateFields.push(`REQUEST_STATUS = :${i}`);
          bindParams.push(statusValue);
          i++;
          
          // If status is being set to SUBMITTED, also set submitted_at if not provided
          if (statusValue === 'SUBMITTED' && data.SUBMITTED_AT === undefined) {
            const currentSubmittedAt = currentResult.rows?.[0]?.SUBMITTED_AT;
            if (!currentSubmittedAt) {
              updateFields.push(`SUBMITTED_AT = :${i}`);
              bindParams.push(now);
              i++;
            }
          }
        }
        if (data.SUBMITTED_AT !== undefined) {
          updateFields.push(`SUBMITTED_AT = :${i}`);
          bindParams.push(data.SUBMITTED_AT || null);
          i++;
        }
        if (data.APPROVED_AT !== undefined) {
          updateFields.push(`APPROVED_AT = :${i}`);
          bindParams.push(data.APPROVED_AT || null);
          i++;
        }
        if (data.REJECTED_AT !== undefined) {
          updateFields.push(`REJECTED_AT = :${i}`);
          bindParams.push(data.REJECTED_AT || null);
          i++;
        }

        if (updateFields.length === 0) {
          // Nothing to update => return current row
          const selectSql = `SELECT 
            a.LEAVE_REQUEST_ID,
            RAWTOHEX(a.LEAVE_REQUEST_GUID) AS LEAVE_REQUEST_GUID,
            a.TENANT_ID,
            a.EMPLOYEE_ID,
            a.LEAVE_TYPE_ID,
            a.START_DATE,
            a.END_DATE,
            a.START_TS,
            a.END_TS,
            a.TOTAL_DAYS,
            a.REQUEST_STATUS,
            a.SUBMITTED_AT,
            a.APPROVED_AT,
            a.REJECTED_AT,
            a.CREATION_DATE,
            a.CREATED_BY,
            a.LAST_UPDATE_DATE,
            a.LAST_UPDATED_BY
          FROM ${this.TABLE_NAME} a
          WHERE a.LEAVE_REQUEST_GUID = :1`;

          const selectResult = await connection.execute(selectSql, [guidBuffer], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });

          if (selectResult.rows?.length) return this.convertKeysToSnakeCase(selectResult.rows[0]);
          throw new DatabaseError('Leave request not found');
        }

        // Audit
        updateFields.push(`LAST_UPDATED_BY = :${i}`);
        bindParams.push(userId || 'SYSTEM');
        i++;

        updateFields.push(`LAST_UPDATE_DATE = :${i}`);
        bindParams.push(new Date());
        i++;

        // WHERE
        bindParams.push(guidBuffer);
        const updateSql = `UPDATE ${this.TABLE_NAME}
          SET ${updateFields.join(', ')}
          WHERE LEAVE_REQUEST_GUID = :${i}`;

        const updateResult = await connection.execute(updateSql, bindParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        if (updateResult.rowsAffected === 0) throw new DatabaseError('Leave request not found');

        // Return updated row
        const selectSql = `SELECT 
          a.LEAVE_REQUEST_ID,
          RAWTOHEX(a.LEAVE_REQUEST_GUID) AS LEAVE_REQUEST_GUID,
          a.TENANT_ID,
          a.EMPLOYEE_ID,
          a.LEAVE_TYPE_ID,
          a.START_DATE,
          a.END_DATE,
          a.START_TS,
          a.END_TS,
          a.TOTAL_DAYS,
          a.REQUEST_STATUS,
          a.SUBMITTED_AT,
          a.APPROVED_AT,
          a.REJECTED_AT,
          a.CREATION_DATE,
          a.CREATED_BY,
          a.LAST_UPDATE_DATE,
          a.LAST_UPDATED_BY
        FROM ${this.TABLE_NAME} a
        WHERE a.LEAVE_REQUEST_GUID = :1`;

        const selectResult = await connection.execute(selectSql, [guidBuffer], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        if (selectResult.rows?.length) return this.convertKeysToSnakeCase(selectResult.rows[0]);
        throw new DatabaseError('Failed to retrieve updated leave request');
      });
    } catch (error) {
      // ✅ IMPORTANT: log raw Oracle error (this will expose your real 409 cause)

      // Mutating table
      if (error?.errorNum === 4091 || error?.message?.includes('ORA-04091')) {
        const mutatingError = new DatabaseError(
          'Cannot update leave request due to a database constraint conflict. Please verify the dates and try again, or contact support if the issue persists.',
          error,
          'Cannot update leave request due to a database constraint conflict. Please verify the dates and try again, or contact support if the issue persists.'
        );
        mutatingError.code = 'MUTATING_TABLE_ERROR';
        throw mutatingError;
      }

      // FK
      if (error?.errorNum === 2291 || error?.message?.includes('ORA-02291')) {
        const userMessage =
          'The referenced record does not exist. Please verify employee_id, leave_type_id, tenant_id (if provided), and employee belongs to tenant.';
        const fkError = new DatabaseError(userMessage, error, userMessage);
        fkError.code = 'FOREIGN_KEY_CONSTRAINT';
        throw fkError;
      }

      // NOT NULL
      if (error?.errorNum === 1400 || error?.message?.includes('ORA-01400')) {
        const notNullError = new DatabaseError('Required fields are missing.', error, 'Required fields are missing.');
        notNullError.code = 'NOT_NULL_CONSTRAINT';
        throw notNullError;
      }

      if (error?.errorNum !== undefined || error?.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to update leave request', error);
    }
  }

  /**
   * Delete or withdraw leave request by GUID (HEX32)
   * - DRAFT requests: Can be deleted (removed from database)
   * - SUBMITTED requests: Can be withdrawn (status changed to WITHDRAWN, not deleted)
   * - Other statuses (APPROVED, REJECTED, CANCELLED, WITHDRAWN): Cannot be deleted or withdrawn
   * 
   * @param {string} guidHex32 - Leave request GUID as hex32 string
   * @param {string} userId - User ID for audit fields
   * @returns {Object} Result object with action taken and leave request data (if withdrawn)
   */
  static async deleteByGuid(guidHex32, userId) {
    try {
      const hexGuid = ensureHex32(guidHex32, 'guid');
      const guidBuffer = hexToRawBuffer(hexGuid);

      return await this.executeWithTransaction(async (connection) => {
        // First, get the leave request details including status
        const selectSql = `SELECT 
          LEAVE_REQUEST_ID,
          REQUEST_STATUS
        FROM ${this.TABLE_NAME} 
        WHERE LEAVE_REQUEST_GUID = :1`;
        const selectResult = await connection.execute(selectSql, [guidBuffer], { outFormat: oracledb.OUT_FORMAT_OBJECT });

        if (!selectResult.rows || selectResult.rows.length === 0) {
          throw new DatabaseError('Leave request not found');
        }

        const leaveRequestId = selectResult.rows[0].LEAVE_REQUEST_ID;
        const currentStatus = String(selectResult.rows[0].REQUEST_STATUS || '').toUpperCase();

        // Handle based on status
        if (currentStatus === 'DRAFT') {
          // DRAFT: Delete completely
        // Delete all related leave documents first (they have BLOBs)
        const deleteDocumentsSql = `DELETE FROM ABS.ABS_LEAVE_DOCUMENTS WHERE LEAVE_REQUEST_ID = :1`;
        await connection.execute(deleteDocumentsSql, [leaveRequestId], { outFormat: oracledb.OUT_FORMAT_OBJECT });

        // Delete all related leave contacts
        const deleteContactsSql = `DELETE FROM ABS.ABS_LEAVE_CONTACTS WHERE LEAVE_REQUEST_ID = :1`;
        await connection.execute(deleteContactsSql, [leaveRequestId], { outFormat: oracledb.OUT_FORMAT_OBJECT });

        // Finally, delete the leave request
        const deleteRequestSql = `DELETE FROM ${this.TABLE_NAME} WHERE LEAVE_REQUEST_GUID = :1`;
        const deleteResult = await connection.execute(deleteRequestSql, [guidBuffer], { outFormat: oracledb.OUT_FORMAT_OBJECT });

        if (deleteResult.rowsAffected === 0) {
          throw new DatabaseError('Leave request not found');
        }

          return { action: 'deleted', leaveRequest: null };
        } else if (currentStatus === 'SUBMITTED') {
          // SUBMITTED: Withdraw (change status to WITHDRAWN, don't delete)
          const now = new Date();
          const updateSql = `UPDATE ${this.TABLE_NAME}
            SET REQUEST_STATUS = 'WITHDRAWN',
                APPROVED_AT = NULL,
                REJECTED_AT = NULL,
                LAST_UPDATE_DATE = :1,
                LAST_UPDATED_BY = :2
            WHERE LEAVE_REQUEST_GUID = :3`;

          await connection.execute(updateSql, [now, userId || 'SYSTEM', guidBuffer], { outFormat: oracledb.OUT_FORMAT_OBJECT });

          // Fetch the updated leave request
          const fetchSql = `SELECT 
            LEAVE_REQUEST_ID,
            RAWTOHEX(LEAVE_REQUEST_GUID) AS LEAVE_REQUEST_GUID,
            TENANT_ID,
            EMPLOYEE_ID,
            LEAVE_TYPE_ID,
            START_DATE,
            END_DATE,
            START_TS,
            END_TS,
            TOTAL_DAYS,
            REQUEST_STATUS,
            SUBMITTED_AT,
            APPROVED_AT,
            REJECTED_AT,
            CREATION_DATE,
            CREATED_BY,
            LAST_UPDATE_DATE,
            LAST_UPDATED_BY
          FROM ${this.TABLE_NAME}
          WHERE LEAVE_REQUEST_GUID = :1`;

          const fetchResult = await connection.execute(fetchSql, [guidBuffer], { outFormat: oracledb.OUT_FORMAT_OBJECT });
          
          if (fetchResult.rows?.length) {
            return { 
              action: 'withdrawn', 
              leaveRequest: this.convertKeysToSnakeCase(fetchResult.rows[0])
            };
          }
          
          throw new DatabaseError('Failed to retrieve withdrawn leave request');
        } else {
          // Other statuses (APPROVED, REJECTED, CANCELLED, WITHDRAWN): Cannot be deleted or withdrawn
          const statusName = currentStatus || 'UNKNOWN';
          throw new ValidationError(
            `Cannot delete or withdraw leave request with status '${statusName}'. Only DRAFT requests can be deleted, and only SUBMITTED requests can be withdrawn.`
          );
        }
      });
    } catch (error) {
      if (error?.message?.includes('must be a 32-character hex GUID')) throw error;
      if (error?.message?.includes('not found')) throw error;
      if (error instanceof ValidationError) throw error;
      if (error?.errorNum !== undefined || error?.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to delete or withdraw leave request', error);
    }
  }

  /**
   * Submit a DRAFT leave request (change status to SUBMITTED)
   * @param {string} guidHex32 - Leave request GUID as hex32 string
   * @param {number} tenantId - Tenant ID
   * @param {string} userId - User ID for audit fields
   * @returns {Object} Updated leave request
   */
  static async submitByGuid(guidHex32, tenantId, userId) {
    try {
      const hexGuid = ensureHex32(guidHex32, 'guid');
      const guidBuffer = hexToRawBuffer(hexGuid);

      return await this.executeWithTransaction(async (connection) => {
        // Check current status
        const checkSql = `SELECT 
          LEAVE_REQUEST_ID,
          REQUEST_STATUS,
          TENANT_ID
        FROM ${this.TABLE_NAME}
        WHERE LEAVE_REQUEST_GUID = :1`;

        const checkResult = await connection.execute(checkSql, [guidBuffer], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        if (!checkResult.rows || checkResult.rows.length === 0) {
          throw new DatabaseError('Leave request not found');
        }

        const currentStatus = String(checkResult.rows[0].REQUEST_STATUS || '').toUpperCase();
        const requestTenantId = checkResult.rows[0].TENANT_ID;

        // Validate tenant
        if (requestTenantId !== tenantId) {
          throw new ValidationError('Leave request not found for this tenant');
        }

        // Validate status
        if (currentStatus !== 'DRAFT') {
          throw new ValidationError(
            `Cannot submit leave request with status '${currentStatus}'. Only DRAFT requests can be submitted.`
          );
        }

        // Update status to SUBMITTED
        const now = new Date();
        const updateSql = `UPDATE ${this.TABLE_NAME}
          SET REQUEST_STATUS = 'SUBMITTED',
              SUBMITTED_AT = :1,
              LAST_UPDATE_DATE = :2,
              LAST_UPDATED_BY = :3
          WHERE LEAVE_REQUEST_GUID = :4`;

        await connection.execute(updateSql, [now, now, userId || 'SYSTEM', guidBuffer], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        // Fetch updated leave request
        const selectSql = `SELECT 
          LEAVE_REQUEST_ID,
          RAWTOHEX(LEAVE_REQUEST_GUID) AS LEAVE_REQUEST_GUID,
          TENANT_ID,
          EMPLOYEE_ID,
          LEAVE_TYPE_ID,
          START_DATE,
          END_DATE,
          START_TS,
          END_TS,
          TOTAL_DAYS,
          REQUEST_STATUS,
          SUBMITTED_AT,
          APPROVED_AT,
          REJECTED_AT,
          CREATION_DATE,
          CREATED_BY,
          LAST_UPDATE_DATE,
          LAST_UPDATED_BY
        FROM ${this.TABLE_NAME}
        WHERE LEAVE_REQUEST_GUID = :1`;

        const selectResult = await connection.execute(selectSql, [guidBuffer], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        if (selectResult.rows?.length) {
          return this.convertKeysToSnakeCase(selectResult.rows[0]);
        }
        throw new DatabaseError('Failed to retrieve submitted leave request');
      });
    } catch (error) {
      if (error?.message?.includes('must be a 32-character hex GUID')) throw error;
      if (error instanceof ValidationError) throw error;
      if (error?.errorNum !== undefined || error?.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to submit leave request', error);
    }
  }

  /**
   * Approve a SUBMITTED leave request and deduct balance
   * @param {string} guidHex32 - Leave request GUID as hex32 string
   * @param {number} tenantId - Tenant ID
   * @param {string} userId - User ID for audit fields
   * @returns {Object} Updated leave request and transaction summary
   */
  static async approveByGuid(guidHex32, tenantId, userId) {
    try {
      const hexGuid = ensureHex32(guidHex32, 'guid');
      const guidBuffer = hexToRawBuffer(hexGuid);

      return await this.executeWithTransaction(async (connection) => {
        // Get leave request details
        const selectSql = `SELECT 
          LEAVE_REQUEST_ID,
          REQUEST_STATUS,
          TENANT_ID,
          EMPLOYEE_ID,
          LEAVE_TYPE_ID,
          TOTAL_DAYS
        FROM ${this.TABLE_NAME}
        WHERE LEAVE_REQUEST_GUID = :1`;

        const selectResult = await connection.execute(selectSql, [guidBuffer], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        if (!selectResult.rows || selectResult.rows.length === 0) {
          throw new DatabaseError('Leave request not found');
        }

        const leaveRequest = selectResult.rows[0];
        const currentStatus = String(leaveRequest.REQUEST_STATUS || '').toUpperCase();
        const requestTenantId = leaveRequest.TENANT_ID;
        const employeeId = leaveRequest.EMPLOYEE_ID;
        const leaveTypeId = leaveRequest.LEAVE_TYPE_ID;
        const totalDays = parseFloat(leaveRequest.TOTAL_DAYS) || 0;

        // Validate tenant
        if (requestTenantId !== tenantId) {
          throw new ValidationError('Leave request not found for this tenant');
        }

        // Validate status
        if (currentStatus !== 'SUBMITTED') {
          throw new ValidationError(
            `Cannot approve leave request with status '${currentStatus}'. Only SUBMITTED requests can be approved.`
          );
        }

        // Get current balance (active balance only)
        const balanceSql = `SELECT 
          RAWTOHEX(EMPLOYEE_LEAVE_BALANCE_GUID) AS EMPLOYEE_LEAVE_BALANCE_GUID,
          AVAILABLE_DAYS,
          TAKEN_DAYS,
          STATUS
        FROM ABS.ABS_EMPLOYEE_LEAVE_BALANCES
        WHERE TENANT_ID = :tenant_id
          AND EMPLOYEE_ID = :employee_id
          AND LEAVE_TYPE_ID = :leave_type_id
          AND NVL(STATUS, 'ACTIVE') = 'ACTIVE'`;

        const balanceResult = await connection.execute(balanceSql, {
          tenant_id: tenantId,
          employee_id: employeeId,
          leave_type_id: leaveTypeId
        }, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        if (!balanceResult.rows || balanceResult.rows.length === 0) {
          throw new ValidationError('Leave balance not found for this employee and leave type');
        }

        const balance = balanceResult.rows[0];
        const availableDays = parseFloat(balance.AVAILABLE_DAYS) || 0;

        // Validate available balance
        if (availableDays < totalDays) {
          throw new ValidationError(
            `Insufficient leave balance. Available: ${availableDays} days, Required: ${totalDays} days`
          );
        }

        // Insert transaction
        const { buffer: txnGuidBuffer } = await generateSysGuid(connection);
        const now = new Date();

        // Insert transaction using same pattern as EmployeeLeaveBalanceModel (named binds)
        const insertTxnSql = `
          INSERT INTO ABS.ABS_LEAVE_BALANCE_TXNS (
            TXN_GUID,
            TENANT_ID,
            EMPLOYEE_ID,
            LEAVE_TYPE_ID,
            TXN_TYPE,
            TXN_DATE,
            AMOUNT_DAYS,
            REFERENCE_TYPE,
            REFERENCE_ID,
            COMMENTS,
            CREATION_DATE,
            CREATED_BY,
            LAST_UPDATE_DATE,
            LAST_UPDATED_BY
          ) VALUES (
            :txn_guid,
            :tenant_id,
            :employee_id,
            :leave_type_id,
            :txn_type,
            :txn_date,
            :amount_days,
            :reference_type,
            :reference_id,
            :comments,
            :creation_date,
            :created_by,
            :last_update_date,
            :last_updated_by
          )
        `;

        let insertResult;
        try {
          insertResult = await connection.execute(insertTxnSql, {
            txn_guid: txnGuidBuffer,
            tenant_id: tenantId,
            employee_id: employeeId,
            leave_type_id: leaveTypeId,
            txn_type: 'TAKEN', // Must match CHECK constraint: ACCRUAL, TAKEN, ADJUSTMENT, CARRY_FORWARD, FORFEIT, REVERSAL
            txn_date: now,
            amount_days: -Math.abs(totalDays), // Negative for leave usage
            reference_type: 'LEAVE_REQUEST',
            reference_id: leaveRequest.LEAVE_REQUEST_ID,
            comments: `Leave request approval - ${totalDays} days`,
            creation_date: now,
            created_by: userId || 'SYSTEM',
            last_update_date: now,
            last_updated_by: userId || 'SYSTEM'
          }, { autoCommit: false });
        } catch (insertError) {
          // Handle check constraint violation for TXN_TYPE
          if (insertError.errorNum === 2290 || (insertError.message && insertError.message.includes('ORA-02290'))) {
            const constraintError = new ValidationError(
              'Invalid TXN_TYPE. Must be one of ACCRUAL/TAKEN/ADJUSTMENT/CARRY_FORWARD/FORFEIT/REVERSAL'
            );
            constraintError.code = 'CHECK_CONSTRAINT_VIOLATION';
            throw constraintError;
          }
          
          // Handle invalid column identifier - try fallback with DAYS and NOTES columns
          if (insertError.errorNum === 904 || (insertError.message && insertError.message.includes('ORA-00904'))) {
            const columnMatch = insertError.message?.match(/ORA-00904:.*"(\w+)"/i);
            const columnName = columnMatch ? columnMatch[1] : 'unknown';
            
            // Try fallback with DAYS and NOTES columns
            const fallbackSql = `
              INSERT INTO ABS.ABS_LEAVE_BALANCE_TXNS (
                TXN_GUID,
                TENANT_ID,
                EMPLOYEE_ID,
                LEAVE_TYPE_ID,
                TXN_TYPE,
                TXN_DATE,
                DAYS,
                REFERENCE_TYPE,
                REFERENCE_ID,
                NOTES,
                CREATION_DATE,
                CREATED_BY,
                LAST_UPDATE_DATE,
                LAST_UPDATED_BY
              ) VALUES (
                :txn_guid,
                :tenant_id,
                :employee_id,
                :leave_type_id,
                :txn_type,
                :txn_date,
                :days,
                :reference_type,
                :reference_id,
                :notes,
                :creation_date,
                :created_by,
                :last_update_date,
                :last_updated_by
              )
            `;
            try {
              insertResult = await connection.execute(fallbackSql, {
                txn_guid: txnGuidBuffer,
                tenant_id: tenantId,
                employee_id: employeeId,
                leave_type_id: leaveTypeId,
                txn_type: 'TAKEN',
                txn_date: now,
                days: -Math.abs(totalDays),
                reference_type: 'LEAVE_REQUEST',
                reference_id: leaveRequest.LEAVE_REQUEST_ID,
                notes: `Leave request approval - ${totalDays} days`,
                creation_date: now,
                created_by: userId || 'SYSTEM',
                last_update_date: now,
                last_updated_by: userId || 'SYSTEM'
              }, { autoCommit: false });
            } catch (fallbackError) {
              // If fallback also fails, throw error with better message
              if (fallbackError.errorNum === 2290) {
                const constraintError = new ValidationError(
                  'Invalid TXN_TYPE. Must be one of ACCRUAL/TAKEN/ADJUSTMENT/CARRY_FORWARD/FORFEIT/REVERSAL'
                );
                constraintError.code = 'CHECK_CONSTRAINT_VIOLATION';
                throw constraintError;
              }
              // If fallback also has column error, throw with column name
              const fallbackColumnMatch = fallbackError.message?.match(/ORA-00904:.*"(\w+)"/i);
              const fallbackColumnName = fallbackColumnMatch ? fallbackColumnMatch[1] : columnName;
              const columnError = new DatabaseError(
                `Invalid column identifier '${fallbackColumnName}' in transaction INSERT query. Please verify the table schema.`,
                fallbackError
              );
              columnError.code = 'INVALID_COLUMN';
              throw columnError;
            }
          } else {
            throw insertError;
          }
        }

        if (!insertResult.rowsAffected || insertResult.rowsAffected < 1) {
          throw new DatabaseError('Transaction INSERT affected 0 rows');
        }

        // Fetch the inserted transaction using TXN_GUID (most reliable method)
        // This avoids issues with date/time precision and column name variations
        let fetchTxnSql = `
          SELECT TXN_ID
          FROM ABS.ABS_LEAVE_BALANCE_TXNS
          WHERE TXN_GUID = :txn_guid
        `;

        let fetchResult;
        try {
          fetchResult = await connection.execute(fetchTxnSql, {
            txn_guid: txnGuidBuffer
          }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        } catch (fetchError) {
          // Fallback: Use simpler query with fewer conditions
          const creationDateMinus2s = new Date(now.getTime() - 2000);
          const creationDatePlus2s = new Date(now.getTime() + 2000);
          
          fetchTxnSql = `
            SELECT TXN_ID
            FROM ABS.ABS_LEAVE_BALANCE_TXNS
            WHERE TENANT_ID = :tenant_id
              AND EMPLOYEE_ID = :employee_id
              AND LEAVE_TYPE_ID = :leave_type_id
              AND TXN_TYPE = :txn_type
              AND REFERENCE_TYPE = :reference_type
              AND REFERENCE_ID = :reference_id
              AND CREATION_DATE >= :creation_date_minus_2s
              AND CREATION_DATE <= :creation_date_plus_2s
            ORDER BY TXN_ID DESC
            FETCH FIRST 1 ROW ONLY
          `;
          
          fetchResult = await connection.execute(fetchTxnSql, {
            tenant_id: tenantId,
            employee_id: employeeId,
            leave_type_id: leaveTypeId,
            txn_type: 'TAKEN',
            reference_type: 'LEAVE_REQUEST',
            reference_id: leaveRequest.LEAVE_REQUEST_ID,
            creation_date_minus_2s: creationDateMinus2s,
            creation_date_plus_2s: creationDatePlus2s
          }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        }

        if (!fetchResult.rows || fetchResult.rows.length === 0) {
          throw new DatabaseError('Transaction INSERT succeeded but could not fetch TXN_ID. The transaction may have been inserted but the fetch query failed.');
        }

        const txnId = fetchResult.rows[0].TXN_ID;

        // Fetch full transaction details (handle both AMOUNT_DAYS/DAYS and COMMENTS/NOTES)
        let selectTxnSql = `
          SELECT
            RAWTOHEX(TXN_GUID) AS TXN_GUID,
            TXN_ID,
            TENANT_ID,
            EMPLOYEE_ID,
            LEAVE_TYPE_ID,
            TXN_TYPE,
            TXN_DATE,
            AMOUNT_DAYS,
            REFERENCE_TYPE,
            REFERENCE_ID,
            COMMENTS,
            CREATION_DATE,
            CREATED_BY
          FROM ABS.ABS_LEAVE_BALANCE_TXNS
          WHERE TXN_ID = :txn_id
        `;

        let txnResult;
        try {
          txnResult = await connection.execute(selectTxnSql, {
            txn_id: txnId
          }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        } catch (selectError) {
          // If AMOUNT_DAYS or COMMENTS don't exist, try with DAYS and NOTES
          if (selectError.errorNum === 904 || (selectError.message && selectError.message.includes('ORA-00904'))) {
            selectTxnSql = `
              SELECT
                RAWTOHEX(TXN_GUID) AS TXN_GUID,
                TXN_ID,
                TENANT_ID,
                EMPLOYEE_ID,
                LEAVE_TYPE_ID,
                TXN_TYPE,
                TXN_DATE,
                DAYS AS AMOUNT_DAYS,
                REFERENCE_TYPE,
                REFERENCE_ID,
                NVL(NOTES, COMMENTS) AS COMMENTS,
                CREATION_DATE,
                CREATED_BY
              FROM ABS.ABS_LEAVE_BALANCE_TXNS
              WHERE TXN_ID = :txn_id
            `;
            txnResult = await connection.execute(selectTxnSql, {
              txn_id: txnId
            }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
          } else {
            throw selectError;
          }
        }

        const transaction = txnResult.rows?.[0] ? this.convertKeysToSnakeCase(txnResult.rows[0]) : null;

        // Update balance (using named binds for consistency)
        const updateBalanceSql = `UPDATE ABS.ABS_EMPLOYEE_LEAVE_BALANCES
          SET TAKEN_DAYS = NVL(TAKEN_DAYS, 0) + :total_days,
              AVAILABLE_DAYS = NVL(AVAILABLE_DAYS, 0) - :total_days,
              LAST_UPDATE_DATE = :last_update_date,
              LAST_UPDATED_BY = :last_updated_by
          WHERE TENANT_ID = :tenant_id
            AND EMPLOYEE_ID = :employee_id
            AND LEAVE_TYPE_ID = :leave_type_id
            AND NVL(STATUS, 'ACTIVE') = 'ACTIVE'`;

        await connection.execute(updateBalanceSql, {
          total_days: totalDays,
          last_update_date: now,
          last_updated_by: userId || 'SYSTEM',
          tenant_id: tenantId,
          employee_id: employeeId,
          leave_type_id: leaveTypeId
        }, { autoCommit: false });

        // Update leave request status
        const updateRequestSql = `UPDATE ${this.TABLE_NAME}
          SET REQUEST_STATUS = 'APPROVED',
              APPROVED_AT = :1,
              REJECTED_AT = NULL,
              LAST_UPDATE_DATE = :2,
              LAST_UPDATED_BY = :3
          WHERE LEAVE_REQUEST_GUID = :4`;

        await connection.execute(updateRequestSql, [now, now, userId || 'SYSTEM', guidBuffer], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        // Fetch updated leave request
        const fetchRequestSql = `SELECT 
          LEAVE_REQUEST_ID,
          RAWTOHEX(LEAVE_REQUEST_GUID) AS LEAVE_REQUEST_GUID,
          TENANT_ID,
          EMPLOYEE_ID,
          LEAVE_TYPE_ID,
          START_DATE,
          END_DATE,
          START_TS,
          END_TS,
          TOTAL_DAYS,
          REQUEST_STATUS,
          SUBMITTED_AT,
          APPROVED_AT,
          REJECTED_AT,
          CREATION_DATE,
          CREATED_BY,
          LAST_UPDATE_DATE,
          LAST_UPDATED_BY
        FROM ${this.TABLE_NAME}
        WHERE LEAVE_REQUEST_GUID = :1`;

        const fetchRequestResult = await connection.execute(fetchRequestSql, [guidBuffer], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        if (fetchRequestResult.rows?.length) {
          return {
            leaveRequest: this.convertKeysToSnakeCase(fetchRequestResult.rows[0]),
            transaction: transaction
          };
        }
        throw new DatabaseError('Failed to retrieve approved leave request');
      });
    } catch (error) {
      if (error?.message?.includes('must be a 32-character hex GUID')) throw error;
      if (error instanceof ValidationError) throw error;
      
      // Handle check constraint violation
      if (error?.errorNum === 2290 || (error?.message && error?.message.includes('ORA-02290'))) {
        const constraintError = new ValidationError(
          'Invalid TXN_TYPE. Must be one of ACCRUAL/TAKEN/ADJUSTMENT/CARRY_FORWARD/FORFEIT/REVERSAL'
        );
        constraintError.code = 'CHECK_CONSTRAINT_VIOLATION';
        throw constraintError;
      }
      
      // Handle invalid column identifier with detailed message
      if (error?.errorNum === 904 || (error?.message && error?.message.includes('ORA-00904'))) {
        const columnMatch = error.message?.match(/ORA-00904:.*"(\w+)"/i);
        const columnName = columnMatch ? columnMatch[1] : 'unknown';
        const columnError = new DatabaseError(
          `Invalid column identifier '${columnName}' in approve query. Please verify the table schema.`,
          error
        );
        columnError.code = 'INVALID_COLUMN';
        throw columnError;
      }
      
      if (error?.errorNum !== undefined || error?.message?.includes('ORA-')) {
        // If error is already a DatabaseError, preserve its oracleError
        const oracleError = error instanceof DatabaseError ? error.oracleError : error;
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(oracleError), oracleError);
      }
      if (error instanceof DatabaseError) throw error;
      // Try to extract Oracle error from nested error
      const oracleError = error?.oracleError || error?.originalError || error?.cause || error;
      throw new DatabaseError('Failed to approve leave request', oracleError);
    }
  }

  /**
   * Reject a SUBMITTED leave request
   * @param {string} guidHex32 - Leave request GUID as hex32 string
   * @param {number} tenantId - Tenant ID
   * @param {string} userId - User ID for audit fields
   * @param {Object} rejectionData - Optional rejection reason and comments
   * @returns {Object} Updated leave request
   */
  static async rejectByGuid(guidHex32, tenantId, userId, rejectionData = {}) {
    try {
      const hexGuid = ensureHex32(guidHex32, 'guid');
      const guidBuffer = hexToRawBuffer(hexGuid);

      return await this.executeWithTransaction(async (connection) => {
        // Check current status
        const checkSql = `SELECT 
          LEAVE_REQUEST_ID,
          REQUEST_STATUS,
          TENANT_ID
        FROM ${this.TABLE_NAME}
        WHERE LEAVE_REQUEST_GUID = :1`;

        const checkResult = await connection.execute(checkSql, [guidBuffer], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        if (!checkResult.rows || checkResult.rows.length === 0) {
          throw new DatabaseError('Leave request not found');
        }

        const currentStatus = String(checkResult.rows[0].REQUEST_STATUS || '').toUpperCase();
        const requestTenantId = checkResult.rows[0].TENANT_ID;

        // Validate tenant
        if (requestTenantId !== tenantId) {
          throw new ValidationError('Leave request not found for this tenant');
        }

        // Validate status
        if (currentStatus !== 'SUBMITTED') {
          throw new ValidationError(
            `Cannot reject leave request with status '${currentStatus}'. Only SUBMITTED requests can be rejected.`
          );
        }

        // Update status to REJECTED
        const now = new Date();
        
        // Check if REJECTION_REASON column exists (optional, handle gracefully)
        let updateSql = `UPDATE ${this.TABLE_NAME}
          SET REQUEST_STATUS = 'REJECTED',
              REJECTED_AT = :1,
              APPROVED_AT = NULL,
              LAST_UPDATE_DATE = :2,
              LAST_UPDATED_BY = :3`;

        const updateParams = [now, now, userId || 'SYSTEM'];

        // Try to add rejection reason if column exists and data provided
        if (rejectionData.reason || rejectionData.comments) {
          // Note: We'll try to update REJECTION_REASON if it exists, but won't fail if it doesn't
          // This requires checking column existence or using a try-catch, but for simplicity,
          // we'll just update the main fields and ignore rejection_reason if column doesn't exist
          // The application can store rejection reason in comments or a separate table if needed
        }

        updateSql += ` WHERE LEAVE_REQUEST_GUID = :4`;
        updateParams.push(guidBuffer);

        await connection.execute(updateSql, updateParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        // Fetch updated leave request
        const selectSql = `SELECT 
          LEAVE_REQUEST_ID,
          RAWTOHEX(LEAVE_REQUEST_GUID) AS LEAVE_REQUEST_GUID,
          TENANT_ID,
          EMPLOYEE_ID,
          LEAVE_TYPE_ID,
          START_DATE,
          END_DATE,
          START_TS,
          END_TS,
          TOTAL_DAYS,
          REQUEST_STATUS,
          SUBMITTED_AT,
          APPROVED_AT,
          REJECTED_AT,
          CREATION_DATE,
          CREATED_BY,
          LAST_UPDATE_DATE,
          LAST_UPDATED_BY
        FROM ${this.TABLE_NAME}
        WHERE LEAVE_REQUEST_GUID = :1`;

        const selectResult = await connection.execute(selectSql, [guidBuffer], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        if (selectResult.rows?.length) {
          return this.convertKeysToSnakeCase(selectResult.rows[0]);
        }
        throw new DatabaseError('Failed to retrieve rejected leave request');
      });
    } catch (error) {
      if (error?.message?.includes('must be a 32-character hex GUID')) throw error;
      if (error instanceof ValidationError) throw error;
      if (error?.errorNum !== undefined || error?.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to reject leave request', error);
    }
  }
}

export default LeaveRequestModel;
