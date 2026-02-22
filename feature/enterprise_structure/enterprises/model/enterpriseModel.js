import db from '../../../../config/db.js';
import oracledb from 'oracledb';

/**
 * Enterprise Model
 * Handles all database operations for ENT.ENTERPRISES table
 */
class EnterpriseModel {
  static TABLE_NAME = 'ENT.ENTERPRISES';

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
   * Get all enterprises
   * @param {Object} filters - Optional filters (enterpriseId, enterpriseCode, isActive)
   * @returns {Promise<Array>} Array of enterprises
   */
  static async findAll(filters = {}) {
    try {
      let query = `SELECT 
        ENTERPRISE_ID,
        ENTERPRISE_CODE,
        ENTERPRISE_NAME,
        IS_ACTIVE,
        CREATED_BY,
        CREATED_DATE,
        LAST_UPDATED_BY,
        LAST_UPDATED_DATE,
        LAST_UPDATE_LOGIN
      FROM ${this.TABLE_NAME}`;

      const bindParams = [];
      const conditions = [];
      let paramIndex = 1;

      if (filters.enterpriseId) {
        conditions.push(`ENTERPRISE_ID = :${paramIndex}`);
        bindParams.push(filters.enterpriseId);
        paramIndex++;
      }

      if (filters.enterpriseCode) {
        conditions.push(`UPPER(ENTERPRISE_CODE) = UPPER(:${paramIndex})`);
        bindParams.push(filters.enterpriseCode);
        paramIndex++;
      }

      if (filters.isActive !== undefined) {
        conditions.push(`IS_ACTIVE = :${paramIndex}`);
        bindParams.push(filters.isActive === true || filters.isActive === 'Y' ? 'Y' : 'N');
        paramIndex++;
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      query += ` ORDER BY ENTERPRISE_ID`;

      const result = await this.executeQuery(query, bindParams);
      return result.rows || [];
    } catch (error) {
      console.error('Error in findAll:', error);
      throw new Error(`Failed to fetch enterprises: ${error.message}`);
    }
  }

  /**
   * Get a single enterprise by ID
   * @param {number} enterpriseId - Enterprise ID
   * @returns {Promise<Object|null>} Enterprise object or null if not found
   */
  static async findById(enterpriseId) {
    try {
      const query = `SELECT 
        ENTERPRISE_ID,
        ENTERPRISE_CODE,
        ENTERPRISE_NAME,
        IS_ACTIVE,
        CREATED_BY,
        CREATED_DATE,
        LAST_UPDATED_BY,
        LAST_UPDATED_DATE,
        LAST_UPDATE_LOGIN
      FROM ${this.TABLE_NAME}
      WHERE ENTERPRISE_ID = :1`;

      const result = await this.executeQuery(query, [enterpriseId]);
      
      if (result.rows && result.rows.length > 0) {
        return result.rows[0];
      }
      
      return null;
    } catch (error) {
      console.error('Error in findById:', error);
      throw new Error(`Failed to fetch enterprise: ${error.message}`);
    }
  }

  /**
   * Get a single enterprise by code
   * @param {string} enterpriseCode - Enterprise code
   * @returns {Promise<Object|null>} Enterprise object or null if not found
   */
  static async findByCode(enterpriseCode) {
    try {
      const query = `SELECT 
        ENTERPRISE_ID,
        ENTERPRISE_CODE,
        ENTERPRISE_NAME,
        IS_ACTIVE,
        CREATED_BY,
        CREATED_DATE,
        LAST_UPDATED_BY,
        LAST_UPDATED_DATE,
        LAST_UPDATE_LOGIN
      FROM ${this.TABLE_NAME}
      WHERE UPPER(ENTERPRISE_CODE) = UPPER(:1)`;

      const result = await this.executeQuery(query, [enterpriseCode]);
      
      if (result.rows && result.rows.length > 0) {
        return result.rows[0];
      }
      
      return null;
    } catch (error) {
      console.error('Error in findByCode:', error);
      throw new Error(`Failed to fetch enterprise by code: ${error.message}`);
    }
  }

  /**
   * Create a new enterprise
   * @param {Object} data - Enterprise data
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<Object>} Created enterprise
   */
  static async create(data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        // Get next ENTERPRISE_ID from sequence (or use MAX+1 if sequence doesn't exist)
        let enterpriseId;
        try {
          const seqQuery = `SELECT ENT.ENTERPRISES_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`;
          const seqResult = await connection.execute(seqQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          enterpriseId = seqResult.rows[0].NEXT_ID;
        } catch (seqError) {
          // If sequence doesn't exist, get max ID and increment
          const maxQuery = `SELECT NVL(MAX(ENTERPRISE_ID), 0) + 1 AS NEXT_ID FROM ${this.TABLE_NAME}`;
          const maxResult = await connection.execute(maxQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          enterpriseId = maxResult.rows[0].NEXT_ID;
        }

        const now = new Date();
        const query = `INSERT INTO ${this.TABLE_NAME} (
          ENTERPRISE_ID,
          ENTERPRISE_CODE,
          ENTERPRISE_NAME,
          IS_ACTIVE,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATED_DATE,
          LAST_UPDATE_LOGIN
        ) VALUES (
          :1, :2, :3, :4, :5, :6, :7, :8, :9
        )`;

        const bindParams = [
          enterpriseId,
          data.ENTERPRISE_CODE || null,
          data.ENTERPRISE_NAME || null,
          data.IS_ACTIVE !== false && data.IS_ACTIVE !== 'N' ? 'Y' : 'N',
          userId || 'SYSTEM',
          now,
          userId || 'SYSTEM',
          now,
          data.LAST_UPDATE_LOGIN || null
        ];

        await connection.execute(query, bindParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        // Fetch and return the created record
        const selectQuery = `SELECT * FROM ${this.TABLE_NAME} WHERE ENTERPRISE_ID = :1`;
        const selectResult = await connection.execute(selectQuery, [enterpriseId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        return selectResult.rows[0];
      });
    } catch (error) {
      console.error('Error in create:', error);
      
      // Handle unique constraint violation
      if (error.errorNum === 1 || error.message?.includes('ORA-00001') || error.message?.includes('unique constraint')) {
        throw new Error(`Enterprise code already exists: ${data.ENTERPRISE_CODE}`);
      }
      
      throw new Error(`Failed to create enterprise: ${error.message}`);
    }
  }

  /**
   * Update an existing enterprise
   * @param {number} enterpriseId - Enterprise ID
   * @param {Object} data - Updated data
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<Object>} Updated enterprise
   */
  static async update(enterpriseId, data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        const updateFields = [];
        const bindParams = [];
        let paramIndex = 1;

        // Build dynamic update query
        if (data.ENTERPRISE_CODE !== undefined) {
          updateFields.push(`ENTERPRISE_CODE = :${paramIndex}`);
          bindParams.push(data.ENTERPRISE_CODE);
          paramIndex++;
        }
        if (data.ENTERPRISE_NAME !== undefined) {
          updateFields.push(`ENTERPRISE_NAME = :${paramIndex}`);
          bindParams.push(data.ENTERPRISE_NAME);
          paramIndex++;
        }
        if (data.IS_ACTIVE !== undefined) {
          updateFields.push(`IS_ACTIVE = :${paramIndex}`);
          bindParams.push(data.IS_ACTIVE !== false && data.IS_ACTIVE !== 'N' ? 'Y' : 'N');
          paramIndex++;
        }
        if (data.LAST_UPDATE_LOGIN !== undefined) {
          updateFields.push(`LAST_UPDATE_LOGIN = :${paramIndex}`);
          bindParams.push(data.LAST_UPDATE_LOGIN);
          paramIndex++;
        }

        if (updateFields.length === 0) {
          throw new Error('No fields to update');
        }

        // Add audit fields
        updateFields.push(`LAST_UPDATED_BY = :${paramIndex}`);
        bindParams.push(userId || 'SYSTEM');
        paramIndex++;

        updateFields.push(`LAST_UPDATED_DATE = :${paramIndex}`);
        bindParams.push(new Date());
        paramIndex++;

        // Add WHERE clause
        bindParams.push(enterpriseId);
        const query = `UPDATE ${this.TABLE_NAME} SET ${updateFields.join(', ')} WHERE ENTERPRISE_ID = :${paramIndex}`;

        await connection.execute(query, bindParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        // Fetch and return the updated record
        const selectQuery = `SELECT * FROM ${this.TABLE_NAME} WHERE ENTERPRISE_ID = :1`;
        const selectResult = await connection.execute(selectQuery, [enterpriseId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        if (!selectResult.rows || selectResult.rows.length === 0) {
          throw new Error(`Enterprise not found with ID: ${enterpriseId}`);
        }
        
        return selectResult.rows[0];
      });
    } catch (error) {
      console.error('Error in update:', error);
      
      // Handle unique constraint violation
      if (error.errorNum === 1 || error.message?.includes('ORA-00001') || error.message?.includes('unique constraint')) {
        throw new Error(`Enterprise code already exists: ${data.ENTERPRISE_CODE}`);
      }
      
      throw new Error(`Failed to update enterprise: ${error.message}`);
    }
  }

  /**
   * Delete an enterprise (soft delete by setting IS_ACTIVE = 'N')
   * @param {number} enterpriseId - Enterprise ID
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<boolean>} Success status
   */
  static async softDelete(enterpriseId, userId) {
    try {
      const result = await this.executeWithTransaction(async (connection) => {
        const query = `UPDATE ${this.TABLE_NAME} 
          SET IS_ACTIVE = 'N',
              LAST_UPDATED_BY = :1,
              LAST_UPDATED_DATE = :2
          WHERE ENTERPRISE_ID = :3`;

        const updateResult = await connection.execute(query, [userId || 'SYSTEM', new Date(), enterpriseId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        // Verify that the update affected at least one row
        const rowsAffected = updateResult.rowsAffected || updateResult.rowCount || 0;
        if (rowsAffected === 0) {
          throw new Error(`No enterprise found with ID: ${enterpriseId}`);
        }
        
        return { ...updateResult, rowsAffected };
      });
      
      console.log(`Soft delete successful for enterprise ID: ${enterpriseId}, rows affected: ${result.rowsAffected}`);
      return true;
    } catch (error) {
      console.error('Error in softDelete:', error);
      throw new Error(`Failed to delete enterprise: ${error.message}`);
    }
  }

  /**
   * Hard delete an enterprise (permanent removal)
   * @param {number} enterpriseId - Enterprise ID
   * @returns {Promise<Object>} Success status
   */
  static async hardDelete(enterpriseId) {
    try {
      const result = await this.executeWithTransaction(async (connection) => {
        const query = `DELETE FROM ${this.TABLE_NAME} WHERE ENTERPRISE_ID = :1`;
        const deleteResult = await connection.execute(query, [enterpriseId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        // Verify that the delete affected at least one row
        const rowsAffected = deleteResult.rowsAffected || deleteResult.rowCount || 0;
        if (rowsAffected === 0) {
          throw new Error(`No enterprise found with ID: ${enterpriseId}`);
        }
        
        return { ...deleteResult, rowsAffected };
      });
      
      console.log(`Hard delete successful for enterprise ID: ${enterpriseId}, rows affected: ${result.rowsAffected}`);
      return { success: true };
    } catch (error) {
      console.error('Error in hardDelete:', error);
      
      // Handle foreign key constraint violation
      if (error.errorNum === 2292 || error.message?.includes('ORA-02292') || error.message?.includes('integrity constraint')) {
        const constraintName = error.message?.match(/\(([^)]+)\)/)?.[1] || 'UNKNOWN';
        const constraintError = new Error(`Cannot delete enterprise: This enterprise is referenced by other records in the database.`);
        constraintError.errorNum = 2292;
        constraintError.code = 'FOREIGN_KEY_CONSTRAINT';
        constraintError.constraint = constraintName;
        constraintError.suggestion = 'Use soft delete (?soft=true) to deactivate this enterprise instead of permanently deleting it.';
        throw constraintError;
      }
      
      throw new Error(`Failed to delete enterprise: ${error.message}`);
    }
  }
}

export default EnterpriseModel;

