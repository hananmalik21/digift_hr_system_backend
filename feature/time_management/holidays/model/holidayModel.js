import db from '../../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError } from '../../../../utils/errors/index.js';

/**
 * Holiday Model
 * Handles all database operations for ENT.HR_HOLIDAYS table
 */
class HolidayModel {
  static TABLE_NAME = 'ENT.HR_HOLIDAYS';

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
   * Convert date string to Date object for Oracle
   * @param {string|Date|null} dateValue - Date string or Date object
   * @returns {Date|null} Date object or null
   */
  static convertToDate(dateValue) {
    if (!dateValue) return null;
    if (dateValue instanceof Date) return dateValue;
    if (typeof dateValue === 'string') {
      // Try to parse the date string
      const parsed = new Date(dateValue);
      if (isNaN(parsed.getTime())) {
        return null; // Invalid date
      }
      return parsed;
    }
    return null;
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
   * Get all holidays
   * @param {Object} filters - Optional filters (holidayId, tenantId, holidayYear, holidayType, status, pagination)
   * @param {Object} filters.pagination - Pagination options {page, pageSize}
   * @returns {Promise<Object|Array>} Object with {holidays, total} if paginated, or Array of holidays
   */
  static async findAll(filters = {}) {
    try {
      // Build base query for counting total records
      let countQuery = `SELECT COUNT(*) AS total FROM ${this.TABLE_NAME} h`;
      let dataQuery = `SELECT 
        h.HOLIDAY_ID,
        h.TENANT_ID,
        h.HOLIDAY_NAME_EN,
        h.HOLIDAY_NAME_AR,
        h.HOLIDAY_DATE,
        h.HOLIDAY_YEAR,
        h.HOLIDAY_TYPE,
        h.DESCRIPTION_EN,
        h.DESCRIPTION_AR,
        h.APPLIES_TO,
        h.STATUS,
        h.CREATION_DATE,
        h.CREATED_BY,
        h.LAST_UPDATE_DATE,
        h.LAST_UPDATED_BY
      FROM ${this.TABLE_NAME} h`;

      const conditions = [];
      const bindParams = [];
      let paramIndex = 1;

      if (filters.holidayId) {
        conditions.push(`h.HOLIDAY_ID = :${paramIndex}`);
        bindParams.push(filters.holidayId);
        paramIndex++;
      }

      if (filters.tenantId) {
        conditions.push(`h.TENANT_ID = :${paramIndex}`);
        bindParams.push(filters.tenantId);
        paramIndex++;
      }

      // Search across holiday name (EN and AR)
      if (filters.search) {
        const searchValue = `%${filters.search}%`;
        conditions.push(`(
          UPPER(h.HOLIDAY_NAME_EN) LIKE UPPER(:${paramIndex}) OR
          UPPER(h.HOLIDAY_NAME_AR) LIKE UPPER(:${paramIndex + 1})
        )`);
        bindParams.push(searchValue);
        bindParams.push(searchValue);
        paramIndex += 2;
      }

      if (filters.holidayYear) {
        conditions.push(`h.HOLIDAY_YEAR = :${paramIndex}`);
        bindParams.push(filters.holidayYear);
        paramIndex++;
      }

      if (filters.holidayType) {
        conditions.push(`h.HOLIDAY_TYPE = :${paramIndex}`);
        bindParams.push(filters.holidayType);
        paramIndex++;
      }

      if (filters.status) {
        conditions.push(`h.STATUS = :${paramIndex}`);
        bindParams.push(filters.status);
        paramIndex++;
      }

      if (filters.appliesTo) {
        conditions.push(`h.APPLIES_TO = :${paramIndex}`);
        bindParams.push(filters.appliesTo);
        paramIndex++;
      }

      // Filter by date range
      if (filters.startDate) {
        conditions.push(`h.HOLIDAY_DATE >= :${paramIndex}`);
        bindParams.push(this.convertToDate(filters.startDate));
        paramIndex++;
      }

      if (filters.endDate) {
        conditions.push(`h.HOLIDAY_DATE <= :${paramIndex}`);
        bindParams.push(this.convertToDate(filters.endDate));
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

      // Add WHERE clause to both queries
      countQuery += whereClause;
      dataQuery += whereClause;

      dataQuery += ` ORDER BY h.HOLIDAY_DATE DESC, h.HOLIDAY_ID DESC`;

      // Handle pagination
      const pagination = filters.pagination;
      let totalCount = 0;
      
      // Create separate bind parameter arrays for count and data queries
      const countBindParams = [...bindParams];
      const dataBindParams = [...bindParams];
      
      if (pagination && pagination.page && pagination.pageSize) {
        // Get total count first using count bind params
        const countResult = await this.executeQuery(countQuery, countBindParams);
        totalCount = countResult.rows && countResult.rows.length > 0 ? countResult.rows[0].total : 0;

        // Apply pagination using Oracle's OFFSET and FETCH NEXT
        const offset = (pagination.page - 1) * pagination.pageSize;
        dataQuery += ` OFFSET :${paramIndex} ROWS FETCH NEXT :${paramIndex + 1} ROWS ONLY`;
        dataBindParams.push(offset);
        dataBindParams.push(pagination.pageSize);
      }

      // Execute data query with parameterized bindings
      const result = await this.executeQuery(dataQuery, dataBindParams);
      const holidays = result.rows || [];

      // Return paginated result with total count
      if (pagination && pagination.page && pagination.pageSize) {
        return {
          holidays: holidays,
          total: totalCount
        };
      }

      return holidays;
    } catch (error) {
      console.error('Error in findAll:', error);
      throw new Error(`Failed to fetch holidays: ${error.message}`);
    }
  }

  /**
   * Get a single holiday by ID
   * @param {number} holidayId - Holiday ID
   * @returns {Promise<Object|null>} Holiday object or null
   */
  static async findById(holidayId) {
    try {
      const query = `SELECT 
        h.HOLIDAY_ID,
        h.TENANT_ID,
        h.HOLIDAY_NAME_EN,
        h.HOLIDAY_NAME_AR,
        h.HOLIDAY_DATE,
        h.HOLIDAY_YEAR,
        h.HOLIDAY_TYPE,
        h.DESCRIPTION_EN,
        h.DESCRIPTION_AR,
        h.APPLIES_TO,
        h.STATUS,
        h.CREATION_DATE,
        h.CREATED_BY,
        h.LAST_UPDATE_DATE,
        h.LAST_UPDATED_BY
      FROM ${this.TABLE_NAME} h
      WHERE h.HOLIDAY_ID = :1`;

      const result = await this.executeQuery(query, [holidayId]);
      
      if (result.rows && result.rows.length > 0) {
        return result.rows[0];
      }
      return null;
    } catch (error) {
      // Wrap Oracle errors in DatabaseError
      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(
          DatabaseError.getUserFriendlyMessage(error),
          error
        );
      }
      
      // If it's already a DatabaseError, re-throw it
      if (error instanceof DatabaseError) {
        throw error;
      }
      
      // For other errors, wrap in DatabaseError
      throw new DatabaseError(
        'Failed to fetch holiday',
        error
      );
    }
  }

  /**
   * Create a new holiday
   * @param {Object} data - Holiday data
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<Object>} Created holiday
   */
  static async create(data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        // Get next HOLIDAY_ID from sequence (or use MAX+1 if sequence doesn't exist)
        let holidayId;
        try {
          const seqQuery = `SELECT ENT.HR_HOLIDAYS_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`;
          const seqResult = await connection.execute(seqQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          holidayId = seqResult.rows[0].NEXT_ID;
        } catch (seqError) {
          // If sequence doesn't exist, get max ID and increment
          const maxQuery = `SELECT NVL(MAX(HOLIDAY_ID), 0) + 1 AS NEXT_ID FROM ${this.TABLE_NAME}`;
          const maxResult = await connection.execute(maxQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          holidayId = maxResult.rows[0].NEXT_ID;
        }

        const now = new Date();
        
        // Extract year from holiday date if not provided
        let holidayYear = data.HOLIDAY_YEAR;
        if (!holidayYear && data.HOLIDAY_DATE) {
          const holidayDate = this.convertToDate(data.HOLIDAY_DATE);
          if (holidayDate) {
            holidayYear = holidayDate.getFullYear();
          }
        }

        const query = `INSERT INTO ${this.TABLE_NAME} (
          HOLIDAY_ID,
          TENANT_ID,
          HOLIDAY_NAME_EN,
          HOLIDAY_NAME_AR,
          HOLIDAY_DATE,
          HOLIDAY_YEAR,
          HOLIDAY_TYPE,
          DESCRIPTION_EN,
          DESCRIPTION_AR,
          APPLIES_TO,
          STATUS,
          CREATION_DATE,
          CREATED_BY,
          LAST_UPDATE_DATE,
          LAST_UPDATED_BY
        ) VALUES (
          :1, :2, :3, :4, :5, :6, :7, :8, :9, :10, :11, :12, :13, :14, :15
        )`;

        const bindParams = [
          holidayId,
          data.TENANT_ID || null,
          data.HOLIDAY_NAME_EN || null,
          data.HOLIDAY_NAME_AR || null,
          this.convertToDate(data.HOLIDAY_DATE),
          holidayYear || null,
          data.HOLIDAY_TYPE || null,
          data.DESCRIPTION_EN || null,
          data.DESCRIPTION_AR || null,
          data.APPLIES_TO || null,
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
          h.HOLIDAY_ID,
          h.TENANT_ID,
          h.HOLIDAY_NAME_EN,
          h.HOLIDAY_NAME_AR,
          h.HOLIDAY_DATE,
          h.HOLIDAY_YEAR,
          h.HOLIDAY_TYPE,
          h.DESCRIPTION_EN,
          h.DESCRIPTION_AR,
          h.APPLIES_TO,
          h.STATUS,
          h.CREATION_DATE,
          h.CREATED_BY,
          h.LAST_UPDATE_DATE,
          h.LAST_UPDATED_BY
        FROM ${this.TABLE_NAME} h
        WHERE h.HOLIDAY_ID = :1`;
        const selectResult = await connection.execute(selectQuery, [holidayId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        return this.convertKeysToSnakeCase(selectResult.rows[0]);
      });
    } catch (error) {
      // Wrap Oracle errors in DatabaseError
      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(
          DatabaseError.getUserFriendlyMessage(error),
          error
        );
      }
      
      // If it's already a DatabaseError, re-throw it
      if (error instanceof DatabaseError) {
        throw error;
      }
      
      // For other errors, wrap in DatabaseError
      throw new DatabaseError(
        'Failed to create holiday',
        error
      );
    }
  }

  /**
   * Update an existing holiday
   * @param {number} holidayId - Holiday ID
   * @param {Object} data - Updated data
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<Object>} Updated holiday
   */
  static async update(holidayId, data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        const updateFields = [];
        const bindParams = [];
        let paramIndex = 1;

        // Build dynamic update query
        if (data.TENANT_ID !== undefined) {
          updateFields.push(`TENANT_ID = :${paramIndex}`);
          bindParams.push(data.TENANT_ID);
          paramIndex++;
        }
        if (data.HOLIDAY_NAME_EN !== undefined) {
          updateFields.push(`HOLIDAY_NAME_EN = :${paramIndex}`);
          bindParams.push(data.HOLIDAY_NAME_EN);
          paramIndex++;
        }
        if (data.HOLIDAY_NAME_AR !== undefined) {
          updateFields.push(`HOLIDAY_NAME_AR = :${paramIndex}`);
          bindParams.push(data.HOLIDAY_NAME_AR);
          paramIndex++;
        }
        if (data.HOLIDAY_DATE !== undefined) {
          updateFields.push(`HOLIDAY_DATE = :${paramIndex}`);
          bindParams.push(this.convertToDate(data.HOLIDAY_DATE));
          paramIndex++;
          
          // Auto-update year if date changed
          const holidayDate = this.convertToDate(data.HOLIDAY_DATE);
          if (holidayDate) {
            const newYear = holidayDate.getFullYear();
            updateFields.push(`HOLIDAY_YEAR = :${paramIndex}`);
            bindParams.push(newYear);
            paramIndex++;
          }
        }
        if (data.HOLIDAY_YEAR !== undefined && data.HOLIDAY_DATE === undefined) {
          updateFields.push(`HOLIDAY_YEAR = :${paramIndex}`);
          bindParams.push(data.HOLIDAY_YEAR);
          paramIndex++;
        }
        if (data.HOLIDAY_TYPE !== undefined) {
          updateFields.push(`HOLIDAY_TYPE = :${paramIndex}`);
          bindParams.push(data.HOLIDAY_TYPE);
          paramIndex++;
        }
        if (data.DESCRIPTION_EN !== undefined) {
          updateFields.push(`DESCRIPTION_EN = :${paramIndex}`);
          bindParams.push(data.DESCRIPTION_EN);
          paramIndex++;
        }
        if (data.DESCRIPTION_AR !== undefined) {
          updateFields.push(`DESCRIPTION_AR = :${paramIndex}`);
          bindParams.push(data.DESCRIPTION_AR);
          paramIndex++;
        }
        if (data.APPLIES_TO !== undefined) {
          updateFields.push(`APPLIES_TO = :${paramIndex}`);
          bindParams.push(data.APPLIES_TO);
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
        bindParams.push(holidayId);
        const query = `UPDATE ${this.TABLE_NAME} SET ${updateFields.join(', ')} WHERE HOLIDAY_ID = :${paramIndex}`;

        await connection.execute(query, bindParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        // Fetch and return the updated record
        const selectQuery = `SELECT 
          h.HOLIDAY_ID,
          h.TENANT_ID,
          h.HOLIDAY_NAME_EN,
          h.HOLIDAY_NAME_AR,
          h.HOLIDAY_DATE,
          h.HOLIDAY_YEAR,
          h.HOLIDAY_TYPE,
          h.DESCRIPTION_EN,
          h.DESCRIPTION_AR,
          h.APPLIES_TO,
          h.STATUS,
          h.CREATION_DATE,
          h.CREATED_BY,
          h.LAST_UPDATE_DATE,
          h.LAST_UPDATED_BY
        FROM ${this.TABLE_NAME} h
        WHERE h.HOLIDAY_ID = :1`;
        const selectResult = await connection.execute(selectQuery, [holidayId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        return this.convertKeysToSnakeCase(selectResult.rows[0]);
      });
    } catch (error) {
      // Wrap Oracle errors in DatabaseError
      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(
          DatabaseError.getUserFriendlyMessage(error),
          error
        );
      }
      
      // If it's already a DatabaseError, re-throw it
      if (error instanceof DatabaseError) {
        throw error;
      }
      
      // For other errors, wrap in DatabaseError
      throw new DatabaseError(
        'Failed to update holiday',
        error
      );
    }
  }

  /**
   * Delete a holiday (soft delete by setting STATUS = 'INACTIVE')
   * @param {number} holidayId - Holiday ID
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<boolean>} Success status
   */
  static async softDelete(holidayId, userId) {
    try {
      const result = await this.executeWithTransaction(async (connection) => {
        const query = `UPDATE ${this.TABLE_NAME} 
          SET STATUS = 'INACTIVE',
              LAST_UPDATED_BY = :1,
              LAST_UPDATE_DATE = :2
          WHERE HOLIDAY_ID = :3`;

        const updateResult = await connection.execute(query, [userId || 'SYSTEM', new Date(), holidayId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        // Verify that the update affected at least one row
        const rowsAffected = updateResult.rowsAffected || updateResult.rowCount || 0;
        if (rowsAffected === 0) {
          throw new Error(`No holiday found with ID: ${holidayId}`);
        }
        
        return { ...updateResult, rowsAffected };
      });
      
      console.log(`Soft delete successful for holiday ID: ${holidayId}, rows affected: ${result.rowsAffected}`);
      return true;
    } catch (error) {
      console.error('Error in softDelete:', error);
      throw new Error(`Failed to delete holiday: ${error.message}`);
    }
  }

  /**
   * Hard delete a holiday (permanent removal)
   * @param {number} holidayId - Holiday ID
   * @returns {Promise<Object>} Success status
   */
  static async hardDelete(holidayId) {
    try {
      const result = await this.executeWithTransaction(async (connection) => {
        const query = `DELETE FROM ${this.TABLE_NAME} WHERE HOLIDAY_ID = :1`;
        const deleteResult = await connection.execute(query, [holidayId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        // Verify that the delete affected at least one row
        const rowsAffected = deleteResult.rowsAffected || deleteResult.rowCount || 0;
        if (rowsAffected === 0) {
          throw new Error(`No holiday found with ID: ${holidayId}`);
        }
        
        return { ...deleteResult, rowsAffected };
      });
      
      console.log(`Hard delete successful for holiday ID: ${holidayId}, rows affected: ${result.rowsAffected}`);
      return { success: true };
    } catch (error) {
      // Wrap Oracle errors in DatabaseError
      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(
          DatabaseError.getUserFriendlyMessage(error),
          error
        );
      }
      
      // If it's already a DatabaseError, re-throw it
      if (error instanceof DatabaseError) {
        throw error;
      }
      
      // For other errors, wrap in DatabaseError
      throw new DatabaseError(
        'Failed to delete holiday',
        error
      );
    }
  }
}

export default HolidayModel;




