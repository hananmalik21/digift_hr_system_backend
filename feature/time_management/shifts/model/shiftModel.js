import db from '../../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError, ValidationError, NotFoundError } from '../../../../utils/errors/index.js';

/**
 * Shift Model
 * Handles all database operations for ENT.TM_SHIFTS table
 */
class ShiftModel {
  static TABLE_NAME = 'ENT.TM_SHIFTS';

  /**
   * Convert object keys from UPPER_CASE to lowercase snake_case
   * @param {*} obj - Object or array to convert
   * @returns {*} Converted object or array
   */
  static convertKeysToSnakeCase(obj) {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date || obj instanceof Buffer) return obj;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => this.convertKeysToSnakeCase(item));
    
    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
      const newKey = key.toLowerCase();
      if (value === null || value === undefined) {
        converted[newKey] = value;
      } else if (value instanceof Date || value instanceof Buffer) {
        converted[newKey] = value;
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
   * Get all shifts with filters and pagination
   * @param {Object} filters - Optional filters (tenantId, status, search, pagination)
   * @returns {Promise<Object>} Object with {shifts, total}
   */
  static async findAll(filters = {}) {
    try {
      // Build base query for counting total records
      let countQuery = `SELECT COUNT(*) AS total FROM ${this.TABLE_NAME}`;
      let dataQuery = `SELECT 
        SHIFT_ID,
        TENANT_ID,
        SHIFT_CODE,
        SHIFT_NAME_EN,
        SHIFT_NAME_AR,
        SHIFT_TYPE,
        START_MINUTES,
        END_MINUTES,
        DURATION_HOURS,
        BREAK_HOURS,
        COLOR_HEX,
        STATUS,
        CREATION_DATE,
        CREATED_BY,
        LAST_UPDATE_DATE,
        LAST_UPDATED_BY
      FROM ${this.TABLE_NAME}`;

      const conditions = [];
      const bindParams = [];
      let paramIndex = 1;

      // tenant_id is required
      if (filters.tenantId) {
        conditions.push(`TENANT_ID = :${paramIndex}`);
        bindParams.push(filters.tenantId);
        paramIndex++;
      } else {
        throw new ValidationError('tenant_id is required');
      }

      // Status filter
      if (filters.status) {
        conditions.push(`STATUS = :${paramIndex}`);
        bindParams.push(filters.status);
        paramIndex++;
      }

      // Search filter - matches shift_code or shift_name_en (LIKE, case-insensitive)
      if (filters.search) {
        const searchValue = `%${filters.search}%`;
        conditions.push(`(
          UPPER(SHIFT_CODE) LIKE UPPER(:${paramIndex}) OR
          UPPER(SHIFT_NAME_EN) LIKE UPPER(:${paramIndex + 1})
        )`);
        bindParams.push(searchValue);
        bindParams.push(searchValue);
        paramIndex += 2;
      }

      const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

      // Add WHERE clause to both queries
      countQuery += whereClause;
      dataQuery += whereClause;

      // Order by SHIFT_CODE
      dataQuery += ` ORDER BY SHIFT_CODE`;

      // Handle pagination
      const pagination = filters.pagination;
      let totalCount = 0;
      
      const countBindParams = [...bindParams];
      const dataBindParams = [...bindParams];
      
      if (pagination && pagination.page && pagination.pageSize) {
        // Get total count first
        const countResult = await this.executeQuery(countQuery, countBindParams);
        totalCount = countResult.rows && countResult.rows.length > 0 ? countResult.rows[0].total : 0;

        // Apply pagination using Oracle's OFFSET and FETCH NEXT
        const offset = (pagination.page - 1) * pagination.pageSize;
        dataQuery += ` OFFSET :${paramIndex} ROWS FETCH NEXT :${paramIndex + 1} ROWS ONLY`;
        dataBindParams.push(offset);
        dataBindParams.push(pagination.pageSize);
      }

      // Execute data query
      const result = await this.executeQuery(dataQuery, dataBindParams);
      const shifts = result.rows || [];

      // Return paginated result with total count
      if (pagination && pagination.page && pagination.pageSize) {
        return {
          shifts: shifts,
          total: totalCount
        };
      }

      return {
        shifts: shifts,
        total: shifts.length
      };
    } catch (error) {
      console.error('Error in findAll:', error);
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new DatabaseError(`Failed to fetch shifts: ${error.message}`, error);
    }
  }

  /**
   * Get a single shift by ID
   * @param {number} shiftId - Shift ID
   * @param {number} tenantId - Tenant ID (required)
   * @returns {Promise<Object|null>} Shift object or null
   */
  static async findById(shiftId, tenantId) {
    try {
      if (!tenantId) {
        throw new ValidationError('tenant_id is required');
      }

      const query = `SELECT 
        SHIFT_ID,
        TENANT_ID,
        SHIFT_CODE,
        SHIFT_NAME_EN,
        SHIFT_NAME_AR,
        SHIFT_TYPE,
        START_MINUTES,
        END_MINUTES,
        DURATION_HOURS,
        BREAK_HOURS,
        COLOR_HEX,
        STATUS,
        CREATION_DATE,
        CREATED_BY,
        LAST_UPDATE_DATE,
        LAST_UPDATED_BY
      FROM ${this.TABLE_NAME}
      WHERE SHIFT_ID = :1 AND TENANT_ID = :2`;

      const result = await this.executeQuery(query, [shiftId, tenantId]);
      
      if (result.rows && result.rows.length > 0) {
        return result.rows[0];
      }
      return null;
    } catch (error) {
      if (error instanceof ValidationError) {
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
        'Failed to fetch shift',
        error
      );
    }
  }

  /**
   * Create a new shift using RETURNING INTO with binds
   * @param {Object} data - Shift data
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<Object>} Created shift with SHIFT_ID
   */
  static async create(data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        // Get next SHIFT_ID from sequence (or use MAX+1 if sequence doesn't exist)
        let shiftId;
        try {
          const seqQuery = `SELECT ENT.TM_SHIFTS_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`;
          const seqResult = await connection.execute(seqQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          shiftId = seqResult.rows[0].NEXT_ID;
        } catch (seqError) {
          // If sequence doesn't exist, get max ID and increment
          const maxQuery = `SELECT NVL(MAX(SHIFT_ID), 0) + 1 AS NEXT_ID FROM ${this.TABLE_NAME}`;
          const maxResult = await connection.execute(maxQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          shiftId = maxResult.rows[0].NEXT_ID;
        }

        const now = new Date();
        
        // Use RETURNING INTO with bind variables
        const query = `INSERT INTO ${this.TABLE_NAME} (
          SHIFT_ID,
          TENANT_ID,
          SHIFT_CODE,
          SHIFT_NAME_EN,
          SHIFT_NAME_AR,
          SHIFT_TYPE,
          START_MINUTES,
          END_MINUTES,
          DURATION_HOURS,
          BREAK_HOURS,
          COLOR_HEX,
          STATUS,
          CREATION_DATE,
          CREATED_BY,
          LAST_UPDATE_DATE,
          LAST_UPDATED_BY
        ) VALUES (
          :shiftId, :tenantId, :shiftCode, :shiftNameEn, :shiftNameAr, :shiftType,
          :startMinutes, :endMinutes, :durationHours, :breakHours, :colorHex, :status,
          :creationDate, :createdBy, :lastUpdateDate, :lastUpdatedBy
        ) RETURNING SHIFT_ID INTO :returnShiftId`;

        // Create bind variables object
        // For RETURNING INTO, the OUT bind must be an array
        const bindVars = {
          shiftId: { val: shiftId, dir: oracledb.BIND_IN },
          tenantId: { val: data.TENANT_ID, dir: oracledb.BIND_IN },
          shiftCode: { val: data.SHIFT_CODE, dir: oracledb.BIND_IN },
          shiftNameEn: { val: data.SHIFT_NAME_EN, dir: oracledb.BIND_IN },
          shiftNameAr: { val: data.SHIFT_NAME_AR || null, dir: oracledb.BIND_IN },
          shiftType: { val: data.SHIFT_TYPE, dir: oracledb.BIND_IN },
          startMinutes: { val: data.START_MINUTES, dir: oracledb.BIND_IN },
          endMinutes: { val: data.END_MINUTES, dir: oracledb.BIND_IN },
          durationHours: { val: data.DURATION_HOURS, dir: oracledb.BIND_IN },
          breakHours: { val: data.BREAK_HOURS || null, dir: oracledb.BIND_IN },
          colorHex: { val: data.COLOR_HEX || null, dir: oracledb.BIND_IN },
          status: { val: data.STATUS || 'ACTIVE', dir: oracledb.BIND_IN },
          creationDate: { val: now, dir: oracledb.BIND_IN, type: oracledb.DATE },
          createdBy: { val: userId || 'SYSTEM', dir: oracledb.BIND_IN },
          lastUpdateDate: { val: now, dir: oracledb.BIND_IN, type: oracledb.DATE },
          lastUpdatedBy: { val: userId || 'SYSTEM', dir: oracledb.BIND_IN },
          returnShiftId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT, maxSize: 1 }
        };

        const result = await connection.execute(query, bindVars, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        // Get the returned SHIFT_ID from the OUT bind variable
        // RETURNING INTO returns an array, get first element
        const returnedShiftId = Array.isArray(result.outBinds.returnShiftId) 
          ? result.outBinds.returnShiftId[0] 
          : result.outBinds.returnShiftId;

        // Fetch and return the created record
        const selectQuery = `SELECT 
          SHIFT_ID,
          TENANT_ID,
          SHIFT_CODE,
          SHIFT_NAME_EN,
          SHIFT_NAME_AR,
          SHIFT_TYPE,
          START_MINUTES,
          END_MINUTES,
          DURATION_HOURS,
          BREAK_HOURS,
          COLOR_HEX,
          STATUS,
          CREATION_DATE,
          CREATED_BY,
          LAST_UPDATE_DATE,
          LAST_UPDATED_BY
        FROM ${this.TABLE_NAME}
        WHERE SHIFT_ID = :1`;
        const selectResult = await connection.execute(selectQuery, [returnedShiftId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        return this.convertKeysToSnakeCase(selectResult.rows[0]);
      });
    } catch (error) {
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
        'Failed to create shift',
        error
      );
    }
  }

  /**
   * Update an existing shift
   * @param {number} shiftId - Shift ID
   * @param {number} tenantId - Tenant ID (required)
   * @param {Object} data - Updated data
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<Object>} Updated shift
   */
  static async update(shiftId, tenantId, data, userId) {
    try {
      if (!tenantId) {
        throw new ValidationError('tenant_id is required');
      }

      return await this.executeWithTransaction(async (connection) => {
        const updateFields = [];
        const bindParams = [];
        let paramIndex = 1;

        // Build dynamic update query
        if (data.SHIFT_NAME_EN !== undefined) {
          updateFields.push(`SHIFT_NAME_EN = :${paramIndex}`);
          bindParams.push(data.SHIFT_NAME_EN);
          paramIndex++;
        }
        if (data.SHIFT_NAME_AR !== undefined) {
          updateFields.push(`SHIFT_NAME_AR = :${paramIndex}`);
          bindParams.push(data.SHIFT_NAME_AR);
          paramIndex++;
        }
        if (data.SHIFT_TYPE !== undefined) {
          updateFields.push(`SHIFT_TYPE = :${paramIndex}`);
          bindParams.push(data.SHIFT_TYPE);
          paramIndex++;
        }
        if (data.START_MINUTES !== undefined) {
          updateFields.push(`START_MINUTES = :${paramIndex}`);
          bindParams.push(data.START_MINUTES);
          paramIndex++;
        }
        if (data.END_MINUTES !== undefined) {
          updateFields.push(`END_MINUTES = :${paramIndex}`);
          bindParams.push(data.END_MINUTES);
          paramIndex++;
        }
        if (data.DURATION_HOURS !== undefined) {
          updateFields.push(`DURATION_HOURS = :${paramIndex}`);
          bindParams.push(data.DURATION_HOURS);
          paramIndex++;
        }
        if (data.BREAK_HOURS !== undefined) {
          updateFields.push(`BREAK_HOURS = :${paramIndex}`);
          bindParams.push(data.BREAK_HOURS);
          paramIndex++;
        }
        if (data.COLOR_HEX !== undefined) {
          updateFields.push(`COLOR_HEX = :${paramIndex}`);
          bindParams.push(data.COLOR_HEX);
          paramIndex++;
        }
        if (data.STATUS !== undefined) {
          updateFields.push(`STATUS = :${paramIndex}`);
          bindParams.push(data.STATUS);
          paramIndex++;
        }

        if (updateFields.length === 0) {
          throw new Error('No fields to update');
        }

        // Add audit fields
        updateFields.push(`LAST_UPDATED_BY = :${paramIndex}`);
        bindParams.push(userId || 'SYSTEM');
        paramIndex++;

        updateFields.push(`LAST_UPDATE_DATE = :${paramIndex}`);
        bindParams.push(new Date());
        paramIndex++;

        // Add WHERE clause
        bindParams.push(shiftId);
        bindParams.push(tenantId);
        const query = `UPDATE ${this.TABLE_NAME} SET ${updateFields.join(', ')} WHERE SHIFT_ID = :${paramIndex} AND TENANT_ID = :${paramIndex + 1}`;

        await connection.execute(query, bindParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        // Fetch and return the updated record
        const selectQuery = `SELECT 
          SHIFT_ID,
          TENANT_ID,
          SHIFT_CODE,
          SHIFT_NAME_EN,
          SHIFT_NAME_AR,
          SHIFT_TYPE,
          START_MINUTES,
          END_MINUTES,
          DURATION_HOURS,
          BREAK_HOURS,
          COLOR_HEX,
          STATUS,
          CREATION_DATE,
          CREATED_BY,
          LAST_UPDATE_DATE,
          LAST_UPDATED_BY
        FROM ${this.TABLE_NAME}
        WHERE SHIFT_ID = :1 AND TENANT_ID = :2`;
        const selectResult = await connection.execute(selectQuery, [shiftId, tenantId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        if (selectResult.rows && selectResult.rows.length === 0) {
          throw new NotFoundError('Shift not found');
        }
        
        return this.convertKeysToSnakeCase(selectResult.rows[0]);
      });
    } catch (error) {
      if (error instanceof ValidationError || error instanceof NotFoundError) {
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
        'Failed to update shift',
        error
      );
    }
  }

  /**
   * Delete a shift (soft delete by setting STATUS = 'INACTIVE')
   * @param {number} shiftId - Shift ID
   * @param {number} tenantId - Tenant ID (required)
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<boolean>} Success status
   */
  static async softDelete(shiftId, tenantId, userId) {
    try {
      if (!tenantId) {
        throw new ValidationError('tenant_id is required');
      }

      const result = await this.executeWithTransaction(async (connection) => {
        const query = `UPDATE ${this.TABLE_NAME} 
          SET STATUS = 'INACTIVE',
              LAST_UPDATED_BY = :1,
              LAST_UPDATE_DATE = :2
          WHERE SHIFT_ID = :3 AND TENANT_ID = :4`;

        const updateResult = await connection.execute(query, [
          userId || 'SYSTEM', 
          new Date(), 
          shiftId, 
          tenantId
        ], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        // Verify that the update affected at least one row
        const rowsAffected = updateResult.rowsAffected || updateResult.rowCount || 0;
        if (rowsAffected === 0) {
          throw new NotFoundError(`No shift found with ID: ${shiftId} for tenant: ${tenantId}`);
        }
        
        return { ...updateResult, rowsAffected };
      });
      
      console.log(`Soft delete successful for shift ID: ${shiftId}, tenant: ${tenantId}, rows affected: ${result.rowsAffected}`);
      return true;
    } catch (error) {
      if (error instanceof ValidationError || error instanceof NotFoundError) {
        throw error;
      }
      console.error('Error in softDelete:', error);
      throw new DatabaseError(`Failed to delete shift: ${error.message}`, error);
    }
  }

  /**
   * Hard delete a shift (permanent removal)
   * @param {number} shiftId - Shift ID
   * @param {number} tenantId - Tenant ID (required)
   * @returns {Promise<Object>} Success status
   */
  static async hardDelete(shiftId, tenantId) {
    try {
      if (!tenantId) {
        throw new ValidationError('tenant_id is required');
      }

      const result = await this.executeWithTransaction(async (connection) => {
        const query = `DELETE FROM ${this.TABLE_NAME} WHERE SHIFT_ID = :1 AND TENANT_ID = :2`;
        const deleteResult = await connection.execute(query, [shiftId, tenantId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        // Verify that the delete affected at least one row
        const rowsAffected = deleteResult.rowsAffected || deleteResult.rowCount || 0;
        if (rowsAffected === 0) {
          throw new NotFoundError(`No shift found with ID: ${shiftId} for tenant: ${tenantId}`);
        }
        
        return { ...deleteResult, rowsAffected };
      });
      
      console.log(`Hard delete successful for shift ID: ${shiftId}, tenant: ${tenantId}, rows affected: ${result.rowsAffected}`);
      return { success: true };
    } catch (error) {
      if (error instanceof ValidationError || error instanceof NotFoundError) {
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
        'Failed to delete shift',
        error
      );
    }
  }
}

export default ShiftModel;

