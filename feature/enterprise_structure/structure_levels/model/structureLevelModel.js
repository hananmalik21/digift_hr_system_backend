import db from '../../../../config/db.js';
import oracledb from 'oracledb';

/**
 * Structure Level Model
 * Handles all database operations for ENT.STRUCTURE_LEVELS table
 */
class StructureLevelModel {
  static TABLE_NAME = 'ENT.STRUCTURE_LEVELS';

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
   * Get all structure levels
   * @param {Object} filters - Optional filters (levelId, levelCode, isActive)
   * @returns {Promise<Array>} Array of structure levels
   */
  static async findAll(filters = {}) {
    let query = '';
    let bindParams = [];
    
    try {
      query = `SELECT 
        LEVEL_ID,
        LEVEL_CODE,
        LEVEL_NAME,
        IS_MANDATORY,
        IS_ACTIVE,
        CREATED_BY,
        CREATED_DATE,
        LAST_UPDATED_BY,
        LAST_UPDATED_DATE,
        LAST_UPDATE_LOGIN
      FROM ${this.TABLE_NAME}`;

      const conditions = [];
      bindParams = [];
      let paramIndex = 1;

      if (filters.levelId) {
        conditions.push(`LEVEL_ID = :${paramIndex}`);
        bindParams.push(filters.levelId);
        paramIndex++;
      }

      if (filters.levelCode) {
        conditions.push(`LEVEL_CODE = :${paramIndex}`);
        bindParams.push(filters.levelCode);
        paramIndex++;
      }

      if (filters.isActive !== undefined) {
        conditions.push(`IS_ACTIVE = :${paramIndex}`);
        bindParams.push(filters.isActive ? 'Y' : 'N');
        paramIndex++;
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      query += ` ORDER BY LEVEL_ID`;

      // Execute query with parameterized bindings
      const result = await this.executeQuery(query, bindParams);
      return result.rows || [];
    } catch (error) {
      console.error('Error in findAll:', error);
      console.error('Query that failed:', query);
      console.error('Bind params:', bindParams);
      throw new Error(`Failed to fetch structure levels: ${error.message}`);
    }
  }

  /**
   * Get a single structure level by LEVEL_ID
   * @param {number} levelId - Level ID
   * @returns {Promise<Object|null>} Structure level object or null
   */
  static async findById(levelId) {
    try {
      const query = `SELECT 
        LEVEL_ID,
        LEVEL_CODE,
        LEVEL_NAME,
        IS_MANDATORY,
        IS_ACTIVE,
        CREATED_BY,
        CREATED_DATE,
        LAST_UPDATED_BY,
        LAST_UPDATED_DATE,
        LAST_UPDATE_LOGIN
      FROM ${this.TABLE_NAME}
      WHERE LEVEL_ID = :1`;

      const result = await this.executeQuery(query, [levelId]);
      
      if (result.rows && result.rows.length > 0) {
        return result.rows[0];
      }
      return null;
    } catch (error) {
      console.error('Error in findById:', error);
      throw new Error(`Failed to fetch structure level: ${error.message}`);
    }
  }

  /**
   * Create a new structure level
   * @param {Object} data - Structure level data
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<Object>} Created structure level
   */
  static async create(data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        // Get next LEVEL_ID from sequence (or use MAX+1 if sequence doesn't exist)
        let levelId;
        try {
          const seqQuery = `SELECT ENT.STRUCTURE_LEVELS_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`;
          const seqResult = await connection.execute(seqQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          levelId = seqResult.rows[0].NEXT_ID;
        } catch (seqError) {
          // If sequence doesn't exist, get max ID and increment
          const maxQuery = `SELECT NVL(MAX(LEVEL_ID), 0) + 1 AS NEXT_ID FROM ${this.TABLE_NAME}`;
          const maxResult = await connection.execute(maxQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          levelId = maxResult.rows[0].NEXT_ID;
        }

        const now = new Date();
        const query = `INSERT INTO ${this.TABLE_NAME} (
          LEVEL_ID,
          LEVEL_CODE,
          LEVEL_NAME,
          IS_MANDATORY,
          IS_ACTIVE,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATED_DATE,
          LAST_UPDATE_LOGIN
        ) VALUES (
          :1, :2, :3, :4, :5, :6, :7, :8, :9, :10
        )`;

        const bindParams = [
          levelId,
          data.LEVEL_CODE || null,
          data.LEVEL_NAME || null,
          data.IS_MANDATORY === true || data.IS_MANDATORY === 'Y' ? 'Y' : 'N',
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
        const selectQuery = `SELECT * FROM ${this.TABLE_NAME} WHERE LEVEL_ID = :1`;
        const selectResult = await connection.execute(selectQuery, [levelId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        return this.convertKeysToSnakeCase(selectResult.rows[0]);
      });
    } catch (error) {
      console.error('Error in create:', error);
      
      // Handle Oracle constraint violations
      const isUniqueConstraint = 
        error.errorNum === 1 || 
        error.code === 1 ||
        error.message?.includes('ORA-00001') || 
        error.message?.includes('unique constraint') ||
        (error.message && /unique constraint/i.test(error.message));
      
      if (isUniqueConstraint) {
        const constraintMatch = error.message?.match(/\(([A-Z_][A-Z0-9_.]+)\)/);
        const constraintName = constraintMatch ? constraintMatch[1] : 'UNKNOWN';
        const columnMatch = error.message?.match(/columns?\s*\(([^)]+)\)/i);
        const columns = columnMatch ? columnMatch[1] : 'LEVEL_CODE';
        
        const constraintError = new Error(`A structure level with this ${columns} already exists.`);
        constraintError.errorNum = 1;
        constraintError.code = 'UNIQUE_CONSTRAINT_VIOLATION';
        constraintError.statusCode = 409;
        constraintError.constraint = constraintName;
        constraintError.columns = columns;
        constraintError.userMessage = `A structure level with the same ${columns} already exists.`;
        throw constraintError;
      }
      
      throw new Error(`Failed to create structure level: ${error.message}`);
    }
  }

  /**
   * Update an existing structure level
   * @param {number} levelId - Level ID
   * @param {Object} data - Updated data
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<Object>} Updated structure level
   */
  static async update(levelId, data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        const updateFields = [];
        const bindParams = [];
        let paramIndex = 1;

        // Build dynamic update query
        if (data.LEVEL_CODE !== undefined) {
          updateFields.push(`LEVEL_CODE = :${paramIndex}`);
          bindParams.push(data.LEVEL_CODE);
          paramIndex++;
        }
        if (data.LEVEL_NAME !== undefined) {
          updateFields.push(`LEVEL_NAME = :${paramIndex}`);
          bindParams.push(data.LEVEL_NAME);
          paramIndex++;
        }
        if (data.IS_MANDATORY !== undefined) {
          updateFields.push(`IS_MANDATORY = :${paramIndex}`);
          bindParams.push(data.IS_MANDATORY === true || data.IS_MANDATORY === 'Y' ? 'Y' : 'N');
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
        bindParams.push(levelId);
        const query = `UPDATE ${this.TABLE_NAME} SET ${updateFields.join(', ')} WHERE LEVEL_ID = :${paramIndex}`;

        await connection.execute(query, bindParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        // Fetch and return the updated record
        const selectQuery = `SELECT * FROM ${this.TABLE_NAME} WHERE LEVEL_ID = :1`;
        const selectResult = await connection.execute(selectQuery, [levelId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        return this.convertKeysToSnakeCase(selectResult.rows[0]);
      });
    } catch (error) {
      console.error('Error in update:', error);
      
      // Handle Oracle constraint violations
      const isUniqueConstraint = 
        error.errorNum === 1 || 
        error.code === 1 ||
        error.message?.includes('ORA-00001') || 
        error.message?.includes('unique constraint') ||
        (error.message && /unique constraint/i.test(error.message));
      
      if (isUniqueConstraint) {
        const constraintMatch = error.message?.match(/\(([A-Z_][A-Z0-9_.]+)\)/);
        const constraintName = constraintMatch ? constraintMatch[1] : 'UNKNOWN';
        const columnMatch = error.message?.match(/columns?\s*\(([^)]+)\)/i);
        const columns = columnMatch ? columnMatch[1] : 'UNKNOWN';
        
        const constraintError = new Error(`A structure level with this ${columns} already exists.`);
        constraintError.errorNum = 1;
        constraintError.code = 'UNIQUE_CONSTRAINT_VIOLATION';
        constraintError.statusCode = 409;
        constraintError.constraint = constraintName;
        constraintError.columns = columns;
        constraintError.userMessage = `A structure level with the same ${columns} already exists.`;
        throw constraintError;
      }
      
      throw new Error(`Failed to update structure level: ${error.message}`);
    }
  }

  /**
   * Delete a structure level (soft delete by setting IS_ACTIVE = 'N')
   * @param {number} levelId - Level ID
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<boolean>} Success status
   */
  static async softDelete(levelId, userId) {
    try {
      const result = await this.executeWithTransaction(async (connection) => {
        const query = `UPDATE ${this.TABLE_NAME} 
          SET IS_ACTIVE = 'N',
              LAST_UPDATED_BY = :1,
              LAST_UPDATED_DATE = :2
          WHERE LEVEL_ID = :3`;

        const updateResult = await connection.execute(query, [userId || 'SYSTEM', new Date(), levelId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        // Verify that the update affected at least one row
        const rowsAffected = updateResult.rowsAffected || updateResult.rowCount || 0;
        if (rowsAffected === 0) {
          throw new Error(`No structure level found with LEVEL_ID: ${levelId}`);
        }
        
        return { ...updateResult, rowsAffected };
      });
      
      console.log(`Soft delete successful for level ID: ${levelId}, rows affected: ${result.rowsAffected}`);
      return true;
    } catch (error) {
      console.error('Error in softDelete:', error);
      throw new Error(`Failed to delete structure level: ${error.message}`);
    }
  }

  /**
   * Hard delete a structure level (permanent removal)
   * @param {number} levelId - Level ID
   * @returns {Promise<Object>} Success status
   */
  static async hardDelete(levelId) {
    try {
      const result = await this.executeWithTransaction(async (connection) => {
        const query = `DELETE FROM ${this.TABLE_NAME} WHERE LEVEL_ID = :1`;
        const deleteResult = await connection.execute(query, [levelId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        // Verify that the delete affected at least one row
        const rowsAffected = deleteResult.rowsAffected || deleteResult.rowCount || 0;
        if (rowsAffected === 0) {
          throw new Error(`No structure level found with LEVEL_ID: ${levelId}`);
        }
        
        return { ...deleteResult, rowsAffected };
      });
      
      console.log(`Hard delete successful for level ID: ${levelId}, rows affected: ${result.rowsAffected}`);
      return { success: true };
    } catch (error) {
      console.error('Error in hardDelete:', error);
      throw new Error(`Failed to delete structure level: ${error.message}`);
    }
  }
}

export default StructureLevelModel;

