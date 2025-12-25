import db from '../../../config/db.js';
import oracledb from 'oracledb';

/**
 * HR Organization Hierarchy Level Model
 * Handles all database operations for ENT.HR_ORG_HIERARCHY_LEVELS table
 */
class HrOrgHierarchyLevelModel {
  static TABLE_NAME = 'ENT.HR_ORG_HIERARCHY_LEVELS';

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
   * Get all hierarchy levels
   * @param {Object} filters - Optional filters (levelId, structureId, isActive)
   * @returns {Promise<Array>} Array of hierarchy levels
   */
  static async findAll(filters = {}) {
    try {
      let query = `SELECT 
        LEVEL_ID,
        STRUCTURE_ID,
        LEVEL_NUMBER,
        LEVEL_CODE,
        LEVEL_NAME,
        IS_MANDATORY,
        IS_ACTIVE,
        DISPLAY_ORDER,
        CREATED_BY,
        CREATED_DATE,
        LAST_UPDATED_BY,
        LAST_UPDATED_DATE,
        LAST_UPDATE_LOGIN
      FROM ${this.TABLE_NAME}`;

      const conditions = [];
      const bindParams = [];
      let paramIndex = 1;

      if (filters.levelId) {
        conditions.push(`LEVEL_ID = :${paramIndex}`);
        bindParams.push(filters.levelId);
        paramIndex++;
      }

      if (filters.structureId) {
        conditions.push(`STRUCTURE_ID = :${paramIndex}`);
        bindParams.push(filters.structureId);
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

      query += ` ORDER BY DISPLAY_ORDER, LEVEL_NUMBER`;

      // Execute query with parameterized bindings
      const result = await this.executeQuery(query, bindParams);
      return result.rows || [];
    } catch (error) {
      console.error('Error in findAll:', error);
      console.error('Query:', query);
      console.error('Bind params:', bindParams);
      console.error('Error details:', {
        message: error.message,
        code: error.errorNum || error.code,
        stack: error.stack
      });
      throw new Error(`Failed to fetch hierarchy levels: ${error.message}`);
    }
  }

  /**
   * Get a single hierarchy level by ID
   * @param {number} levelId - Level ID
   * @returns {Promise<Object|null>} Hierarchy level object or null
   */
  static async findById(levelId) {
    try {
      const query = `SELECT 
        LEVEL_ID,
        STRUCTURE_ID,
        LEVEL_NUMBER,
        LEVEL_CODE,
        LEVEL_NAME,
        IS_MANDATORY,
        IS_ACTIVE,
        DISPLAY_ORDER,
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
      throw new Error(`Failed to fetch hierarchy level: ${error.message}`);
    }
  }

  /**
   * Create a new hierarchy level
   * @param {Object} data - Hierarchy level data
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<Object>} Created hierarchy level
   */
  static async create(data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        // Get next LEVEL_ID from sequence (or use MAX+1 if sequence doesn't exist)
        let levelId;
        try {
          const seqQuery = `SELECT ENT.HR_ORG_HIERARCHY_LEVELS_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`;
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
          STRUCTURE_ID,
          LEVEL_NUMBER,
          LEVEL_CODE,
          LEVEL_NAME,
          IS_MANDATORY,
          IS_ACTIVE,
          DISPLAY_ORDER,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATED_DATE,
          LAST_UPDATE_LOGIN
        ) VALUES (
          :1, :2, :3, :4, :5, :6, :7, :8, :9, :10, :11, :12, :13
        )`;

        const bindParams = [
          levelId,
          data.STRUCTURE_ID || null,
          data.LEVEL_NUMBER || null,
          data.LEVEL_CODE || null,
          data.LEVEL_NAME || null,
          data.IS_MANDATORY === true || data.IS_MANDATORY === 'Y' ? 'Y' : 'N',
          data.IS_ACTIVE !== false && data.IS_ACTIVE !== 'N' ? 'Y' : 'N',
          data.DISPLAY_ORDER || null,
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
        
        return selectResult.rows[0];
      });
    } catch (error) {
      console.error('Error in create:', error);
      throw new Error(`Failed to create hierarchy level: ${error.message}`);
    }
  }

