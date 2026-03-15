import db from '../../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { ensureHex32, hexToRawBuffer, generateSysGuid } from '../../../../utils/guidUtils.js';

/**
 * Leave Type Model
 * Handles all database operations for ABS.ABS_LEAVE_TYPES table
 */
class LeaveTypeModel {
  static TABLE_NAME = 'ABS.ABS_LEAVE_TYPES';

  /**
   * Convert object keys from UPPER_CASE to lowercase snake_case
   * @param {*} obj - Object or array to convert
   * @returns {*} Converted object or array
   */
  static convertKeysToSnakeCase(obj) {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date) return obj;
    if (obj instanceof Buffer) {
      // Convert Buffer (Oracle RAW/GUID types) to hex string
      return obj.toString('hex').toUpperCase();
    }
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => this.convertKeysToSnakeCase(item));
    
    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
      const newKey = key.toLowerCase();
      if (value === null || value === undefined) {
        converted[newKey] = value;
      } else if (value instanceof Date) {
        converted[newKey] = value;
      } else if (value instanceof Buffer) {
        // Convert Buffer (Oracle RAW/GUID types) to hex string
        converted[newKey] = value.toString('hex').toUpperCase();
      } else if (typeof value === 'object') {
        converted[newKey] = this.convertKeysToSnakeCase(value);
      } else {
        converted[newKey] = value;
      }
    }
    return converted;
  }

  /**
   * Helper method to execute queries with proper connection handling
   */
  static async executeQuery(query, bindParams = [], options = {}) {
    const result = await db.executeQuery(query, bindParams, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      ...options
    });
    
    // Convert keys to lowercase snake_case
    if (result.rows) {
      result.rows = this.convertKeysToSnakeCase(result.rows);
    }
    
    return result;
  }

  /**
   * Helper method to execute queries with transaction support
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
   * Get all leave types with optional filters and pagination
   * @param {Object} filters - Optional filters (status, search, pagination)
   * @param {Object} filters.pagination - Pagination options {page, pageSize}
   * @returns {Promise<Object>} Object with {leaveTypes, total} if paginated
   */
  static async findAll(filters = {}) {
    try {
      // Build base query for counting total records
      let countQuery = `SELECT COUNT(*) AS total FROM ${this.TABLE_NAME} a`;
      let dataQuery = `SELECT 
        a.LEAVE_TYPE_ID,
        RAWTOHEX(a.LEAVE_TYPE_GUID) AS LEAVE_TYPE_GUID,
        a.TENANT_ID,
        a.LEAVE_CODE,
        a.LEAVE_NAME_EN,
        a.LEAVE_NAME_AR,
        a.DESCRIPTION_EN,
        a.DESCRIPTION_AR,
        a.IS_PAID,
        a.REQUIRES_DOCUMENTS,
        a.MAX_DAYS_PER_YEAR,
        a.STATUS,
        a.CREATION_DATE,
        a.CREATED_BY,
        a.LAST_UPDATE_DATE,
        a.LAST_UPDATED_BY
      FROM ${this.TABLE_NAME} a`;

      const conditions = [];
      const bindParams = [];
      let paramIndex = 1;

      // Filter by TENANT_ID
      if (filters.tenantId !== undefined) {
        conditions.push(`a.TENANT_ID = :${paramIndex}`);
        bindParams.push(filters.tenantId);
        paramIndex++;
      }

      // Filter by STATUS
      if (filters.status) {
        conditions.push(`a.STATUS = :${paramIndex}`);
        bindParams.push(filters.status);
        paramIndex++;
      }

      // Search by LEAVE_CODE, LEAVE_NAME_EN, or LEAVE_NAME_AR
      if (filters.search) {
        const searchValue = `%${filters.search}%`;
        conditions.push(`(
          UPPER(a.LEAVE_CODE) LIKE UPPER(:${paramIndex}) OR
          UPPER(a.LEAVE_NAME_EN) LIKE UPPER(:${paramIndex + 1}) OR
          UPPER(a.LEAVE_NAME_AR) LIKE UPPER(:${paramIndex + 2})
        )`);
        bindParams.push(searchValue);
        bindParams.push(searchValue);
        bindParams.push(searchValue);
        paramIndex += 3;
      }

      // Apply WHERE clause if conditions exist
      if (conditions.length > 0) {
        const whereClause = ` WHERE ${conditions.join(' AND ')}`;
        countQuery += whereClause;
        dataQuery += whereClause;
      }

      // Handle pagination
      const pagination = filters.pagination || {};
      const page = pagination.page || 1;
      const pageSize = pagination.pageSize || 10;
      const offset = (page - 1) * pageSize;

      // Execute count query
      const countResult = await this.executeQuery(countQuery, bindParams);
      const total = countResult.rows[0]?.total || 0;

      // Add ORDER BY and pagination
      dataQuery += ` ORDER BY a.LEAVE_CODE`;
      dataQuery += ` OFFSET :${paramIndex} ROWS FETCH NEXT :${paramIndex + 1} ROWS ONLY`;
      bindParams.push(offset);
      bindParams.push(pageSize);

      // Execute data query
      const dataResult = await this.executeQuery(dataQuery, bindParams);

      return {
        leaveTypes: dataResult.rows || [],
        total: total
      };
    } catch (error) {
      // Wrap Oracle errors in DatabaseError
      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(
          DatabaseError.getUserFriendlyMessage(error),
          error
        );
      }
      
      if (error instanceof DatabaseError) {
        throw error;
      }
      
      throw new DatabaseError(
        'Failed to fetch leave types',
        error
      );
    }
  }

  /**
   * Get a single leave type by GUID
   * @param {string} guidHex32 - Leave Type GUID (32-hex string)
   * @param {number} [tenantId] - Optional tenant ID to scope the lookup
   * @returns {Promise<Object|null>} Leave type object or null
   */
  static async findByGuid(guidHex32, tenantId) {
    try {
      const hexGuid = ensureHex32(guidHex32, 'guid');
      const guidBuffer = hexToRawBuffer(hexGuid);

      let query = `SELECT 
        a.LEAVE_TYPE_ID,
        RAWTOHEX(a.LEAVE_TYPE_GUID) AS LEAVE_TYPE_GUID,
        a.TENANT_ID,
        a.LEAVE_CODE,
        a.LEAVE_NAME_EN,
        a.LEAVE_NAME_AR,
        a.DESCRIPTION_EN,
        a.DESCRIPTION_AR,
        a.IS_PAID,
        a.REQUIRES_DOCUMENTS,
        a.MAX_DAYS_PER_YEAR,
        a.STATUS,
        a.CREATION_DATE,
        a.CREATED_BY,
        a.LAST_UPDATE_DATE,
        a.LAST_UPDATED_BY
      FROM ${this.TABLE_NAME} a
      WHERE a.LEAVE_TYPE_GUID = :1`;
      const bindParams = [guidBuffer];

      if (tenantId != null) {
        query += ` AND a.TENANT_ID = :2`;
        bindParams.push(tenantId);
      }

      const result = await this.executeQuery(query, bindParams);
      
      if (result.rows && result.rows.length > 0) {
        return result.rows[0];
      }
      return null;
    } catch (error) {
      if (error.message?.includes('must be a 32-character hex GUID')) {
        throw error;
      }
      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(
          DatabaseError.getUserFriendlyMessage(error),
          error
        );
      }
      
      if (error instanceof DatabaseError) {
        throw error;
      }
      
      throw new DatabaseError(
        'Failed to fetch leave type',
        error
      );
    }
  }

  /**
   * Create a new leave type
   * @param {Object} data - Leave type data
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<Object>} Created leave type
   */
  static async create(data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        // Get next LEAVE_TYPE_ID from sequence (or use MAX+1 if sequence doesn't exist)
        let leaveTypeId;
        try {
          const seqQuery = `SELECT ABS.ABS_LEAVE_TYPES_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`;
          const seqResult = await connection.execute(seqQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          leaveTypeId = seqResult.rows[0].NEXT_ID;
        } catch (seqError) {
          // If sequence doesn't exist, get max ID and increment
          const maxQuery = `SELECT NVL(MAX(LEAVE_TYPE_ID), 0) + 1 AS NEXT_ID FROM ${this.TABLE_NAME}`;
          const maxResult = await connection.execute(maxQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          leaveTypeId = maxResult.rows[0].NEXT_ID;
        }

        // Generate GUID for LEAVE_TYPE_GUID (workaround for trigger issue)
        const { buffer: guidBuffer } = await generateSysGuid(connection);

        const now = new Date();

        const query = `INSERT INTO ${this.TABLE_NAME} (
          LEAVE_TYPE_GUID,
          TENANT_ID,
          LEAVE_TYPE_ID,
          LEAVE_CODE,
          LEAVE_NAME_EN,
          LEAVE_NAME_AR,
          DESCRIPTION_EN,
          DESCRIPTION_AR,
          IS_PAID,
          REQUIRES_DOCUMENTS,
          MAX_DAYS_PER_YEAR,
          STATUS,
          CREATION_DATE,
          CREATED_BY,
          LAST_UPDATE_DATE,
          LAST_UPDATED_BY
        ) VALUES (
          :1, :2, :3, :4, :5, :6, :7, :8, :9, :10, :11, :12, :13, :14, :15, :16
        )`;

        const bindParams = [
          guidBuffer,
          data.TENANT_ID !== undefined && data.TENANT_ID !== null ? parseInt(data.TENANT_ID) : null,
          leaveTypeId,
          data.LEAVE_CODE || null,
          data.LEAVE_NAME_EN || null,
          data.LEAVE_NAME_AR || null,
          data.DESCRIPTION_EN || null,
          data.DESCRIPTION_AR || null,
          data.IS_PAID || 'N',
          data.REQUIRES_DOCUMENTS || 'N',
          data.MAX_DAYS_PER_YEAR !== undefined && data.MAX_DAYS_PER_YEAR !== null ? parseFloat(data.MAX_DAYS_PER_YEAR) : null,
          data.STATUS || 'ACTIVE',
          now,
          userId || 'SYSTEM',
          now,
          userId || 'SYSTEM'
        ];

        await connection.execute(query, bindParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        // Fetch and return the created record
        const selectQuery = `SELECT 
          a.LEAVE_TYPE_ID,
          RAWTOHEX(a.LEAVE_TYPE_GUID) AS LEAVE_TYPE_GUID,
          a.TENANT_ID,
          a.LEAVE_CODE,
          a.LEAVE_NAME_EN,
          a.LEAVE_NAME_AR,
          a.DESCRIPTION_EN,
          a.DESCRIPTION_AR,
          a.IS_PAID,
          a.REQUIRES_DOCUMENTS,
          a.MAX_DAYS_PER_YEAR,
          a.STATUS,
          a.CREATION_DATE,
          a.CREATED_BY,
          a.LAST_UPDATE_DATE,
          a.LAST_UPDATED_BY
        FROM ${this.TABLE_NAME} a
        WHERE a.LEAVE_TYPE_ID = :1`;

        const selectResult = await connection.execute(selectQuery, [leaveTypeId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        if (selectResult.rows && selectResult.rows.length > 0) {
          return this.convertKeysToSnakeCase(selectResult.rows[0]);
        }

        throw new DatabaseError('Failed to retrieve created leave type');
      });
    } catch (error) {
      // Handle unique constraint violations (e.g., duplicate LEAVE_CODE)
      if (error.errorNum === 1 || error.message?.includes('ORA-00001')) {
        const conflictError = new DatabaseError('Leave type with this LEAVE_CODE already exists', error);
        conflictError.code = 'UNIQUE_CONSTRAINT_VIOLATION';
        throw conflictError;
      }

      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(
          DatabaseError.getUserFriendlyMessage(error),
          error
        );
      }
      
      if (error instanceof DatabaseError) {
        throw error;
      }
      
      throw new DatabaseError(
        'Failed to create leave type',
        error
      );
    }
  }

  /**
   * Update a leave type by GUID
   * @param {string} guidHex32 - Leave Type GUID (32-hex string)
   * @param {Object} data - Leave type data to update
   * @param {string} userId - User ID for audit fields (if needed)
   * @returns {Promise<Object>} Updated leave type
   */
  static async updateByGuid(guidHex32, data, userId) {
    try {
      const hexGuid = ensureHex32(guidHex32, 'guid');
      const guidBuffer = hexToRawBuffer(hexGuid);

      return await this.executeWithTransaction(async (connection) => {
        // Build dynamic UPDATE query
        const updateFields = [];
        const bindParams = [];
        let paramIndex = 1;

        if (data.LEAVE_CODE !== undefined) {
          updateFields.push(`LEAVE_CODE = :${paramIndex}`);
          bindParams.push(data.LEAVE_CODE);
          paramIndex++;
        }

        if (data.LEAVE_NAME_EN !== undefined) {
          updateFields.push(`LEAVE_NAME_EN = :${paramIndex}`);
          bindParams.push(data.LEAVE_NAME_EN);
          paramIndex++;
        }

        if (data.LEAVE_NAME_AR !== undefined) {
          updateFields.push(`LEAVE_NAME_AR = :${paramIndex}`);
          bindParams.push(data.LEAVE_NAME_AR);
          paramIndex++;
        }

        if (data.STATUS !== undefined) {
          updateFields.push(`STATUS = :${paramIndex}`);
          bindParams.push(data.STATUS);
          paramIndex++;
        }

        // Check if no fields to update (before adding audit fields)
        if (updateFields.length === 0) {
          // No fields to update, fetch existing record
          const selectQuery = `SELECT 
            a.LEAVE_TYPE_ID,
            RAWTOHEX(a.LEAVE_TYPE_GUID) AS LEAVE_TYPE_GUID,
            a.TENANT_ID,
            a.LEAVE_CODE,
            a.LEAVE_NAME_EN,
            a.LEAVE_NAME_AR,
            a.DESCRIPTION_EN,
            a.DESCRIPTION_AR,
            a.IS_PAID,
            a.REQUIRES_DOCUMENTS,
            a.MAX_DAYS_PER_YEAR,
            a.STATUS,
            a.CREATION_DATE,
            a.CREATED_BY,
            a.LAST_UPDATE_DATE,
            a.LAST_UPDATED_BY
          FROM ${this.TABLE_NAME} a
          WHERE a.LEAVE_TYPE_GUID = :1`;

          const selectResult = await connection.execute(selectQuery, [guidBuffer], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });

          if (selectResult.rows && selectResult.rows.length > 0) {
            return this.convertKeysToSnakeCase(selectResult.rows[0]);
          }
          throw new DatabaseError('Leave type not found');
        }

        // Add audit fields
        updateFields.push(`LAST_UPDATED_BY = :${paramIndex}`);
        bindParams.push(userId || 'SYSTEM');
        paramIndex++;

        updateFields.push(`LAST_UPDATE_DATE = :${paramIndex}`);
        bindParams.push(new Date());
        paramIndex++;

        // Add WHERE clause
        bindParams.push(guidBuffer);
        const updateQuery = `UPDATE ${this.TABLE_NAME} 
          SET ${updateFields.join(', ')} 
          WHERE LEAVE_TYPE_GUID = :${paramIndex}`;

        const updateResult = await connection.execute(updateQuery, bindParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        if (updateResult.rowsAffected === 0) {
          throw new DatabaseError('Leave type not found');
        }

        // Fetch and return the updated record
        const selectQuery = `SELECT 
          a.LEAVE_TYPE_ID,
          RAWTOHEX(a.LEAVE_TYPE_GUID) AS LEAVE_TYPE_GUID,
          a.LEAVE_CODE,
          a.LEAVE_NAME_EN,
          a.LEAVE_NAME_AR,
          a.STATUS,
          a.CREATION_DATE,
          a.CREATED_BY,
          a.LAST_UPDATE_DATE,
          a.LAST_UPDATED_BY
        FROM ${this.TABLE_NAME} a
        WHERE a.LEAVE_TYPE_GUID = :1`;

        const selectResult = await connection.execute(selectQuery, [guidBuffer], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        if (selectResult.rows && selectResult.rows.length > 0) {
          return this.convertKeysToSnakeCase(selectResult.rows[0]);
        }

        throw new DatabaseError('Failed to retrieve updated leave type');
      });
    } catch (error) {
      if (error.message?.includes('must be a 32-character hex GUID')) {
        throw error;
      }
      // Handle unique constraint violations
      if (error.errorNum === 1 || error.message?.includes('ORA-00001')) {
        const conflictError = new DatabaseError('Leave type with this LEAVE_CODE already exists', error);
        conflictError.code = 'UNIQUE_CONSTRAINT_VIOLATION';
        throw conflictError;
      }

      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(
          DatabaseError.getUserFriendlyMessage(error),
          error
        );
      }
      
      if (error instanceof DatabaseError) {
        throw error;
      }
      
      throw new DatabaseError(
        'Failed to update leave type',
        error
      );
    }
  }

  /**
   * Delete a leave type by GUID (hard delete)
   * @param {string} guidHex32 - Leave Type GUID (32-hex string)
   * @returns {Promise<boolean>} True if deleted successfully
   */
  static async deleteByGuid(guidHex32) {
    try {
      const hexGuid = ensureHex32(guidHex32, 'guid');
      const guidBuffer = hexToRawBuffer(hexGuid);

      return await this.executeWithTransaction(async (connection) => {
        const query = `DELETE FROM ${this.TABLE_NAME} 
          WHERE LEAVE_TYPE_GUID = :1`;

        const result = await connection.execute(query, [guidBuffer], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        if (result.rowsAffected === 0) {
          throw new DatabaseError('Leave type not found');
        }

        return true;
      });
    } catch (error) {
      if (error.message?.includes('must be a 32-character hex GUID')) {
        throw error;
      }
      // Handle foreign key constraint violations
      if (error.errorNum === 2292 || error.message?.includes('ORA-02292')) {
        const fkError = new DatabaseError(
          'Cannot delete leave type: it is referenced by other records (e.g., leave requests, employee balances)',
          error
        );
        fkError.code = 'FOREIGN_KEY_CONSTRAINT';
        throw fkError;
      }

      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(
          DatabaseError.getUserFriendlyMessage(error),
          error
        );
      }
      
      if (error instanceof DatabaseError) {
        throw error;
      }
      
      throw new DatabaseError(
        'Failed to delete leave type',
        error
      );
    }
  }
}

export default LeaveTypeModel;
