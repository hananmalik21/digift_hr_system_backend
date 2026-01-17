import db from '../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError } from '../../../utils/errors/index.js';
import { ensureHex32, hexToRawBuffer, generateSysGuid } from '../../../utils/guidUtils.js';

/**
 * Leave Contact Model
 * Handles all database operations for ABS.ABS_LEAVE_CONTACTS table
 */
class LeaveContactModel {
  static TABLE_NAME = 'ABS.ABS_LEAVE_CONTACTS';

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
   * Get all leave contacts with optional filters + pagination
   */
  static async findAll(filters = {}) {
    try {
      let countQuery = `SELECT COUNT(*) AS total FROM ${this.TABLE_NAME} a`;
      let dataQuery = `SELECT 
        a.LEAVE_CONTACT_ID,
        RAWTOHEX(a.LEAVE_CONTACT_GUID) AS LEAVE_CONTACT_GUID,
        a.LEAVE_REQUEST_ID,
        a.REASON_FOR_LEAVE,
        a.DELEGATED_EMPLOYEE_ID,
        a.ADDRESS_DURING_LEAVE,
        a.CONTACT_PHONE,
        a.EMERGENCY_CONTACT_NAME,
        a.EMERGENCY_CONTACT_PHONE,
        a.ADDITIONAL_NOTES,
        a.CREATION_DATE,
        a.CREATED_BY,
        a.LAST_UPDATE_DATE,
        a.LAST_UPDATED_BY
      FROM ${this.TABLE_NAME} a`;

      const conditions = [];
      const bindParams = [];
      let paramIndex = 1;

      if (filters.leaveRequestId) {
        conditions.push(`a.LEAVE_REQUEST_ID = :${paramIndex}`);
        bindParams.push(parseInt(filters.leaveRequestId));
        paramIndex++;
      }

      if (filters.leaveRequestGuid) {
        // Join with leave requests table to filter by GUID
        conditions.push(`a.LEAVE_REQUEST_ID IN (
          SELECT LEAVE_REQUEST_ID 
          FROM ABS.ABS_LEAVE_REQUESTS 
          WHERE LEAVE_REQUEST_GUID = HEXTORAW(:${paramIndex})
        )`);
        bindParams.push(ensureHex32(filters.leaveRequestGuid, 'leaveRequestGuid'));
        paramIndex++;
      }

      if (filters.delegatedEmployeeId) {
        conditions.push(`a.DELEGATED_EMPLOYEE_ID = :${paramIndex}`);
        bindParams.push(parseInt(filters.delegatedEmployeeId));
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

      dataQuery += ` ORDER BY a.CREATION_DATE DESC`;
      dataQuery += ` OFFSET :${paramIndex} ROWS FETCH NEXT :${paramIndex + 1} ROWS ONLY`;
      bindParams.push(offset);
      bindParams.push(pageSize);

      const dataResult = await this.executeQuery(dataQuery, bindParams);

      return { leaveContacts: dataResult.rows || [], total };
    } catch (error) {
      // Log detailed error for debugging
      console.error('--- LEAVE CONTACT FINDALL ERROR (RAW) ---');
      console.error('errorNum:', error?.errorNum);
      console.error('message:', error?.message);
      console.error('oracleError:', error?.oracleError);
      console.error('full:', JSON.stringify(error, null, 2));
      console.error('---------------------------------------');

      // ORA-00904 means invalid column/identifier - provide more specific error
      if (error?.errorNum === 904 || error?.message?.includes('ORA-00904')) {
        const invalidColError = new DatabaseError(
          `Invalid column name in ABS_LEAVE_CONTACTS table. Please check the table structure. Error: ${error?.message || 'ORA-00904'}`,
          error,
          `Invalid column name in ABS_LEAVE_CONTACTS table. Please check the table structure. Error: ${error?.message || 'ORA-00904'}`
        );
        invalidColError.code = 'INVALID_COLUMN';
        throw invalidColError;
      }

      if (error?.errorNum !== undefined || error?.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to fetch leave contacts', error);
    }
  }

  /**
   * Get single leave contact by GUID (HEX32)
   */
  static async findByGuid(guidHex32) {
    try {
      const hexGuid = ensureHex32(guidHex32, 'guid');
      const guidBuffer = hexToRawBuffer(hexGuid);

      const query = `SELECT 
        a.LEAVE_CONTACT_ID,
        RAWTOHEX(a.LEAVE_CONTACT_GUID) AS LEAVE_CONTACT_GUID,
        a.LEAVE_REQUEST_ID,
        a.REASON_FOR_LEAVE,
        a.DELEGATED_EMPLOYEE_ID,
        a.ADDRESS_DURING_LEAVE,
        a.CONTACT_PHONE,
        a.EMERGENCY_CONTACT_NAME,
        a.EMERGENCY_CONTACT_PHONE,
        a.ADDITIONAL_NOTES,
        a.CREATION_DATE,
        a.CREATED_BY,
        a.LAST_UPDATE_DATE,
        a.LAST_UPDATED_BY
      FROM ${this.TABLE_NAME} a
      WHERE a.LEAVE_CONTACT_GUID = :1`;

      const result = await this.executeQuery(query, [guidBuffer]);
      return result.rows?.[0] || null;
    } catch (error) {
      if (error?.message?.includes('must be a 32-character hex GUID')) throw error;
      if (error?.errorNum !== undefined || error?.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to fetch leave contact', error);
    }
  }

  /**
   * Get leave contact by LEAVE_REQUEST_ID
   */
  static async findByLeaveRequestId(leaveRequestId) {
    try {
      const query = `SELECT 
        a.LEAVE_CONTACT_ID,
        RAWTOHEX(a.LEAVE_CONTACT_GUID) AS LEAVE_CONTACT_GUID,
        a.LEAVE_REQUEST_ID,
        a.REASON_FOR_LEAVE,
        a.DELEGATED_EMPLOYEE_ID,
        a.ADDRESS_DURING_LEAVE,
        a.CONTACT_PHONE,
        a.EMERGENCY_CONTACT_NAME,
        a.EMERGENCY_CONTACT_PHONE,
        a.ADDITIONAL_NOTES,
        a.CREATION_DATE,
        a.CREATED_BY,
        a.LAST_UPDATE_DATE,
        a.LAST_UPDATED_BY
      FROM ${this.TABLE_NAME} a
      WHERE a.LEAVE_REQUEST_ID = :1`;

      const result = await this.executeQuery(query, [parseInt(leaveRequestId)]);
      return result.rows?.[0] || null;
    } catch (error) {
      if (error?.errorNum !== undefined || error?.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to fetch leave contact', error);
    }
  }

  /**
   * Create a new leave contact
   */
  static async create(data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        // Next ID
        let leaveContactId;
        try {
          const seqQuery = `SELECT ABS.ABS_LEAVE_CONTACTS_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`;
          const seqResult = await connection.execute(seqQuery, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
          leaveContactId = seqResult.rows[0].NEXT_ID;
        } catch {
          const maxQuery = `SELECT NVL(MAX(LEAVE_CONTACT_ID), 0) + 1 AS NEXT_ID FROM ${this.TABLE_NAME}`;
          const maxResult = await connection.execute(maxQuery, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
          leaveContactId = maxResult.rows[0].NEXT_ID;
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
          :1,:2,:3,:4,:5,:6,:7,:8,:9,:10,:11,:12,:13,:14
        )`;

        const bindParams = [
          leaveContactId,
          guidBuffer,
          data.LEAVE_REQUEST_ID !== undefined && data.LEAVE_REQUEST_ID !== null ? parseInt(data.LEAVE_REQUEST_ID) : null,
          data.REASON_FOR_LEAVE || null,
          data.DELEGATED_EMPLOYEE_ID !== undefined && data.DELEGATED_EMPLOYEE_ID !== null ? parseInt(data.DELEGATED_EMPLOYEE_ID) : null,
          data.ADDRESS_DURING_LEAVE || null,
          data.CONTACT_PHONE || null,
          data.EMERGENCY_CONTACT_NAME || null,
          data.EMERGENCY_CONTACT_PHONE || null,
          data.ADDITIONAL_NOTES || null,
          now,
          userId || 'SYSTEM',
          now,
          userId || 'SYSTEM'
        ];

        await connection.execute(insertSql, bindParams, { outFormat: oracledb.OUT_FORMAT_OBJECT });

        const selectSql = `SELECT 
          a.LEAVE_CONTACT_ID,
          RAWTOHEX(a.LEAVE_CONTACT_GUID) AS LEAVE_CONTACT_GUID,
          a.LEAVE_REQUEST_ID,
          a.REASON_FOR_LEAVE,
          a.DELEGATED_EMPLOYEE_ID,
          a.ADDRESS_DURING_LEAVE,
          a.CONTACT_PHONE,
          a.EMERGENCY_CONTACT_NAME,
          a.EMERGENCY_CONTACT_PHONE,
          a.ADDITIONAL_NOTES,
          a.CREATION_DATE,
          a.CREATED_BY,
          a.LAST_UPDATE_DATE,
          a.LAST_UPDATED_BY
        FROM ${this.TABLE_NAME} a
        WHERE a.LEAVE_CONTACT_ID = :1`;

        const selectResult = await connection.execute(selectSql, [leaveContactId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        if (selectResult.rows?.length) return this.convertKeysToSnakeCase(selectResult.rows[0]);
        throw new DatabaseError('Failed to retrieve created leave contact');
      });
    } catch (error) {
      console.error('--- LEAVE CONTACT CREATE ERROR (RAW) ---');
      console.error('errorNum:', error?.errorNum);
      console.error('message:', error?.message);
      console.error('full:', JSON.stringify(error, null, 2));
      console.error('---------------------------------------');

      // Handle trigger validation error (ORA-04098)
      if (error?.errorNum === 4098 || error?.message?.includes('ORA-04098')) {
        const triggerError = new DatabaseError(
          'Database trigger is invalid. The sequence ABS_LEAVE_CONTACTS_SEQ or trigger ABS_TRG_LEAVE_CONTACT_GUID may be missing. Please create them in the database.',
          error,
          'Database trigger is invalid. The sequence ABS_LEAVE_CONTACTS_SEQ or trigger ABS_TRG_LEAVE_CONTACT_GUID may be missing. Please create them in the database.'
        );
        triggerError.code = 'TRIGGER_ERROR';
        throw triggerError;
      }

      if (error?.errorNum === 2291 || error?.message?.includes('ORA-02291')) {
        const userMessage = 'The referenced record does not exist. Please verify leave_request_id and delegated_employee_id (if provided) exist.';
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
      throw new DatabaseError('Failed to create leave contact', error);
    }
  }

  /**
   * Update a leave contact by GUID (HEX32)
   */
  static async updateByGuid(guidHex32, data, userId) {
    try {
      const hexGuid = ensureHex32(guidHex32, 'guid');
      const guidBuffer = hexToRawBuffer(hexGuid);

      return await this.executeWithTransaction(async (connection) => {
        // Build UPDATE dynamically
        const updateFields = [];
        const bindParams = [];
        let i = 1;

        if (data.LEAVE_REQUEST_ID !== undefined) {
          updateFields.push(`LEAVE_REQUEST_ID = :${i}`);
          bindParams.push(data.LEAVE_REQUEST_ID !== null ? parseInt(data.LEAVE_REQUEST_ID) : null);
          i++;
        }
        if (data.REASON_FOR_LEAVE !== undefined) {
          updateFields.push(`REASON_FOR_LEAVE = :${i}`);
          bindParams.push(data.REASON_FOR_LEAVE || null);
          i++;
        }
        if (data.DELEGATED_EMPLOYEE_ID !== undefined) {
          updateFields.push(`DELEGATED_EMPLOYEE_ID = :${i}`);
          bindParams.push(data.DELEGATED_EMPLOYEE_ID !== null ? parseInt(data.DELEGATED_EMPLOYEE_ID) : null);
          i++;
        }
        if (data.ADDRESS_DURING_LEAVE !== undefined) {
          updateFields.push(`ADDRESS_DURING_LEAVE = :${i}`);
          bindParams.push(data.ADDRESS_DURING_LEAVE || null);
          i++;
        }
        if (data.CONTACT_PHONE !== undefined) {
          updateFields.push(`CONTACT_PHONE = :${i}`);
          bindParams.push(data.CONTACT_PHONE || null);
          i++;
        }
        if (data.EMERGENCY_CONTACT_NAME !== undefined) {
          updateFields.push(`EMERGENCY_CONTACT_NAME = :${i}`);
          bindParams.push(data.EMERGENCY_CONTACT_NAME || null);
          i++;
        }
        if (data.EMERGENCY_CONTACT_PHONE !== undefined) {
          updateFields.push(`EMERGENCY_CONTACT_PHONE = :${i}`);
          bindParams.push(data.EMERGENCY_CONTACT_PHONE || null);
          i++;
        }
        if (data.ADDITIONAL_NOTES !== undefined) {
          updateFields.push(`ADDITIONAL_NOTES = :${i}`);
          bindParams.push(data.ADDITIONAL_NOTES || null);
          i++;
        }

        if (updateFields.length === 0) {
          // Nothing to update => return current row
          const selectSql = `SELECT 
            a.LEAVE_CONTACT_ID,
            RAWTOHEX(a.LEAVE_CONTACT_GUID) AS LEAVE_CONTACT_GUID,
            a.LEAVE_REQUEST_ID,
            a.REASON_FOR_LEAVE,
            a.DELEGATED_EMPLOYEE_ID,
            a.ADDRESS_DURING_LEAVE,
            a.CONTACT_PHONE,
            a.EMERGENCY_CONTACT_NAME,
            a.EMERGENCY_CONTACT_PHONE,
            a.ADDITIONAL_NOTES,
            a.CREATION_DATE,
            a.CREATED_BY,
            a.LAST_UPDATE_DATE,
            a.LAST_UPDATED_BY
          FROM ${this.TABLE_NAME} a
          WHERE a.LEAVE_CONTACT_GUID = :1`;

          const selectResult = await connection.execute(selectSql, [guidBuffer], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });

          if (selectResult.rows?.length) return this.convertKeysToSnakeCase(selectResult.rows[0]);
          throw new DatabaseError('Leave contact not found');
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
          WHERE LEAVE_CONTACT_GUID = :${i}`;

        const updateResult = await connection.execute(updateSql, bindParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        if (updateResult.rowsAffected === 0) throw new DatabaseError('Leave contact not found');

        // Return updated row
        const selectSql = `SELECT 
          a.LEAVE_CONTACT_ID,
          RAWTOHEX(a.LEAVE_CONTACT_GUID) AS LEAVE_CONTACT_GUID,
          a.LEAVE_REQUEST_ID,
          a.REASON_FOR_LEAVE,
          a.DELEGATED_EMPLOYEE_ID,
          a.ADDRESS_DURING_LEAVE,
          a.CONTACT_PHONE,
          a.EMERGENCY_CONTACT_NAME,
          a.EMERGENCY_CONTACT_PHONE,
          a.ADDITIONAL_NOTES,
          a.CREATION_DATE,
          a.CREATED_BY,
          a.LAST_UPDATE_DATE,
          a.LAST_UPDATED_BY
        FROM ${this.TABLE_NAME} a
        WHERE a.LEAVE_CONTACT_GUID = :1`;

        const selectResult = await connection.execute(selectSql, [guidBuffer], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        if (selectResult.rows?.length) return this.convertKeysToSnakeCase(selectResult.rows[0]);
        throw new DatabaseError('Failed to retrieve updated leave contact');
      });
    } catch (error) {
      console.error('--- LEAVE CONTACT UPDATE ERROR (RAW) ---');
      console.error('errorNum:', error?.errorNum);
      console.error('message:', error?.message);
      console.error('full:', JSON.stringify(error, null, 2));
      console.error('---------------------------------------');

      if (error?.message?.includes('must be a 32-character hex GUID')) throw error;

      if (error?.errorNum === 2291 || error?.message?.includes('ORA-02291')) {
        const userMessage = 'The referenced record does not exist. Please verify leave_request_id and delegated_employee_id (if provided) exist.';
        const fkError = new DatabaseError(userMessage, error, userMessage);
        fkError.code = 'FOREIGN_KEY_CONSTRAINT';
        throw fkError;
      }

      if (error?.errorNum !== undefined || error?.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to update leave contact', error);
    }
  }

  /**
   * Delete by GUID (HEX32)
   */
  static async deleteByGuid(guidHex32) {
    try {
      const hexGuid = ensureHex32(guidHex32, 'guid');
      const guidBuffer = hexToRawBuffer(hexGuid);

      return await this.executeWithTransaction(async (connection) => {
        const sql = `DELETE FROM ${this.TABLE_NAME} WHERE LEAVE_CONTACT_GUID = :1`;
        const result = await connection.execute(sql, [guidBuffer], { outFormat: oracledb.OUT_FORMAT_OBJECT });

        if (result.rowsAffected === 0) throw new DatabaseError('Leave contact not found');
        return true;
      });
    } catch (error) {
      if (error?.message?.includes('must be a 32-character hex GUID')) throw error;
      if (error?.errorNum !== undefined || error?.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to delete leave contact', error);
    }
  }
}

export default LeaveContactModel;