  /**
   * Create multiple hierarchy levels for a structure (uses existing connection for transaction)
   * @param {Object} connection - Database connection (from existing transaction)
   * @param {number} structureId - Structure ID
   * @param {Array} levelsArray - Array of level data objects
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<Array>} Array of created hierarchy levels
   */
  static async createBulk(connection, structureId, levelsArray, userId) {
    try {
      // Validate structure exists
      const structureCheckQuery = `SELECT COUNT(*) AS count FROM ENT.HR_ORG_STRUCTURES WHERE STRUCTURE_ID = :1`;
      const structureCheck = await connection.execute(structureCheckQuery, [structureId], {
        outFormat: oracledb.OUT_FORMAT_OBJECT
      });
      
      if (structureCheck.rows[0].COUNT === 0) {
        const notFoundError = new Error(`Structure with ID ${structureId} not found`);
        notFoundError.code = 'NOT_FOUND';
        notFoundError.statusCode = 404;
        throw notFoundError;
      }

      // Validate levels array
      if (!Array.isArray(levelsArray) || levelsArray.length === 0) {
        const validationError = new Error('levels must be a non-empty array');
        validationError.code = 'VALIDATION_ERROR';
        validationError.statusCode = 400;
        throw validationError;
      }

      // Validate each level and check for duplicate LEVEL_NUMBER
      const levelNumbers = new Set();
      const structureLevelIds = [];
      
      for (let i = 0; i < levelsArray.length; i++) {
        const level = levelsArray[i];
        
        // Check if STRUCTURE_LEVEL_ID is provided (reference to ENT.STRUCTURE_LEVELS)
        if (level.STRUCTURE_LEVEL_ID !== undefined && level.STRUCTURE_LEVEL_ID !== null) {
          structureLevelIds.push(level.STRUCTURE_LEVEL_ID);
        }
        
        // LEVEL_NUMBER is required for hierarchy ordering
        if (level.LEVEL_NUMBER === undefined || level.LEVEL_NUMBER === null) {
          const validationError = new Error(`levels[${i}]: LEVEL_NUMBER is required`);
          validationError.code = 'VALIDATION_ERROR';
          validationError.statusCode = 400;
          throw validationError;
        }
        
        // If STRUCTURE_LEVEL_ID is not provided, LEVEL_NAME is required
        if (!level.STRUCTURE_LEVEL_ID && (!level.LEVEL_NAME || level.LEVEL_NAME.trim() === '')) {
          const validationError = new Error(`levels[${i}]: LEVEL_NAME is required when STRUCTURE_LEVEL_ID is not provided`);
          validationError.code = 'VALIDATION_ERROR';
          validationError.statusCode = 400;
          throw validationError;
        }

        if (levelNumbers.has(level.LEVEL_NUMBER)) {
          const validationError = new Error(`levels[${i}]: Duplicate LEVEL_NUMBER ${level.LEVEL_NUMBER} found`);
          validationError.code = 'VALIDATION_ERROR';
          validationError.statusCode = 400;
          throw validationError;
        }
        levelNumbers.add(level.LEVEL_NUMBER);
      }

      // Fetch structure level details if STRUCTURE_LEVEL_IDs are provided
      const structureLevelsMap = new Map();
      if (structureLevelIds.length > 0) {
        const uniqueLevelIds = [...new Set(structureLevelIds)];
        const placeholders = uniqueLevelIds.map((_, idx) => `:${idx + 1}`).join(',');
        const structureLevelQuery = `SELECT 
          LEVEL_ID,
          LEVEL_CODE,
          LEVEL_NAME,
          IS_MANDATORY,
          IS_ACTIVE
        FROM ENT.STRUCTURE_LEVELS
        WHERE LEVEL_ID IN (${placeholders})`;
        
        const structureLevelResult = await connection.execute(structureLevelQuery, uniqueLevelIds, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        if (structureLevelResult.rows.length !== uniqueLevelIds.length) {
          const foundIds = structureLevelResult.rows.map(r => r.LEVEL_ID || r.level_id);
          const missingIds = uniqueLevelIds.filter(id => !foundIds.includes(id));
          const validationError = new Error(`Structure levels not found: ${missingIds.join(', ')}`);
          validationError.code = 'VALIDATION_ERROR';
          validationError.statusCode = 400;
          throw validationError;
        }
        
        // Map structure levels by LEVEL_ID
        for (const row of structureLevelResult.rows) {
          const levelId = row.LEVEL_ID || row.level_id;
          structureLevelsMap.set(levelId, {
            LEVEL_CODE: row.LEVEL_CODE || row.level_code,
            LEVEL_NAME: row.LEVEL_NAME || row.level_name,
            IS_MANDATORY: row.IS_MANDATORY || row.is_mandatory,
            IS_ACTIVE: row.IS_ACTIVE || row.is_active
          });
        }
      }

      const now = new Date();
      const createdLevels = [];

      // Insert all levels
      for (const levelData of levelsArray) {
        // Get next LEVEL_ID from sequence
        let levelId;
        try {
          const seqQuery = `SELECT ENT.HR_ORG_HIERARCHY_LEVELS_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`;
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

        // If STRUCTURE_LEVEL_ID is provided, use details from STRUCTURE_LEVELS
        let levelCode, levelName, isMandatory, isActive;
        if (levelData.STRUCTURE_LEVEL_ID) {
          const structureLevel = structureLevelsMap.get(levelData.STRUCTURE_LEVEL_ID);
          if (!structureLevel) {
            const validationError = new Error(`Structure level with ID ${levelData.STRUCTURE_LEVEL_ID} not found`);
            validationError.code = 'VALIDATION_ERROR';
            validationError.statusCode = 400;
            throw validationError;
          }
          levelCode = levelData.LEVEL_CODE || structureLevel.LEVEL_CODE;
          levelName = levelData.LEVEL_NAME || structureLevel.LEVEL_NAME;
          isMandatory = levelData.IS_MANDATORY !== undefined 
            ? (levelData.IS_MANDATORY === true || levelData.IS_MANDATORY === 'Y' ? 'Y' : 'N')
            : (structureLevel.IS_MANDATORY === 'Y' ? 'Y' : 'N');
          isActive = levelData.IS_ACTIVE !== undefined
            ? (levelData.IS_ACTIVE !== false && levelData.IS_ACTIVE !== 'N' ? 'Y' : 'N')
            : (structureLevel.IS_ACTIVE === 'Y' ? 'Y' : 'N');
        } else {
          // Use provided values directly
          levelCode = levelData.LEVEL_CODE || null;
          levelName = levelData.LEVEL_NAME;
          isMandatory = levelData.IS_MANDATORY === true || levelData.IS_MANDATORY === 'Y' ? 'Y' : 'N';
          isActive = levelData.IS_ACTIVE !== false && levelData.IS_ACTIVE !== 'N' ? 'Y' : 'N';
        }

        const insertQuery = `INSERT INTO ${this.TABLE_NAME} (
          LEVEL_ID,
          STRUCTURE_ID,
          LEVEL_NUMBER,
          LEVEL_CODE,
          LEVEL_NAME,
          IS_MANDATORY,
          IS_ACTIVE,
          DISPLAY_ORDER,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATED_DATE,
          LAST_UPDATE_LOGIN
        ) VALUES (
          :1, :2, :3, :4, :5, :6, :7, :8, :9, :10, :11, :12, :13
        )`;

        const bindParams = [
          levelId,
          structureId,
          levelData.LEVEL_NUMBER,
          levelCode,
          levelName,
          isMandatory,
          isActive,
          levelData.DISPLAY_ORDER || levelData.LEVEL_NUMBER,
          userId || 'SYSTEM',
          now,
          userId || 'SYSTEM',
          now,
          levelData.LAST_UPDATE_LOGIN || null
        ];

        await connection.execute(insertQuery, bindParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        createdLevels.push({
          LEVEL_ID: levelId,
          STRUCTURE_ID: structureId,
          LEVEL_NUMBER: levelData.LEVEL_NUMBER,
          LEVEL_CODE: levelCode,
          LEVEL_NAME: levelName,
          IS_MANDATORY: isMandatory,
          IS_ACTIVE: isActive,
          DISPLAY_ORDER: levelData.DISPLAY_ORDER || levelData.LEVEL_NUMBER
        });
      }

      // Fetch all created levels to return complete data
      const selectQuery = `SELECT * FROM ${this.TABLE_NAME} WHERE STRUCTURE_ID = :1 ORDER BY LEVEL_NUMBER`;
      const selectResult = await connection.execute(selectQuery, [structureId], {
        outFormat: oracledb.OUT_FORMAT_OBJECT
      });

      return this.convertKeysToSnakeCase(selectResult.rows || []);
    } catch (error) {
      console.error('Error in createBulk:', error);
      if (error.code === 'NOT_FOUND' || error.code === 'VALIDATION_ERROR') {
        throw error;
      }
      throw new Error(`Failed to create hierarchy levels: ${error.message}`);
    }
  }

  /**
   * Fetch levels for a single structure
   * @param {Object} connection - Database connection (optional, for transaction)
   * @param {number} structureId - Structure ID
   * @returns {Promise<Array>} Array of hierarchy levels
   */
  static async fetchLevelsForStructure(connection, structureId) {
    try {
      const query = `SELECT 
        LEVEL_ID,
        STRUCTURE_ID,
        LEVEL_NUMBER,
        LEVEL_CODE,
        LEVEL_NAME,
        IS_MANDATORY,
        IS_ACTIVE,
        DISPLAY_ORDER,
        CREATED_BY,
        CREATED_DATE,
        LAST_UPDATED_BY,
        LAST_UPDATED_DATE,
        LAST_UPDATE_LOGIN
      FROM ${this.TABLE_NAME}
      WHERE STRUCTURE_ID = :1
      ORDER BY LEVEL_NUMBER, DISPLAY_ORDER`;

      let result;
      if (connection) {
        // Use provided connection (for transaction)
        result = await connection.execute(query, [structureId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
      } else {
        // Use executeQuery (creates own connection)
        result = await this.executeQuery(query, [structureId]);
      }

      return this.convertKeysToSnakeCase(result.rows || []);
    } catch (error) {
      console.error('Error in fetchLevelsForStructure:', error);
      throw new Error(`Failed to fetch hierarchy levels: ${error.message}`);
    }
  }

  /**
   * Fetch levels for multiple structures (batch fetch)
   * @param {Array} structureIds - Array of structure IDs
   * @returns {Promise<Object>} Object with structureId as key and levels array as value
   */
  static async fetchLevelsForStructures(structureIds) {
    try {
      if (!Array.isArray(structureIds) || structureIds.length === 0) {
        return {};
      }

      const placeholders = structureIds.map((_, i) => `:${i + 1}`).join(',');
      const query = `SELECT 
        LEVEL_ID,
        STRUCTURE_ID,
        LEVEL_NUMBER,
        LEVEL_CODE,
        LEVEL_NAME,
        IS_MANDATORY,
        IS_ACTIVE,
        DISPLAY_ORDER,
        CREATED_BY,
        CREATED_DATE,
        LAST_UPDATED_BY,
        LAST_UPDATED_DATE,
        LAST_UPDATE_LOGIN
      FROM ${this.TABLE_NAME}
      WHERE STRUCTURE_ID IN (${placeholders})
      ORDER BY STRUCTURE_ID, LEVEL_NUMBER, DISPLAY_ORDER`;

      const result = await this.executeQuery(query, structureIds);
      const levels = this.convertKeysToSnakeCase(result.rows || []);

      // Group levels by STRUCTURE_ID
      const levelsByStructure = {};
      for (const level of levels) {
        const structureId = level.structure_id;
        if (!levelsByStructure[structureId]) {
          levelsByStructure[structureId] = [];
        }
        levelsByStructure[structureId].push(level);
      }

      return levelsByStructure;
    } catch (error) {
      console.error('Error in fetchLevelsForStructures:', error);
      throw new Error(`Failed to fetch hierarchy levels: ${error.message}`);
    }
  }

  /**
   * Update an existing hierarchy level
   * @param {number} levelId - Level ID
   * @param {Object} data - Updated data
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<Object>} Updated hierarchy level
   */
  static async update(levelId, data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        const updateFields = [];
        const bindParams = [];
        let paramIndex = 1;

        // Build dynamic update query
        if (data.STRUCTURE_ID !== undefined) {
          updateFields.push(`STRUCTURE_ID = :${paramIndex}`);
          bindParams.push(data.STRUCTURE_ID);
          paramIndex++;
        }
        if (data.LEVEL_NUMBER !== undefined) {
          updateFields.push(`LEVEL_NUMBER = :${paramIndex}`);
          bindParams.push(data.LEVEL_NUMBER);
          paramIndex++;
        }
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
        if (data.DISPLAY_ORDER !== undefined) {
          updateFields.push(`DISPLAY_ORDER = :${paramIndex}`);
          bindParams.push(data.DISPLAY_ORDER);
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
        
        return selectResult.rows[0];
      });
    } catch (error) {
      console.error('Error in update:', error);
      throw new Error(`Failed to update hierarchy level: ${error.message}`);
    }
  }

  /**
   * Delete a hierarchy level (soft delete by setting IS_ACTIVE = 'N')
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
        // Oracle returns rowsAffected or rowCount
        const rowsAffected = updateResult.rowsAffected || updateResult.rowCount || 0;
        if (rowsAffected === 0) {
          throw new Error(`No hierarchy level found with ID: ${levelId}`);
        }
        
        return { ...updateResult, rowsAffected };
      });
      
      console.log(`Soft delete successful for level ID: ${levelId}, rows affected: ${result.rowsAffected}`);
      return true;
    } catch (error) {
      console.error('Error in softDelete:', error);
      throw new Error(`Failed to delete hierarchy level: ${error.message}`);
    }
  }

  /**
   * Get referencing records for a hierarchy level
   * @param {number} levelId - Level ID
   * @returns {Promise<Object>} Information about referencing records
   */
  static async getReferencingRecords(levelId) {
    try {
      const references = {};
      
      // Check HR_ORG_UNIT table (based on constraint name FK_ENT_HR_ORG_UNIT_LEVEL)
      try {
        const unitQuery = `SELECT COUNT(*) AS count FROM ENT.HR_ORG_UNIT WHERE LEVEL_ID = :1`;
        const unitResult = await this.executeQuery(unitQuery, [levelId]);
        if (unitResult.rows && unitResult.rows.length > 0) {
          const count = unitResult.rows[0].count || 0;
          if (count > 0) {
            references.hr_org_unit = {
              table: 'ENT.HR_ORG_UNIT',
              count: count,
              constraint: 'FK_ENT_HR_ORG_UNIT_LEVEL',
              description: 'Organization units are using this hierarchy level'
            };
          }
        }
      } catch (err) {
        // Table might not exist or no access, skip
        console.warn('Could not check HR_ORG_UNIT references:', err.message);
      }
      
      return references;
    } catch (error) {
      console.error('Error getting referencing records:', error);
      return {};
    }
  }

  /**
   * Hard delete a hierarchy level (permanent removal)
   * @param {number} levelId - Level ID
   * @returns {Promise<Object>} Success status and reference info if constraint violation
   */
  static async hardDelete(levelId) {
    try {
      const result = await this.executeWithTransaction(async (connection) => {
        const query = `DELETE FROM ${this.TABLE_NAME} WHERE LEVEL_ID = :1`;
        const deleteResult = await connection.execute(query, [levelId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        // Verify that the delete affected at least one row
        // Oracle returns rowsAffected or rowCount
        const rowsAffected = deleteResult.rowsAffected || deleteResult.rowCount || 0;
        if (rowsAffected === 0) {
          throw new Error(`No hierarchy level found with ID: ${levelId}`);
        }
        
        return { ...deleteResult, rowsAffected };
      });
      
      console.log(`Hard delete successful for level ID: ${levelId}, rows affected: ${result.rowsAffected}`);
      return { success: true };
    } catch (error) {
      console.error('Error in hardDelete:', error);
      
      // Handle foreign key constraint violation
      if (error.errorNum === 2292 || error.message?.includes('ORA-02292') || error.message?.includes('integrity constraint')) {
        // Get information about what's referencing this level
        const references = await this.getReferencingRecords(levelId);
        
        const constraintName = error.message?.match(/\(([^)]+)\)/)?.[1] || 'UNKNOWN';
        const constraintError = new Error(`Cannot delete hierarchy level: This level is referenced by other records in the database.`);
        constraintError.errorNum = 2292;
        constraintError.code = 'FOREIGN_KEY_CONSTRAINT';
        constraintError.constraint = constraintName;
        constraintError.references = references;
        constraintError.suggestion = 'Use soft delete (?soft=true) to deactivate this level instead of permanently deleting it.';
        throw constraintError;
      }
      
      throw new Error(`Failed to delete hierarchy level: ${error.message}`);
    }
  }

  /**
   * Validate that a structure belongs to an enterprise
   * @param {number} enterpriseId - Enterprise ID
   * @param {number} structureId - Structure ID
   * @returns {Promise<boolean>} True if structure belongs to enterprise
   */
  static async validateStructureOwnership(enterpriseId, structureId) {
    try {
      const query = `SELECT COUNT(*) AS count 
        FROM ENT.HR_ORG_STRUCTURES 
        WHERE STRUCTURE_ID = :1 AND ENTERPRISE_ID = :2`;
      
      const result = await this.executeQuery(query, [structureId, enterpriseId]);
      const count = result.rows?.[0]?.count || 0;
      return count > 0;
    } catch (error) {
      console.error('Error validating structure ownership:', error);
      throw new Error(`Failed to validate structure ownership: ${error.message}`);
    }
  }

  /**
   * Get hierarchy levels by enterprise and structure (enterprise-safe)
   * @param {number} enterpriseId - Enterprise ID
   * @param {number} structureId - Structure ID
   * @returns {Promise<Array>} Array of hierarchy levels sorted by LEVEL_NUMBER
   */
  static async findByEnterpriseAndStructure(enterpriseId, structureId) {
    try {
      // First validate that structure belongs to enterprise
      const isValid = await this.validateStructureOwnership(enterpriseId, structureId);
      if (!isValid) {
        const notFoundError = new Error(`Structure ${structureId} not found for enterprise ${enterpriseId}`);
        notFoundError.code = 'NOT_FOUND';
        notFoundError.statusCode = 404;
        throw notFoundError;
      }

      const query = `SELECT 
        h.LEVEL_ID,
        h.STRUCTURE_ID,
        h.LEVEL_NUMBER,
        h.LEVEL_CODE,
        h.LEVEL_NAME,
        h.IS_MANDATORY,
        h.IS_ACTIVE,
        h.DISPLAY_ORDER,
        h.CREATED_BY,
        h.CREATED_DATE,
        h.LAST_UPDATED_BY,
        h.LAST_UPDATED_DATE,
        h.LAST_UPDATE_LOGIN
      FROM ${this.TABLE_NAME} h
      INNER JOIN ENT.HR_ORG_STRUCTURES s ON h.STRUCTURE_ID = s.STRUCTURE_ID
      WHERE s.ENTERPRISE_ID = :1 AND h.STRUCTURE_ID = :2
      ORDER BY h.LEVEL_NUMBER`;

      const result = await this.executeQuery(query, [enterpriseId, structureId]);
      return result.rows || [];
    } catch (error) {
      console.error('Error in findByEnterpriseAndStructure:', error);
      if (error.code === 'NOT_FOUND') {
        throw error;
      }
      throw new Error(`Failed to fetch hierarchy levels: ${error.message}`);
    }
  }

  /**
   * Reorder hierarchy levels (enterprise-safe)
   * @param {number} enterpriseId - Enterprise ID
   * @param {number} structureId - Structure ID
   * @param {Array} levels - Array of { level_id, order } objects
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<Array>} Updated hierarchy levels sorted by LEVEL_NUMBER
   */
  static async reorderLevels(enterpriseId, structureId, levels, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        // Validate structure ownership
        const isValid = await this.validateStructureOwnership(enterpriseId, structureId);
        if (!isValid) {
          const notFoundError = new Error(`Structure ${structureId} not found for enterprise ${enterpriseId}`);
          notFoundError.code = 'NOT_FOUND';
          notFoundError.statusCode = 404;
          throw notFoundError;
        }

        // Validate payload
        if (!Array.isArray(levels) || levels.length === 0) {
          const validationError = new Error('levels array is required and must not be empty');
          validationError.code = 'VALIDATION_ERROR';
          validationError.statusCode = 400;
          throw validationError;
        }

        // Extract level IDs and orders
        const levelIds = levels.map(l => l.level_id || l.LEVEL_ID);
        const orders = levels.map(l => l.order !== undefined ? l.order : (l.ORDER !== undefined ? l.ORDER : null));

        // Validate: order values must be unique and continuous 1..N
        const sortedOrders = [...orders].sort((a, b) => a - b);
        const expectedOrders = Array.from({ length: orders.length }, (_, i) => i + 1);
        const isContinuous = JSON.stringify(sortedOrders) === JSON.stringify(expectedOrders);
        
        if (!isContinuous) {
          const validationError = new Error('Order values must be unique and continuous starting from 1');
          validationError.code = 'VALIDATION_ERROR';
          validationError.statusCode = 400;
          throw validationError;
        }

        // Validate: all level_ids must belong to the provided structure_id
        const placeholders = levelIds.map((_, i) => `:${i + 2}`).join(',');
        const validateQuery = `SELECT LEVEL_ID, IS_MANDATORY, IS_ACTIVE
          FROM ${this.TABLE_NAME}
          WHERE STRUCTURE_ID = :1 AND LEVEL_ID IN (${placeholders})`;
        
        const validateBinds = [structureId, ...levelIds];
        const validateResult = await connection.execute(validateQuery, validateBinds, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        const foundLevelIds = (validateResult.rows || []).map(row => row.LEVEL_ID);
        if (foundLevelIds.length !== levelIds.length) {
          const missingIds = levelIds.filter(id => !foundLevelIds.includes(id));
          const validationError = new Error(`Some level_ids do not belong to structure ${structureId}: ${missingIds.join(', ')}`);
          validationError.code = 'VALIDATION_ERROR';
          validationError.statusCode = 400;
          throw validationError;
        }

        // Validate: mandatory levels (IS_MANDATORY='Y') must remain present and active (IS_ACTIVE='Y')
        const mandatoryLevels = (validateResult.rows || []).filter(row => row.IS_MANDATORY === 'Y');
        
        // Check that all mandatory levels are present in the reorder array
        const mandatoryLevelIds = mandatoryLevels.map(l => l.LEVEL_ID);
        const missingMandatory = mandatoryLevelIds.filter(id => !levelIds.includes(id));
        if (missingMandatory.length > 0) {
          const validationError = new Error(`Mandatory levels must remain present: ${missingMandatory.join(', ')}`);
          validationError.code = 'VALIDATION_ERROR';
          validationError.statusCode = 400;
          throw validationError;
        }
        
        // Check that all mandatory levels are active
        const inactiveMandatory = mandatoryLevels.filter(row => row.IS_ACTIVE !== 'Y');
        if (inactiveMandatory.length > 0) {
          const validationError = new Error(`Mandatory levels must remain active: ${inactiveMandatory.map(l => l.LEVEL_ID).join(', ')}`);
          validationError.code = 'VALIDATION_ERROR';
          validationError.statusCode = 400;
          throw validationError;
        }

        // Perform updates: set LEVEL_NUMBER and DISPLAY_ORDER to the new order value
        // Use two-phase update to avoid unique constraint violations:
        // Phase 1: Set all to temporary negative values to free up target values
        // Phase 2: Set all to final order values
        const now = new Date();
        
        // Phase 1: Set all levels to temporary negative values
        // This frees up the target LEVEL_NUMBER values so we can reassign them
        for (let i = 0; i < levels.length; i++) {
          const levelId = levelIds[i];
          const tempValue = -(i + 1); // Use negative values as temporary (e.g., -1, -2, -3...)

          const tempUpdateQuery = `UPDATE ${this.TABLE_NAME}
            SET LEVEL_NUMBER = :1,
                DISPLAY_ORDER = :2,
                LAST_UPDATED_BY = :3,
                LAST_UPDATED_DATE = :4
            WHERE LEVEL_ID = :5 AND STRUCTURE_ID = :6`;

          await connection.execute(tempUpdateQuery, [
            tempValue,
            tempValue,
            userId || 'SYSTEM',
            now,
            levelId,
            structureId
          ], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
        }

        // Phase 2: Set all levels to their final order values
        // Now all target values are free, so we can safely assign the final order
        for (let i = 0; i < levels.length; i++) {
          const levelId = levelIds[i];
          const newOrder = orders[i];

          const finalUpdateQuery = `UPDATE ${this.TABLE_NAME}
            SET LEVEL_NUMBER = :1,
                DISPLAY_ORDER = :2,
                LAST_UPDATED_BY = :3,
                LAST_UPDATED_DATE = :4
            WHERE LEVEL_ID = :5 AND STRUCTURE_ID = :6`;

          await connection.execute(finalUpdateQuery, [
            newOrder,
            newOrder, // DISPLAY_ORDER = LEVEL_NUMBER
            userId || 'SYSTEM',
            now,
            levelId,
            structureId
          ], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
        }

        // Fetch and return updated levels sorted by LEVEL_NUMBER
        const selectQuery = `SELECT 
          LEVEL_ID,
          STRUCTURE_ID,
          LEVEL_NUMBER,
          LEVEL_CODE,
          LEVEL_NAME,
          IS_MANDATORY,
          IS_ACTIVE,
          DISPLAY_ORDER,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATED_DATE,
          LAST_UPDATE_LOGIN
        FROM ${this.TABLE_NAME}
        WHERE STRUCTURE_ID = :1
        ORDER BY LEVEL_NUMBER`;

        const selectResult = await connection.execute(selectQuery, [structureId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        // Convert keys to snake_case
        return this.convertKeysToSnakeCase(selectResult.rows || []);
      });
    } catch (error) {
      console.error('Error in reorderLevels:', error);
      if (error.code === 'NOT_FOUND' || error.code === 'VALIDATION_ERROR') {
        throw error;
      }
      throw new Error(`Failed to reorder hierarchy levels: ${error.message}`);
    }
  }

  /**
   * Onboard enterprise with hierarchy structure and levels (all in one transaction)
   * @param {Object} data - Onboarding data
   * @param {string} userId - User ID for audit fields
   * @param {string} loginId - Login ID for audit fields
   * @returns {Promise<Object>} Created enterprise, structure, and levels
   */
  static async onboardEnterpriseHierarchy(data, userId, loginId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        const { structure, hr_organization_structure_id, levels } = data;

        // Normalize enterprise_code
        const enterpriseCode = structure.enterprise_code ? 
          String(structure.enterprise_code).trim().toUpperCase() : null;
        const enterpriseName = structure.enterprise_name || null;
        const enterpriseIsActive = structure.is_active === 'N' ? 'N' : 'Y';

        // Validate input
        if (!enterpriseCode || !enterpriseName) {
          const validationError = new Error('structure.enterprise_code and structure.enterprise_name are required');
          validationError.code = 'VALIDATION_ERROR';
          validationError.statusCode = 400;
          throw validationError;
        }

        if (!hr_organization_structure_id || (hr_organization_structure_id !== 1 && hr_organization_structure_id !== 2)) {
          const validationError = new Error('hr_organization_structure_id is required and must be 1 (ENTERPRISE) or 2 (WORKFORCE)');
          validationError.code = 'VALIDATION_ERROR';
          validationError.statusCode = 400;
          throw validationError;
        }

        if (!Array.isArray(levels) || levels.length === 0) {
          const validationError = new Error('levels must be a non-empty array');
          validationError.code = 'VALIDATION_ERROR';
          validationError.statusCode = 400;
          throw validationError;
        }

        // Validate levels and check for duplicate level_codes (case-insensitive)
        const levelCodes = new Set();
        for (let i = 0; i < levels.length; i++) {
          const level = levels[i];
          if (!level.level_code || !level.level_name) {
            const validationError = new Error(`levels[${i}]: level_code and level_name are required`);
            validationError.code = 'VALIDATION_ERROR';
            validationError.statusCode = 400;
            throw validationError;
          }
          
          const normalizedCode = String(level.level_code).trim().toUpperCase();
          if (levelCodes.has(normalizedCode)) {
            const validationError = new Error(`levels[${i}]: level_code '${level.level_code}' is duplicate (case-insensitive)`);
            validationError.code = 'VALIDATION_ERROR';
            validationError.statusCode = 400;
            throw validationError;
          }
          levelCodes.add(normalizedCode);
        }

        // Validate structure_type mapping
        const structureTypeMap = {
          1: 'ENTERPRISE',
          2: 'WORKFORCE'
        };
        const structureType = structureTypeMap[hr_organization_structure_id];

        // Check if enterprise_code already exists
        const checkEnterpriseQuery = `SELECT COUNT(*) AS count 
          FROM ENT.ENTERPRISES 
          WHERE UPPER(TRIM(ENTERPRISE_CODE)) = :1`;
        const checkResult = await connection.execute(checkEnterpriseQuery, [enterpriseCode], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        if (checkResult.rows[0].COUNT > 0) {
          const conflictError = new Error(`Enterprise with code '${enterpriseCode}' already exists`);
          conflictError.code = 'CONFLICT';
          conflictError.statusCode = 409;
          throw conflictError;
        }

        // Get enterprise ID from sequence or max+1
        let enterpriseId;
        try {
          const seqQuery = `SELECT ENT.ENTERPRISES_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`;
          const seqResult = await connection.execute(seqQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          enterpriseId = seqResult.rows[0].NEXT_ID;
        } catch (seqError) {
          // If sequence doesn't exist, get max ID and increment
          const maxQuery = `SELECT NVL(MAX(ENTERPRISE_ID), 0) + 1 AS NEXT_ID FROM ENT.ENTERPRISES`;
          const maxResult = await connection.execute(maxQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          enterpriseId = maxResult.rows[0].NEXT_ID;
        }

        // Create enterprise
        const insertEnterpriseQuery = `INSERT INTO ENT.ENTERPRISES (
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
          :1, :2, :3, :4, :5, SYSTIMESTAMP, :6, SYSTIMESTAMP, :7
        )`;

        await connection.execute(insertEnterpriseQuery, [
          enterpriseId,
          enterpriseCode,
          enterpriseName,
          enterpriseIsActive,
          userId || 'SYSTEM',
          userId || 'SYSTEM',
          loginId || 'API'
        ], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        // Create structure
        const structureCode = `${enterpriseCode}_${structureType}`;
        const structureName = `${enterpriseName} ${structureType} Structure`;

        // Get structure ID from sequence or max+1
        let structureId;
        try {
          const seqQuery = `SELECT ENT.HR_ORG_STRUCTURES_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`;
          const seqResult = await connection.execute(seqQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          structureId = seqResult.rows[0].NEXT_ID;
        } catch (seqError) {
          // If sequence doesn't exist, get max ID and increment
          const maxQuery = `SELECT NVL(MAX(STRUCTURE_ID), 0) + 1 AS NEXT_ID FROM ENT.HR_ORG_STRUCTURES`;
          const maxResult = await connection.execute(maxQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          structureId = maxResult.rows[0].NEXT_ID;
        }

        // Create structure
        const insertStructureQuery = `INSERT INTO ENT.HR_ORG_STRUCTURES (
          STRUCTURE_ID,
          ENTERPRISE_ID,
          STRUCTURE_CODE,
          STRUCTURE_NAME,
          STRUCTURE_TYPE,
          IS_ACTIVE,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATED_DATE,
          LAST_UPDATE_LOGIN
        ) VALUES (
          :1, :2, :3, :4, :5, 'Y', :6, SYSTIMESTAMP, :7, SYSTIMESTAMP, :8
        )`;

        await connection.execute(insertStructureQuery, [
          structureId,
          enterpriseId,
          structureCode,
          structureName,
          structureType,
          userId || 'SYSTEM',
          userId || 'SYSTEM',
          loginId || 'API'
        ], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        // Delete existing levels for this structure (should be none for new structure, but do it anyway)
        const deleteLevelsQuery = `DELETE FROM ${this.TABLE_NAME} WHERE STRUCTURE_ID = :1`;
        await connection.execute(deleteLevelsQuery, [structureId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        // Insert levels
        const levelIds = [];
        for (let i = 0; i < levels.length; i++) {
          const level = levels[i];
          const levelCode = level.level_code ? String(level.level_code).trim().toUpperCase() : null;
          const levelName = level.level_name || null;
          const isMandatory = level.is_mandatory === 'Y' ? 'Y' : 'N';
          const isActive = level.is_active === 'N' ? 'N' : 'Y';
          const levelNumber = i + 1;
          const displayOrder = i + 1;

          // Validate: mandatory levels must be active
          if (isMandatory === 'Y' && isActive !== 'Y') {
            const validationError = new Error(`Mandatory level '${levelCode}' must be active`);
            validationError.code = 'VALIDATION_ERROR';
            validationError.statusCode = 400;
            throw validationError;
          }

          // Get next LEVEL_ID from sequence
          let levelId;
          try {
            const seqQuery = `SELECT ENT.HR_ORG_HIERARCHY_LEVELS_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`;
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

          const insertLevelQuery = `INSERT INTO ${this.TABLE_NAME} (
            LEVEL_ID,
            STRUCTURE_ID,
            LEVEL_NUMBER,
            LEVEL_CODE,
            LEVEL_NAME,
            IS_MANDATORY,
            IS_ACTIVE,
            DISPLAY_ORDER,
            CREATED_BY,
            CREATED_DATE,
            LAST_UPDATED_BY,
            LAST_UPDATED_DATE,
            LAST_UPDATE_LOGIN
          ) VALUES (
            :1, :2, :3, :4, :5, :6, :7, :8, :9, SYSTIMESTAMP, :10, SYSTIMESTAMP, :11
          )`;

          await connection.execute(insertLevelQuery, [
            levelId,
            structureId,
            levelNumber,
            levelCode,
            levelName,
            isMandatory,
            isActive,
            displayOrder,
            userId || 'SYSTEM',
            userId || 'SYSTEM',
            loginId || 'API'
          ], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });

          levelIds.push(levelId);
        }

        // Fetch created enterprise
        const enterpriseQuery = `SELECT 
          ENTERPRISE_ID,
          ENTERPRISE_CODE,
          ENTERPRISE_NAME,
          IS_ACTIVE,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATED_DATE,
          LAST_UPDATE_LOGIN
        FROM ENT.ENTERPRISES
        WHERE ENTERPRISE_ID = :1`;
        const enterpriseResult = await connection.execute(enterpriseQuery, [enterpriseId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        // Fetch created structure
        const structureQuery = `SELECT 
          STRUCTURE_ID,
          ENTERPRISE_ID,
          STRUCTURE_CODE,
          STRUCTURE_NAME,
          STRUCTURE_TYPE,
          IS_ACTIVE,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATED_DATE,
          LAST_UPDATE_LOGIN
        FROM ENT.HR_ORG_STRUCTURES
        WHERE STRUCTURE_ID = :1`;
        const structureResult = await connection.execute(structureQuery, [structureId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        // Fetch created levels
        const levelsQuery = `SELECT 
          LEVEL_ID,
          STRUCTURE_ID,
          LEVEL_NUMBER,
          LEVEL_CODE,
          LEVEL_NAME,
          IS_MANDATORY,
          IS_ACTIVE,
          DISPLAY_ORDER,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATED_DATE,
          LAST_UPDATE_LOGIN
        FROM ${this.TABLE_NAME}
        WHERE STRUCTURE_ID = :1
        ORDER BY LEVEL_NUMBER`;
        const levelsResult = await connection.execute(levelsQuery, [structureId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        return {
          enterprise: this.convertKeysToSnakeCase(enterpriseResult.rows[0]),
          org_structure: this.convertKeysToSnakeCase(structureResult.rows[0]),
          levels: this.convertKeysToSnakeCase(levelsResult.rows || [])
        };
      });
    } catch (error) {
      console.error('Error in onboardEnterpriseHierarchy:', error);
      if (error.code === 'CONFLICT' || error.code === 'VALIDATION_ERROR') {
        throw error;
      }
      throw new Error(`Failed to onboard enterprise hierarchy: ${error.message}`);
    }
  }
}

export default HrOrgHierarchyLevelModel;

