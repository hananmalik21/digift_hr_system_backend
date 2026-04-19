// leaveRequestModel.js
import db from '../../../../config/db.js';
import oracledb from 'oracledb';
import crypto from 'crypto';
import { DatabaseError, ValidationError } from '../../../../utils/errors/index.js';
import { ensureHex32, hexToRawBuffer, generateSysGuid } from '../../../../utils/guidUtils.js';
import { safeJson } from '../../../../services/emplEmployeeListService.js';

/** Status used when normalizing legacy PENDING to SUBMITTED */
const REQUEST_STATUS_SUBMITTED = 'SUBMITTED';

/**
 * Leave Request Model — ABS.ABS_LEAVE_REQUESTS
 *
 * Mutations and header reads go through Oracle packages where deployed:
 *   CREATE → ABS_LEAVE_REQUESTS_PKG
 *   Submit / reject / delete-withdraw → ABS_LEAVE_REQUESTS_LIFECYCLE_PKG
 *   Approve → ABS_LEAVE_REQUESTS_APPROVE_PKG
 *   PUT header → ABS_LEAVE_REQUESTS_UPDATE_PKG
 *   Header by GUID → ABS_LEAVE_REQUESTS_QUERY_PKG.OPEN_LEAVE_REQUEST_BY_GUID (or SELECT fallback)
 *
 * List/findAll and overlap check still use parameterized SQL on ABS.ABS_LEAVE_REQUESTS until a list package exists.
 * Contact/documents remain in LeaveContactModel / LeaveDocumentModel (separate tables).
 */
class LeaveRequestModel {
  static TABLE_NAME = 'ABS.ABS_LEAVE_REQUESTS';

  /**
   * Normalize request_status: PENDING -> SUBMITTED (in-place).
   * @param {Object} row - Row with request_status
   */
  static normalizeRequestStatus(row) {
    if (row?.request_status && String(row.request_status).toUpperCase() === 'PENDING') {
      row.request_status = REQUEST_STATUS_SUBMITTED;
    }
  }

  /**
   * Build employee_info and leave_type_info from a joined row; return { employeeInfo, leaveTypeInfo, leaveRequestData }.
   * Used by findAll and findByGuid to avoid duplication.
   */
  static mapRowToLeaveRequest(row) {
    this.normalizeRequestStatus(row);

    let orgStructureList = safeJson(row.emp_org_structure_list);
    if (!Array.isArray(orgStructureList)) orgStructureList = [];

    const employeeInfo = row.emp_employee_id
      ? {
          employee_id: row.emp_employee_id,
          employee_guid: row.emp_employee_guid,
          first_name_en: row.emp_first_name_en,
          middle_name_en: row.emp_middle_name_en,
          last_name_en: row.emp_last_name_en,
          first_name_ar: row.emp_first_name_ar,
          middle_name_ar: row.emp_middle_name_ar,
          last_name_ar: row.emp_last_name_ar,
          family_name_ar: row.emp_family_name_ar,
          email: row.emp_email,
          position_name_en: row.emp_position_name_en ?? null,
          position_name_ar: row.emp_position_name_ar ?? null,
          position_name: row.emp_position_name_en ?? row.emp_position_name_ar ?? null,
          org_structure_list: orgStructureList
        }
      : null;

    const leaveTypeInfo = row.lt_leave_type_id
      ? {
          leave_type_id: row.lt_leave_type_id,
          leave_type_guid: row.lt_leave_type_guid,
          leave_name_en: row.lt_leave_name_en,
          leave_name_ar: row.lt_leave_name_ar,
          leave_code: row.lt_leave_code
        }
      : null;

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
      emp_position_name_en,
      emp_position_name_ar,
      emp_org_structure_list,
      lt_leave_type_id,
      lt_leave_type_guid,
      lt_leave_name_en,
      lt_leave_name_ar,
      lt_leave_code,
      doc_document_id,
      doc_document_guid,
      ...leaveRequestData
    } = row;

    const leaveDocumentInfo =
      doc_document_id != null && doc_document_guid != null
        ? { document_id: doc_document_id, document_guid: doc_document_guid }
        : null;

