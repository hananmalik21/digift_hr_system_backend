// leaveRequestModel.js
import db from '../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError } from '../../../utils/errors/index.js';
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
   */
  static async findAll(filters = {}) {
    try {
      let countQuery = `SELECT COUNT(*) AS total FROM ${this.TABLE_NAME} a`;
      let dataQuery = `SELECT 
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
      FROM ${this.TABLE_NAME} a`;

      const conditions = [];
      const bindParams = [];
      let paramIndex = 1;

      if (filters.status) {
        conditions.push(`a.REQUEST_STATUS = :${paramIndex}`);
        bindParams.push(filters.status);
        paramIndex++;
      }

      if (filters.employeeId) {
        conditions.push(`a.EMPLOYEE_ID = :${paramIndex}`);
        bindParams.push(parseInt(filters.employeeId));
        paramIndex++;
      }

      if (filters.tenantId) {
        conditions.push(`a.TENANT_ID = :${paramIndex}`);
        bindParams.push(parseInt(filters.tenantId));
        paramIndex++;
      }

      if (filters.leaveTypeId) {
        conditions.push(`a.LEAVE_TYPE_ID = :${paramIndex}`);
        bindParams.push(parseInt(filters.leaveTypeId));
        paramIndex++;
      }

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

      if (conditions.length > 0) {
        const whereClause = ` WHERE ${conditions.join(' AND ')}`;
        countQuery += whereClause;
        dataQuery += whereClause;
      }

      const pagination = filters.pagination || {};
      const page = pagination.page || 1;
      const pageSize = pagination.pageSize || 10;
      const offset = (page - 1) * pageSize;

      const countResult = await this.executeQuery(countQuery, bindParams);
      const total = countResult.rows[0]?.total || 0;

      dataQuery += ` ORDER BY a.START_DATE DESC, a.CREATION_DATE DESC`;
      dataQuery += ` OFFSET :${paramIndex} ROWS FETCH NEXT :${paramIndex + 1} ROWS ONLY`;
      bindParams.push(offset);
      bindParams.push(pageSize);

      const dataResult = await this.executeQuery(dataQuery, bindParams);

      return { leaveRequests: dataResult.rows || [], total };
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
        a.LAST_UPDATED_BY
      FROM ${this.TABLE_NAME} a
      WHERE a.LEAVE_REQUEST_GUID = :1`;

      const result = await this.executeQuery(query, [guidBuffer]);
      return result.rows?.[0] || null;
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
            const diffTime = end - start;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
            return diffDays > 0 ? diffDays : 1;
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
      console.error('--- LEAVE REQUEST CREATE ERROR (RAW) ---');
      console.error('errorNum:', error?.errorNum);
      console.error('message:', error?.message);
      console.error('full:', JSON.stringify(error, null, 2));
      console.error('---------------------------------------');

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
        if (data.REQUEST_STATUS !== undefined && currentStatus !== null) {
          const newStatus = String(data.REQUEST_STATUS || '').toUpperCase();
          const oldStatus = String(currentStatus || '').toUpperCase();

          if (newStatus === 'APPROVED' && oldStatus !== 'APPROVED') {
            if (data.APPROVED_AT === undefined) data.APPROVED_AT = now;
            if (data.REJECTED_AT === undefined) data.REJECTED_AT = null;
          } else if (newStatus === 'REJECTED' && oldStatus !== 'REJECTED') {
            if (data.REJECTED_AT === undefined) data.REJECTED_AT = now;
            if (data.APPROVED_AT === undefined) data.APPROVED_AT = null;
          } else if (newStatus === 'CANCELLED' || newStatus === 'PENDING' || newStatus === 'DRAFT') {
            if (data.APPROVED_AT === undefined) data.APPROVED_AT = null;
            if (data.REJECTED_AT === undefined) data.REJECTED_AT = null;
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
          updateFields.push(`REQUEST_STATUS = :${i}`);
          bindParams.push(data.REQUEST_STATUS ? String(data.REQUEST_STATUS).toUpperCase() : null);
          i++;
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
      console.error('--- LEAVE REQUEST UPDATE ERROR (RAW) ---');
      console.error('errorNum:', error?.errorNum);
      console.error('message:', error?.message);
      console.error('full:', JSON.stringify(error, null, 2));
      console.error('---------------------------------------');

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
   * Delete by GUID (HEX32)
   * Also deletes related leave contacts and leave documents (cascade delete)
   */
  static async deleteByGuid(guidHex32) {
    try {
      const hexGuid = ensureHex32(guidHex32, 'guid');
      const guidBuffer = hexToRawBuffer(hexGuid);

      return await this.executeWithTransaction(async (connection) => {
        // First, get the LEAVE_REQUEST_ID from the GUID
        const selectSql = `SELECT LEAVE_REQUEST_ID FROM ${this.TABLE_NAME} WHERE LEAVE_REQUEST_GUID = :1`;
        const selectResult = await connection.execute(selectSql, [guidBuffer], { outFormat: oracledb.OUT_FORMAT_OBJECT });

        if (!selectResult.rows || selectResult.rows.length === 0) {
          throw new DatabaseError('Leave request not found');
        }

        const leaveRequestId = selectResult.rows[0].LEAVE_REQUEST_ID;

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

        return true;
      });
    } catch (error) {
      if (error?.message?.includes('must be a 32-character hex GUID')) throw error;
      if (error?.message?.includes('not found')) throw error;
      if (error?.errorNum !== undefined || error?.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to delete leave request', error);
    }
  }
}

export default LeaveRequestModel;