    return {
      ...leaveRequestData,
      employee_info: employeeInfo,
      leave_type_info: leaveTypeInfo,
      ...(leaveDocumentInfo && { leave_document_info: leaveDocumentInfo })
    };
  }

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

      const pagination = filters.pagination || {};
      const page = pagination.page || 1;
      const pageSize = pagination.pageSize || 10;
      const offset = (page - 1) * pageSize;

      const countQuery = `SELECT COUNT(*) AS total FROM ${this.TABLE_NAME} a${whereClause}`;
      const countBind = [...bindParams];
      const dataBind = [...bindParams];

      const includeFirstDocument = filters.includeFirstDocument === true;
      const docSelect = includeFirstDocument
        ? `, doc.DOCUMENT_ID AS DOC_DOCUMENT_ID, doc.DOCUMENT_GUID AS DOC_DOCUMENT_GUID`
        : '';
      const docJoin = includeFirstDocument
        ? ` LEFT JOIN (
          SELECT LEAVE_REQUEST_ID, DOCUMENT_ID, DOCUMENT_GUID
          FROM (
            SELECT a.LEAVE_REQUEST_ID, a.DOCUMENT_ID, RAWTOHEX(a.DOCUMENT_GUID) AS DOCUMENT_GUID,
                   ROW_NUMBER() OVER (PARTITION BY a.LEAVE_REQUEST_ID ORDER BY a.CREATION_DATE DESC) AS rn
            FROM ABS.ABS_LEAVE_DOCUMENTS a
          ) WHERE rn = 1
        ) doc ON doc.LEAVE_REQUEST_ID = a.LEAVE_REQUEST_ID`
        : '';

      // Run COUNT and data query in parallel to reduce response time
      // ORDER BY START_DATE DESC first (most selective), then CREATION_DATE DESC as tiebreaker
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
        c.REASON_FOR_LEAVE
        ${docSelect},
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
        asg.POSITION_TITLE_EN AS EMP_POSITION_NAME_EN,
        asg.POSITION_TITLE_AR AS EMP_POSITION_NAME_AR,
        asg.ORG_STRUCTURE_LIST AS EMP_ORG_STRUCTURE_LIST,
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
      LEFT JOIN (
        SELECT t.EMPLOYEE_ID, t.ENTERPRISE_ID, p.POSITION_TITLE_EN, p.POSITION_TITLE_AR, asn.ORG_STRUCTURE_LIST
        FROM (
          SELECT v.EMPLOYEE_ID, v.ENTERPRISE_ID, v.POSITION_ID, v.ASSIGNMENT_ID,
                 ROW_NUMBER() OVER (PARTITION BY v.EMPLOYEE_ID, v.ENTERPRISE_ID ORDER BY v.ASSIGNMENT_ID DESC NULLS LAST) AS rn
          FROM EMPL.V_EMPLOYEE_ASSIGNMENTS_LIST v
        ) t
        LEFT JOIN ENT.POSITIONS p ON p.POSITION_ID = t.POSITION_ID
        LEFT JOIN EMPL.ASSIGNMENTS asn ON asn.ASSIGNMENT_ID = t.ASSIGNMENT_ID
        WHERE t.rn = 1
      ) asg ON e.EMPLOYEE_ID = asg.EMPLOYEE_ID AND e.ENTERPRISE_ID = asg.ENTERPRISE_ID
      LEFT JOIN ABS.ABS_LEAVE_TYPES lt
        ON a.LEAVE_TYPE_ID = lt.LEAVE_TYPE_ID
       AND a.TENANT_ID = lt.TENANT_ID
      LEFT JOIN ABS.ABS_LEAVE_CONTACTS c
        ON a.LEAVE_REQUEST_ID = c.LEAVE_REQUEST_ID
      ${docJoin}
      ${whereClause}
      ORDER BY a.START_DATE DESC NULLS LAST, a.CREATION_DATE DESC
      OFFSET :${paramIndex} ROWS FETCH NEXT :${paramIndex + 1} ROWS ONLY`;

      dataBind.push(offset);
      dataBind.push(pageSize);

      const [countResult, dataResult] = await Promise.all([
        this.executeQuery(countQuery, countBind),
        this.executeQuery(dataQuery, dataBind)
      ]);

      const total = countResult.rows[0]?.total || 0;

      const leaveRequests = (dataResult.rows || []).map(row => this.mapRowToLeaveRequest(row));

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
   * Get counts of leave requests: total, approved, rejected, and count with document attached.
   * @param {Object} filters - { tenantId (required), employeeId (optional, for one employee) }
   * @returns {Promise<{ total, submitted_count, approved_count, rejected_count, with_document_count }>}
   */
  static async getCounts(filters = {}) {
    try {
      const conditions = [];
      const bindParams = [];
      let paramIndex = 1;

      if (filters.tenantId) {
        conditions.push(`a.TENANT_ID = :${paramIndex}`);
        bindParams.push(parseInt(filters.tenantId));
        paramIndex++;
      }

      if (filters.employeeId) {
        conditions.push(`a.EMPLOYEE_ID = :${paramIndex}`);
        bindParams.push(parseInt(filters.employeeId));
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

      // Query 1: total, submitted, approved, rejected (no scalar subquery to avoid ORA-00937)
      const mainQuery = `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN a.REQUEST_STATUS = 'SUBMITTED' THEN 1 ELSE 0 END) AS submitted_count,
        SUM(CASE WHEN a.REQUEST_STATUS = 'APPROVED' THEN 1 ELSE 0 END) AS approved_count,
        SUM(CASE WHEN a.REQUEST_STATUS = 'REJECTED' THEN 1 ELSE 0 END) AS rejected_count
      FROM ${this.TABLE_NAME} a
      ${whereClause}`;

      const [mainResult, docResult] = await Promise.all([
        this.executeQuery(mainQuery, bindParams),
        (() => {
          const docConditions = [];
          const docBinds = [];
          let di = 1;
          if (filters.tenantId) {
            docConditions.push(`r.TENANT_ID = :${di}`);
            docBinds.push(parseInt(filters.tenantId));
            di++;
          }
          if (filters.employeeId) {
            docConditions.push(`r.EMPLOYEE_ID = :${di}`);
            docBinds.push(parseInt(filters.employeeId));
          }
          const docWhere = docConditions.length > 0 ? ` WHERE ${docConditions.join(' AND ')}` : '';
          const docQuery = `SELECT COUNT(DISTINCT r.LEAVE_REQUEST_ID) AS with_document_count
            FROM ABS.ABS_LEAVE_DOCUMENTS d
            INNER JOIN ${this.TABLE_NAME} r ON r.LEAVE_REQUEST_ID = d.LEAVE_REQUEST_ID
            ${docWhere}`;
          return this.executeQuery(docQuery, docBinds);
        })()
      ]);

      const row = mainResult.rows?.[0];
      const docRow = docResult.rows?.[0];

      return {
        total: Number(row?.total) || 0,
        submitted_count: Number(row?.submitted_count) || 0,
        approved_count: Number(row?.approved_count) || 0,
        rejected_count: Number(row?.rejected_count) || 0,
        with_document_count: Number(docRow?.with_document_count) || 0
      };
    } catch (error) {
      if (error?.errorNum !== undefined || error?.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to fetch leave request counts', error);
    }
  }

  /**
   * Get single leave request by GUID (HEX32).
   * Header row only via ABS_LEAVE_REQUESTS_QUERY_PKG.OPEN_LEAVE_REQUEST_BY_GUID (or same projection SELECT fallback).
   * No heavy Node JOINs — employee_info / leave_type_info are null unless enriched elsewhere.
   */
  static async findByGuid(guidHex32) {
    try {
      const hexGuid = ensureHex32(guidHex32, 'guid');
      return await this.executeWithTransaction(async (connection) => {
        const row = await this._fetchLeaveRequestRowViaPackage(connection, hexGuid);
        if (!row) return null;
        const snake = this.convertKeysToSnakeCase(row);
        return this.mapRowToLeaveRequest(snake);
      });
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
      const employeeGuidHex = ensureHex32(String(employeeGuid).trim(), 'employeeGuid');
      const guidBuffer = hexToRawBuffer(employeeGuidHex);
      // Bind RAW to EMPLOYEE_GUID — avoids RAWTOHEX string compare / case issues
      const query = `SELECT EMPLOYEE_ID
        FROM EMPL.EMPLOYEES
        WHERE ENTERPRISE_ID = :1
          AND EMPLOYEE_GUID = :2`;
      const result = await connection.execute(query, [tenantId, guidBuffer], {
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
  /** User-facing overlap message (controller also builds same string — single source if needed). */
  static _overlapMessage(overlapping) {
    const a = new Date(overlapping.start_date).toISOString().split('T')[0];
    const b = new Date(overlapping.end_date).toISOString().split('T')[0];
    return `You already applied for leaves on these dates. Existing leave request (${overlapping.request_status}) from ${a} to ${b}`;
  }

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
   * Create via ABS_LEAVE_REQUESTS_PKG.CREATE_LEAVE_REQUEST (synonym or CURRENT_SCHEMA; same POST body/URL).
   * Documents still inserted in Node on the same connection; no COMMIT inside package.
   */
  static async _createWithContactAndDocumentsViaPackage(connection, data, tenantId, userId, now) {
    // Validation is in ABS_LEAVE_REQUESTS_PKG — pass raw values; package returns user-friendly errors.
    const guidHex = data.employee_guid != null ? String(data.employee_guid).trim() : null;
    const submitVal = data.submit === false || data.submit === 'false' ? 'false' : 'true';
    let delegatedGuid = null;
    if (data.delegated_employee_guid != null && String(data.delegated_employee_guid).trim() !== '') {
      delegatedGuid = String(data.delegated_employee_guid).trim();
    }
    const leaveTypeId =
      data.leave_type_id != null && data.leave_type_id !== ''
        ? parseInt(data.leave_type_id, 10)
        : null;
    const binds = {
      tenantId,
      userId: userId || 'SYSTEM',
      employeeGuid: guidHex,
      leaveTypeId,
      startDate: (() => {
        if (data.start_date == null || String(data.start_date).trim() === '') return null;
        const d = new Date(data.start_date);
        return isNaN(d.getTime()) ? null : d;
      })(),
      endDate: (() => {
        if (data.end_date == null || String(data.end_date).trim() === '') return null;
        const d = new Date(data.end_date);
        return isNaN(d.getTime()) ? null : d;
      })(),
      startPortion: data.start_portion || null,
      endPortion: data.end_portion || null,
      submit: submitVal,
      reason: data.reason_for_leave || null,
      address: data.address_during_leave || null,
      contactPhone: data.contact_phone || null,
      emergencyName: data.emergency_contact_name || null,
      emergencyPhone: data.emergency_contact_phone || null,
      additionalNotes: data.additional_notes || null,
      delegatedGuid,
      leaveRequestId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
      guidHexOut: { type: oracledb.STRING, dir: oracledb.BIND_OUT, maxSize: 64 },
      requestStatus: { type: oracledb.STRING, dir: oracledb.BIND_OUT, maxSize: 32 }
    };
    // Must NOT use ABS.ABS_LEAVE_REQUESTS_PKG in anonymous block — PLS-00225 (ABS parsed as cursor).
    // Use unqualified name: connect as ABS, or CREATE SYNONYM ABS_LEAVE_REQUESTS_PKG FOR ABS.ABS_LEAVE_REQUESTS_PKG;
    // CURRENT_SCHEMA defaults to ABS so unqualified package names resolve in ABS (override with ABS_LEAVE_REQUESTS_PKG_SCHEMA; OFF to skip).
    await this._ensureLeaveRequestPackageSchema(connection);
    const createPkg = this._pkgNameFromEnv('ABS_LEAVE_REQUESTS_PKG_NAME', 'ABS_LEAVE_REQUESTS_PKG');
    const plsql = `
      BEGIN
        ${createPkg}.CREATE_LEAVE_REQUEST(
          :tenantId, :userId, :employeeGuid, :leaveTypeId, :startDate, :endDate,
          :startPortion, :endPortion, :submit,
          :reason, :address, :contactPhone, :emergencyName, :emergencyPhone, :additionalNotes,
          :delegatedGuid,
          :leaveRequestId, :guidHexOut, :requestStatus
        );
      END;`;
    let result;
    try {
      result = await connection.execute(plsql, binds, { autoCommit: false });
    } catch (e) {
      const num = e.errorNum;
      const msg = (e.message || '').split('ORA-06512')[0].replace(/^ORA-\d+:?\s*/i, '').trim();
      // Package validation -20401..-20499 and business -20001..-20004 → ValidationError for API 400
      if (
        (num >= 20001 && num <= 20004) ||
        (num >= 20401 && num <= 20499) ||
        num === 20480 ||
        num === 20481 ||
        num === 20482
      ) {
        throw new ValidationError(msg || e.message || 'Invalid leave request.');
      }
      if (num === 20998 || num === 20999) {
        throw new ValidationError(msg || 'Leave request package not fully deployed.');
      }
      throw e;
    }
    const ob = result.outBinds || {};
    const leaveRequestId = Array.isArray(ob.leaveRequestId) ? ob.leaveRequestId[0] : ob.leaveRequestId;
    const leaveRequestGuidHex = (Array.isArray(ob.guidHexOut) ? ob.guidHexOut[0] : ob.guidHexOut) || '';
    const requestStatus = (Array.isArray(ob.requestStatus) ? ob.requestStatus[0] : ob.requestStatus) || 'SUBMITTED';

    // Contact row (package inserted; fetch for response shape)
    let contact = null;
    const contactResult = await connection.execute(
      `SELECT * FROM ABS.ABS_LEAVE_CONTACTS WHERE LEAVE_REQUEST_ID = :1`,
      [leaveRequestId],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if (contactResult.rows?.[0]) {
      contact = this.convertKeysToSnakeCase(contactResult.rows[0]);
      if (contact.leave_contact_guid && Buffer.isBuffer(contact.leave_contact_guid)) {
        contact.leave_contact_guid = contact.leave_contact_guid.toString('hex').toUpperCase();
      }
    }

    // Documents: same loop as createWithContactAndDocuments (BLOB + hash in Node)
    const documents = [];
    if (data.documents && Array.isArray(data.documents) && data.documents.length > 0) {
      const documentPromises = data.documents
        .filter(doc => doc.file_name)
        .map(async (doc) => {
          const { buffer: docGuidBuffer } = await generateSysGuid(connection);
          let documentId;
          try {
            const seqResult = await connection.execute(
              `SELECT ABS.ABS_LEAVE_DOCUMENTS_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`,
              [],
              { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            documentId = seqResult.rows[0].NEXT_ID;
          } catch {
            const maxResult = await connection.execute(
              `SELECT NVL(MAX(DOCUMENT_ID), 0) + 1 AS NEXT_ID FROM ABS.ABS_LEAVE_DOCUMENTS`,
              [],
              { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            documentId = maxResult.rows[0].NEXT_ID;
          }
          let fileBuffer = null;
          let fileHash = null;
          let fileUrl = null;
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
            DOCUMENT_ID, DOCUMENT_GUID, LEAVE_REQUEST_ID, FILE_NAME, FILE_TYPE, FILE_SIZE_MB,
            FILE_URL, FILE_BLOB, FILE_HASH, CREATION_DATE, CREATED_BY, LAST_UPDATE_DATE, LAST_UPDATED_BY
          ) VALUES (
            :1, :2, :3, :4, :5, :6, :7, :8, :9, :10, :11, :12, :13
          )`;
          await connection.execute(insertDocSql, [
            documentId, docGuidBuffer, leaveRequestId, doc.file_name,
            doc.file_type || 'application/octet-stream', fileSizeMb, fileUrl, fileBuffer, fileHash,
            now, userId || 'SYSTEM', now, userId || 'SYSTEM'
          ], { autoCommit: false });
          const docGuidHex = docGuidBuffer.toString('hex').toUpperCase();
          return this.convertKeysToSnakeCase({
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
          });
        });
      documents.push(...(await Promise.all(documentPromises)));
    }

    const leaveRequest = this.convertKeysToSnakeCase({
      LEAVE_REQUEST_ID: leaveRequestId,
      LEAVE_REQUEST_GUID: leaveRequestGuidHex,
      TENANT_ID: tenantId,
      EMPLOYEE_ID: null,
      LEAVE_TYPE_ID: leaveTypeId,
      START_DATE: new Date(data.start_date),
      END_DATE: new Date(data.end_date),
      REQUEST_STATUS: requestStatus,
      SUBMITTED_AT: requestStatus === 'SUBMITTED' ? now : null,
      APPROVED_AT: null,
      REJECTED_AT: null,
      CREATION_DATE: now,
      CREATED_BY: userId || 'SYSTEM',
      LAST_UPDATE_DATE: now,
      LAST_UPDATED_BY: userId || 'SYSTEM'
    });
    // Resolve employee_id for response (optional)
    try {
      const empId = await this.resolveEmployeeIdByGuid(connection, tenantId, data.employee_guid);
      if (empId) leaveRequest.employee_id = empId;
    } catch (_) {}

    return { leave_request: leaveRequest, contact, documents };
  }

  /**
   * Set CURRENT_SCHEMA so unqualified ABS_LEAVE_REQUESTS_*_PKG resolves in ABS.
   * Packages live in ABS — default is ABS. Override with ABS_LEAVE_REQUESTS_PKG_SCHEMA
   * (e.g. ADMIN). Set to OFF to skip ALTER (e.g. connect as ABS or synonyms only).
   */
  static async _ensureLeaveRequestPackageSchema(connection) {
    let pkgSchema = (process.env.ABS_LEAVE_REQUESTS_PKG_SCHEMA || '').trim();
    if (!pkgSchema || pkgSchema.toUpperCase() === 'ABS') {
      pkgSchema = 'ABS';
    }
    if (pkgSchema.toUpperCase() === 'OFF' || pkgSchema === '0') {
      return;
    }
    await connection.execute(
      `ALTER SESSION SET CURRENT_SCHEMA = ${pkgSchema.replace(/[^A-Za-z0-9_]/g, '')}`
    );
  }

  /** Oracle application error message without stack line */
  static _pkgErrorMessage(e) {
    return (e?.message || '').split('ORA-06512')[0].replace(/^ORA-\d+:?\s*/i, '').trim() || e?.message;
  }

  /**
   * Single entry for package RAISE_APPLICATION_ERROR ranges — keeps Node thin; all mutations delegate to DB.
   * -205xx lifecycle | -206xx approve | -207xx update | -20801 query GUID
   */
  static _rethrowLeaveRequestPackageError(e) {
    const num = e?.errorNum;
    const msg = this._pkgErrorMessage(e);
    if (num >= 20501 && num <= 20503) {
      if (num === 20501) throw new DatabaseError(msg || 'Leave request not found.', e);
      throw new ValidationError(msg || 'Invalid operation.');
    }
    if (num >= 20601 && num <= 20605) {
      if (num === 20601) throw new DatabaseError(msg || 'Leave request not found.', e);
      throw new ValidationError(msg || 'Cannot approve leave request.');
    }
    if (num >= 20701 && num <= 20703) {
      if (num === 20701) throw new DatabaseError(msg || 'Leave request not found.', e);
      if (num === 20702) throw new ValidationError(msg || 'Leave request not found for this tenant.', e);
      throw new ValidationError(msg || 'No fields to update.');
    }
    if (num === 20801) throw new ValidationError(msg || 'Invalid leave request GUID.');
    throw e;
  }

  static _lifecyclePkgName() {
    return this._pkgNameFromEnv('ABS_LEAVE_REQUESTS_LIFECYCLE_PKG_NAME', 'ABS_LEAVE_REQUESTS_LIFECYCLE_PKG');
  }

  /** Sanitized package name from env (PLS-00225-safe identifier only). */
  static _pkgNameFromEnv(envKey, fallback) {
    const n = (process.env[envKey] || '').trim().replace(/[^A-Za-z0-9_]/g, '');
    return n || fallback;
  }

  /**
   * Shared catch for mutation methods — avoids repeating the same 5-line block on submit/reject/delete.
   */
  static _rethrowMutationFailure(error, operationLabel) {
    if (error?.message?.includes('must be a 32-character hex GUID')) throw error;
    if (error?.message?.includes('not found')) throw error;
    if (error instanceof ValidationError) throw error;
    if (error?.errorNum !== undefined || error?.message?.includes('ORA-')) {
      throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
    }
    if (error instanceof DatabaseError) throw error;
    throw new DatabaseError(operationLabel, error);
  }

  /** Load balance txn row after approve (schema variants AMOUNT_DAYS vs DAYS). */
  static async _fetchBalanceTxnRow(connection, txnIdNum) {
    const binds = { txn_id: txnIdNum };
    const opts = { outFormat: oracledb.OUT_FORMAT_OBJECT };
    const sqlPrimary = `
      SELECT RAWTOHEX(TXN_GUID) AS TXN_GUID, TXN_ID, TENANT_ID, EMPLOYEE_ID, LEAVE_TYPE_ID,
        TXN_TYPE, TXN_DATE, AMOUNT_DAYS, REFERENCE_TYPE, REFERENCE_ID, COMMENTS, CREATION_DATE, CREATED_BY
      FROM ABS.ABS_LEAVE_BALANCE_TXNS WHERE TXN_ID = :txn_id`;
    try {
      const r = await connection.execute(sqlPrimary, binds, opts);
      if (r.rows?.[0]) return this.convertKeysToSnakeCase(r.rows[0]);
    } catch (selectError) {
      if (selectError.errorNum !== 904 && !selectError.message?.includes('ORA-00904')) throw selectError;
    }
    const sqlFallback = `
      SELECT RAWTOHEX(TXN_GUID) AS TXN_GUID, TXN_ID, TENANT_ID, EMPLOYEE_ID, LEAVE_TYPE_ID,
        TXN_TYPE, TXN_DATE, DAYS AS AMOUNT_DAYS, REFERENCE_TYPE, REFERENCE_ID,
        NVL(NOTES, COMMENTS) AS COMMENTS, CREATION_DATE, CREATED_BY
      FROM ABS.ABS_LEAVE_BALANCE_TXNS WHERE TXN_ID = :txn_id`;
    const r2 = await connection.execute(sqlFallback, binds, opts);
    return r2.rows?.[0] ? this.convertKeysToSnakeCase(r2.rows[0]) : null;
  }

  /** Run lifecycle proc with 3 binds (submit/reject). */
  static async _lifecycleExecute3(connection, procedure, binds) {
    await this._ensureLeaveRequestPackageSchema(connection);
    const pkg = this._lifecyclePkgName();
    await connection.execute(
      `BEGIN ${pkg}.${procedure}(:hex, :tenantId, :userId); END;`,
      binds,
      { autoCommit: false }
    );
  }

  /** Header row after mutation — always via QUERY_PKG or SELECT fallback (same projection). */
  static async _rowSnakeAfterMutation(connection, hexGuid) {
    const row = await this._fetchLeaveRequestRowViaPackage(connection, hexGuid);
    return row ? this.convertKeysToSnakeCase(row) : null;
  }

  /**
   * Fetch leave request header row. Prefers ABS_LEAVE_REQUESTS_QUERY_PKG.OPEN_LEAVE_REQUEST_BY_GUID;
   * falls back to direct SELECT if package missing/stub (PLS-00302) or env FORCE_LEAVE_REQUEST_ROW_SELECT=1.
   */
  static async _fetchLeaveRequestRowViaPackage(connection, hexGuid) {
    const guidBuffer = hexToRawBuffer(ensureHex32(hexGuid, 'guid'));
    const forceSelect = String(process.env.FORCE_LEAVE_REQUEST_ROW_SELECT || '').toLowerCase() === '1' ||
      String(process.env.FORCE_LEAVE_REQUEST_ROW_SELECT || '').toLowerCase() === 'true';

    if (!forceSelect) {
      await this._ensureLeaveRequestPackageSchema(connection);
      const curBind = { type: oracledb.CURSOR, dir: oracledb.BIND_OUT };
      try {
        const pkg = this._pkgNameFromEnv('ABS_LEAVE_REQUESTS_QUERY_PKG_NAME', 'ABS_LEAVE_REQUESTS_QUERY_PKG');
        const result = await connection.execute(
          `BEGIN ${pkg}.OPEN_LEAVE_REQUEST_BY_GUID(:hex, :cur); END;`,
          { hex: hexGuid, cur: curBind },
          { autoCommit: false }
        );
        const cursor = result.outBinds && (Array.isArray(result.outBinds.cur) ? result.outBinds.cur[0] : result.outBinds.cur);
        if (cursor) {
          try {
            const rows = await cursor.getRows(2);
            if (rows && rows.length > 1) {
              await cursor.close();
              throw new DatabaseError('Multiple rows for leave request GUID.');
            }
            if (rows && rows.length) return rows[0];
          } finally {
            try {
              await cursor.close();
            } catch (_) {}
          }
        }
      } catch (e) {
        const msg = (e.message || '').toUpperCase();
        const isPls302 = e?.errorNum === 6550 && msg.includes('PLS-00302') && msg.includes('OPEN_LEAVE_REQUEST_BY_GUID');
        if (!isPls302) this._rethrowLeaveRequestPackageError(e);
        // else fall through to SELECT below
      }
    }

    // Fallback / fast path: single SELECT (no refcursor) — same projection as QUERY_PKG body
    return this._selectLeaveRequestRowByGuidBuffer(connection, guidBuffer);
  }

  /**
   * Single round-trip header row from ABS_LEAVE_REQUESTS (no joins). Use for PUT prefetch + after UPDATE_PKG.
   */
  static async _selectLeaveRequestRowByGuidBuffer(connection, guidBuffer) {
    const selectSql = `SELECT LEAVE_REQUEST_ID, RAWTOHEX(LEAVE_REQUEST_GUID) AS LEAVE_REQUEST_GUID, TENANT_ID,
      EMPLOYEE_ID, LEAVE_TYPE_ID, START_DATE, END_DATE, START_TS, END_TS, TOTAL_DAYS,
      REQUEST_STATUS, SUBMITTED_AT, APPROVED_AT, REJECTED_AT, CREATION_DATE, CREATED_BY,
      LAST_UPDATE_DATE, LAST_UPDATED_BY FROM ${this.TABLE_NAME} WHERE LEAVE_REQUEST_GUID = :1`;
    const selectResult = await connection.execute(selectSql, [guidBuffer], { outFormat: oracledb.OUT_FORMAT_OBJECT });
    return selectResult.rows?.[0] || null;
  }

  /**
   * Lightweight existence + fields for PUT preload. Same as findByGuid path: QUERY_PKG / SELECT on ABS_LEAVE_REQUESTS only.
   */
  static async findByGuidForPut(guidHex32) {
    try {
      const hexGuid = ensureHex32(guidHex32, 'guid');
      return await this.executeWithTransaction(async (connection) => {
        const row = await this._fetchLeaveRequestRowViaPackage(connection, hexGuid);
        if (!row) return null;
        return {
          leave_request_id: row.LEAVE_REQUEST_ID,
          tenant_id: row.TENANT_ID,
          employee_id: row.EMPLOYEE_ID,
          start_date: row.START_DATE,
          end_date: row.END_DATE,
          request_status: row.REQUEST_STATUS,
          submitted_at: row.SUBMITTED_AT,
          _oracleHeaderRow: row
        };
      });
    } catch (error) {
      if (error?.message?.includes('must be a 32-character hex GUID')) throw error;
      if (error?.errorNum !== undefined || error?.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      throw error;
    }
  }

  /** Bitmask for ABS_LEAVE_REQUESTS_UPDATE_PKG.UPDATE_BY_GUID (must match package). */
  static _UPDATE_MASK = {
    TENANT_ID: 1,
    EMPLOYEE_ID: 2,
    LEAVE_TYPE_ID: 4,
    START_DATE: 8,
    END_DATE: 16,
    START_TS: 32,
    END_TS: 64,
    TOTAL_DAYS: 128,
    REQUEST_STATUS: 256,
    SUBMITTED_AT: 512,
    APPROVED_AT: 1024,
    REJECTED_AT: 2048
  };

  /**
   * Create leave request with contact and documents in one transaction.
   * Create path is only via ABS_LEAVE_REQUESTS_PKG (header + contact in DB); documents inserted in Node after.
   */
  static async createWithContactAndDocuments(data, tenantId, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        const now = new Date();
        return await this._createWithContactAndDocumentsViaPackage(connection, data, tenantId, userId, now);
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
   * Update a leave request by GUID (HEX32).
   * @param {object} [options] — options.preloadedOracleHeaderRow: row from findByGuidForPut._oracleHeaderRow to skip first fetch
   */
  static async updateByGuid(guidHex32, data, userId, tenantId = null, options = {}) {
    try {
      const hexGuid = ensureHex32(guidHex32, 'guid');
      const guidBuffer = hexToRawBuffer(hexGuid);
      const preloaded = options.preloadedOracleHeaderRow || null;

      return await this.executeWithTransaction(async (connection) => {
        // Overlap check on same connection (avoids extra getConnection/close before update)
        const oc = options.overlapCheck;
        if (oc && oc.tenantId != null && oc.employeeId != null && oc.startDate && oc.endDate) {
          const overlapping = await this.checkOverlappingLeaveRequest(
            connection,
            oc.tenantId,
            oc.employeeId,
            oc.startDate,
            oc.endDate,
            oc.excludeLeaveRequestId
          );
          if (overlapping) throw new ValidationError(this._overlapMessage(overlapping));
        }

        // First fetch: use preloaded header from PUT fast path, else package/refcursor (slower)
        let currentRow = preloaded;
        if (!currentRow) {
          currentRow = await this._fetchLeaveRequestRowViaPackage(connection, hexGuid);
        }
        if (!currentRow && (data.REQUEST_STATUS !== undefined || data.submit !== undefined)) {
          throw new DatabaseError('Leave request not found');
        }
        const currentStatus = currentRow?.REQUEST_STATUS || null;

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

        // Build bitmask + binds for ABS_LEAVE_REQUESTS_UPDATE_PKG (same columns as before)
        const M = this._UPDATE_MASK;
        let mask = 0;
        let bTenant = null,
          bEmp = null,
          bLt = null,
          bStartDate = null,
          bEndDate = null,
          bStartTs = null,
          bEndTs = null,
          bTotal = null,
          bStatus = null,
          bSubmitted = null,
          bApproved = null,
          bRejected = null;

        if (data.TENANT_ID !== undefined) {
          mask |= M.TENANT_ID;
          bTenant = data.TENANT_ID !== null ? parseInt(data.TENANT_ID, 10) : null;
        }
        if (data.EMPLOYEE_ID !== undefined) {
          mask |= M.EMPLOYEE_ID;
          bEmp = data.EMPLOYEE_ID !== null ? parseInt(data.EMPLOYEE_ID, 10) : null;
        }
        if (data.LEAVE_TYPE_ID !== undefined) {
          mask |= M.LEAVE_TYPE_ID;
          bLt = data.LEAVE_TYPE_ID !== null ? parseInt(data.LEAVE_TYPE_ID, 10) : null;
        }
        if (data.START_DATE !== undefined) {
          mask |= M.START_DATE;
          bStartDate = data.START_DATE || null;
        }
        if (data.END_DATE !== undefined) {
          mask |= M.END_DATE;
          bEndDate = data.END_DATE || null;
        }
        if (data.START_TS !== undefined) {
          mask |= M.START_TS;
          bStartTs = data.START_TS || null;
        }
        if (data.END_TS !== undefined) {
          mask |= M.END_TS;
          bEndTs = data.END_TS || null;
        }
        if (data.TOTAL_DAYS !== undefined) {
          mask |= M.TOTAL_DAYS;
          bTotal = data.TOTAL_DAYS !== null ? parseFloat(data.TOTAL_DAYS) : null;
        }
        if (data.REQUEST_STATUS !== undefined) {
          let statusValue = data.REQUEST_STATUS ? String(data.REQUEST_STATUS).toUpperCase() : null;
          if (statusValue === 'PENDING') statusValue = 'SUBMITTED';
          mask |= M.REQUEST_STATUS;
          bStatus = statusValue;
          if (statusValue === 'SUBMITTED' && data.SUBMITTED_AT === undefined) {
            const currentSubmittedAt = currentRow?.SUBMITTED_AT;
            if (!currentSubmittedAt) {
              mask |= M.SUBMITTED_AT;
              bSubmitted = now;
            }
          }
        }
        if (data.SUBMITTED_AT !== undefined) {
          mask |= M.SUBMITTED_AT;
          bSubmitted = data.SUBMITTED_AT || null;
        }
        if (data.APPROVED_AT !== undefined) {
          mask |= M.APPROVED_AT;
          bApproved = data.APPROVED_AT || null;
        }
        if (data.REJECTED_AT !== undefined) {
          mask |= M.REJECTED_AT;
          bRejected = data.REJECTED_AT || null;
        }

        if (mask === 0) {
          // No UPDATE_PKG call — need full row for response; preloaded may be header-only
          const row =
            currentRow && currentRow.LEAVE_REQUEST_GUID !== undefined
              ? currentRow
              : await this._selectLeaveRequestRowByGuidBuffer(connection, guidBuffer);
          if (row) return this.convertKeysToSnakeCase(row);
          throw new DatabaseError('Leave request not found');
        }

        await this._ensureLeaveRequestPackageSchema(connection);
        // Unqualified only (PLS-00225 if ABS.ABS_LEAVE_REQUESTS_UPDATE_PKG). Resolves to ABS via CURRENT_SCHEMA or synonym.
        const updatePkg = this._pkgNameFromEnv('ABS_LEAVE_REQUESTS_UPDATE_PKG_NAME', 'ABS_LEAVE_REQUESTS_UPDATE_PKG');
        const updateBinds = {
          hex: hexGuid,
          tenantId: tenantId != null ? tenantId : null,
          userId: userId || 'SYSTEM',
          mask,
          b_tenant_id: bTenant,
          b_employee_id: bEmp,
          b_leave_type_id: bLt,
          b_start_date: bStartDate,
          b_end_date: bEndDate,
          b_start_ts: bStartTs,
          b_end_ts: bEndTs,
          b_total_days: bTotal,
          b_request_status: bStatus,
          b_submitted_at: bSubmitted,
          b_approved_at: bApproved,
          b_rejected_at: bRejected
        };
        try {
          await connection.execute(
            `BEGIN ${updatePkg}.UPDATE_BY_GUID(
              :hex, :tenantId, :userId, :mask,
              :b_tenant_id, :b_employee_id, :b_leave_type_id, :b_start_date, :b_end_date,
              :b_start_ts, :b_end_ts, :b_total_days, :b_request_status, :b_submitted_at, :b_approved_at, :b_rejected_at
            ); END;`,
            updateBinds,
            { autoCommit: false }
          );
        } catch (e) {
          this._rethrowLeaveRequestPackageError(e);
        }

        // After UPDATE_PKG: direct SELECT (one round trip, no refcursor) — faster than QUERY_PKG for single row
        const row = await this._selectLeaveRequestRowByGuidBuffer(connection, guidBuffer);
        if (row) return this.convertKeysToSnakeCase(row);
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
      return await this.executeWithTransaction(async (connection) => {
        await this._ensureLeaveRequestPackageSchema(connection);
        const pkg = this._lifecyclePkgName();
        const binds = {
          hex: hexGuid,
          userId: userId || 'SYSTEM',
          actionOut: { type: oracledb.STRING, dir: oracledb.BIND_OUT, maxSize: 32 }
        };
        let result;
        try {
          result = await connection.execute(
            `BEGIN ${pkg}.DELETE_OR_WITHDRAW_BY_GUID(:hex, :userId, :actionOut); END;`,
            binds,
            { autoCommit: false }
          );
        } catch (e) {
          this._rethrowLeaveRequestPackageError(e);
        }
        const out = result.outBinds || {};
        const act = String((Array.isArray(out.actionOut) ? out.actionOut[0] : out.actionOut) || '').toUpperCase();
        if (act === 'DELETED') {
          return { action: 'deleted', leaveRequest: null };
        }
        if (act === 'WITHDRAWN') {
          const rowSnake = await this._rowSnakeAfterMutation(connection, hexGuid);
          if (rowSnake) return { action: 'withdrawn', leaveRequest: rowSnake };
          throw new DatabaseError('Failed to retrieve withdrawn leave request');
        }
        throw new DatabaseError('Delete/withdraw package returned unexpected action: ' + act);
      });
    } catch (error) {
      this._rethrowMutationFailure(error, 'Failed to delete or withdraw leave request');
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
      return await this.executeWithTransaction(async (connection) => {
        try {
          await this._lifecycleExecute3(connection, 'SUBMIT_BY_GUID', {
            hex: hexGuid,
            tenantId,
            userId: userId || 'SYSTEM'
          });
        } catch (e) {
          this._rethrowLeaveRequestPackageError(e);
        }
        const rowSnake = await this._rowSnakeAfterMutation(connection, hexGuid);
        if (rowSnake) return rowSnake;
        throw new DatabaseError('Failed to retrieve submitted leave request');
      });
    } catch (error) {
      this._rethrowMutationFailure(error, 'Failed to submit leave request');
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
      return await this.executeWithTransaction(async (connection) => {
        await this._ensureLeaveRequestPackageSchema(connection);
        const txnIdOut = { type: oracledb.NUMBER, dir: oracledb.BIND_OUT };
        let approveResult;
        try {
          // Unqualified name only (PLS-00225 if ABS.ABS_LEAVE_REQUESTS_APPROVE_PKG). Resolve via CURRENT_SCHEMA or synonym → ABS.ABS_LEAVE_REQUESTS_APPROVE_PKG
          const approvePkg = this._pkgNameFromEnv('ABS_LEAVE_REQUESTS_APPROVE_PKG_NAME', 'ABS_LEAVE_REQUESTS_APPROVE_PKG');
          approveResult = await connection.execute(
            `BEGIN ${approvePkg}.APPROVE_BY_GUID(:hex, :tenantId, :userId, :txnIdOut); END;`,
            { hex: hexGuid, tenantId, userId: userId || 'SYSTEM', txnIdOut },
            { autoCommit: false }
          );
        } catch (e) {
          this._rethrowLeaveRequestPackageError(e);
        }
        const ob = approveResult.outBinds || {};
        const txnIdRaw = Array.isArray(ob.txnIdOut) ? ob.txnIdOut[0] : ob.txnIdOut;
        const txnIdNum = txnIdRaw != null && txnIdRaw !== undefined ? Number(txnIdRaw) : null;
        const transaction =
          txnIdNum != null && !isNaN(txnIdNum)
            ? await this._fetchBalanceTxnRow(connection, txnIdNum)
            : null;

        const rowSnake = await this._rowSnakeAfterMutation(connection, hexGuid);
        if (rowSnake) return { leaveRequest: rowSnake, transaction };
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
      return await this.executeWithTransaction(async (connection) => {
        try {
          await this._lifecycleExecute3(connection, 'REJECT_BY_GUID', {
            hex: hexGuid,
            tenantId,
            userId: userId || 'SYSTEM'
          });
        } catch (e) {
          this._rethrowLeaveRequestPackageError(e);
        }
        const rowSnake = await this._rowSnakeAfterMutation(connection, hexGuid);
        if (rowSnake) return rowSnake;
        throw new DatabaseError('Failed to retrieve rejected leave request');
      });
    } catch (error) {
      this._rethrowMutationFailure(error, 'Failed to reject leave request');
    }
  }
}

export default LeaveRequestModel;
