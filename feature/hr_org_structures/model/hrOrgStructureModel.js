import db from '../../../config/db.js';
import oracledb from 'oracledb';
import HrOrgHierarchyLevelModel from '../../hr_org_hierarchy_levels/model/hrOrgHierarchyLevelModel.js';

/**
 * HR Organization Structure Model
 * Handles all database operations for ENT.HR_ORG_STRUCTURES table
 */
class HrOrgStructureModel {
  static TABLE_NAME = 'ENT.HR_ORG_STRUCTURES';

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
   * Get all organization structures
   * @param {Object} filters - Optional filters (structureId, enterpriseId, isActive, structureType, pagination)
   * @param {Object} filters.pagination - Pagination options {page, pageSize}
   * @returns {Promise<Object|Array>} Object with {structures, total} if paginated, or Array of structures
   */
  static async findAll(filters = {}) {
    try {
      // Build base query for counting total records
      let countQuery = `SELECT COUNT(*) AS total FROM ${this.TABLE_NAME} s`;
      let dataQuery = `SELECT 
        s.STRUCTURE_ID,
        s.ENTERPRISE_ID,
        e.ENTERPRISE_NAME,
        s.STRUCTURE_CODE,
        s.STRUCTURE_NAME,
        s.STRUCTURE_TYPE,
        s.DESCRIPTION,
        s.IS_ACTIVE,
        s.CREATED_BY,
        s.CREATED_DATE,
        s.LAST_UPDATED_BY,
        s.LAST_UPDATED_DATE,
        s.LAST_UPDATE_LOGIN
      FROM ${this.TABLE_NAME} s
      LEFT JOIN ENT.ENTERPRISES e ON s.ENTERPRISE_ID = e.ENTERPRISE_ID`;

      const conditions = [];
      const bindParams = [];
      let paramIndex = 1;

      if (filters.structureId) {
        conditions.push(`s.STRUCTURE_ID = :${paramIndex}`);
        bindParams.push(filters.structureId);
        paramIndex++;
      }

      if (filters.enterpriseId) {
        conditions.push(`s.ENTERPRISE_ID = :${paramIndex}`);
        bindParams.push(filters.enterpriseId);
        paramIndex++;
      }

      if (filters.isActive !== undefined) {
        conditions.push(`s.IS_ACTIVE = :${paramIndex}`);
        bindParams.push(filters.isActive ? 'Y' : 'N');
        paramIndex++;
      }

      if (filters.structureType) {
        conditions.push(`s.STRUCTURE_TYPE = :${paramIndex}`);
        bindParams.push(filters.structureType);
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

      // Add WHERE clause to both queries
      countQuery += whereClause;
      dataQuery += whereClause;

      dataQuery += ` ORDER BY s.CREATED_DATE DESC, s.STRUCTURE_ID DESC`;

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
      const structures = result.rows || [];

      // Fetch levels for all structures
      if (structures.length > 0) {
        // Extract structure IDs (keys are already converted to lowercase)
        const structureIds = structures.map(s => s.structure_id);
        const levelsByStructure = await HrOrgHierarchyLevelModel.fetchLevelsForStructures(structureIds);

        // Attach levels to each structure
        const structuresWithLevels = structures.map(structure => {
          const structureId = structure.structure_id;
          return {
            ...structure,
            levels: levelsByStructure[structureId] || []
          };
        });

        // Return paginated result with total count
        if (pagination && pagination.page && pagination.pageSize) {
          return {
            structures: structuresWithLevels,
            total: totalCount
          };
        }

        return structuresWithLevels;
      }

      // Return paginated result even if empty
      if (pagination && pagination.page && pagination.pageSize) {
        return {
          structures: [],
          total: totalCount
        };
      }

      return structures;
    } catch (error) {
      console.error('Error in findAll:', error);
      throw new Error(`Failed to fetch organization structures: ${error.message}`);
    }
  }

  /**
   * Deactivate all other organization structures when one is activated
   * Only one structure can be active at a time
   * @param {Object} connection - Database connection (for transaction support)
   * @param {number} excludeStructureId - Structure ID to exclude from deactivation
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<number>} Number of structures deactivated
   */
  static async deactivateOtherStructures(connection, excludeStructureId, userId) {
    try {
      const deactivateQuery = `UPDATE ${this.TABLE_NAME} 
        SET IS_ACTIVE = 'N',
            LAST_UPDATED_BY = :1,
            LAST_UPDATED_DATE = :2
        WHERE IS_ACTIVE = 'Y' 
          AND STRUCTURE_ID != :3`;

      const now = new Date();
      const result = await connection.execute(
        deactivateQuery,
        [userId || 'SYSTEM', now, excludeStructureId],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const rowsAffected = result.rowsAffected || result.rowCount || 0;
      if (rowsAffected > 0) {
        console.log(`Deactivated ${rowsAffected} other organization structure(s) when activating structure ID: ${excludeStructureId}`);
      }
      
      return rowsAffected;
    } catch (error) {
      console.error('Error deactivating other structures:', error);
      throw new Error(`Failed to deactivate other structures: ${error.message}`);
    }
  }

  /**
   * Get a single organization structure by ID
   * @param {number} structureId - Structure ID
   * @returns {Promise<Object|null>} Organization structure object or null
   */
  static async findById(structureId) {
    try {
      const query = `SELECT 
        s.STRUCTURE_ID,
        s.ENTERPRISE_ID,
        e.ENTERPRISE_NAME,
        s.STRUCTURE_CODE,
        s.STRUCTURE_NAME,
        s.STRUCTURE_TYPE,
        s.DESCRIPTION,
        s.IS_ACTIVE,
        s.CREATED_BY,
        s.CREATED_DATE,
        s.LAST_UPDATED_BY,
        s.LAST_UPDATED_DATE,
        s.LAST_UPDATE_LOGIN
      FROM ${this.TABLE_NAME} s
      LEFT JOIN ENT.ENTERPRISES e ON s.ENTERPRISE_ID = e.ENTERPRISE_ID
      WHERE s.STRUCTURE_ID = :1`;

      const result = await this.executeQuery(query, [structureId]);
      
      if (result.rows && result.rows.length > 0) {
        const structure = result.rows[0];
        
        // Fetch associated levels
        const levels = await HrOrgHierarchyLevelModel.fetchLevelsForStructure(null, structureId);
        
        return {
          ...structure,
          levels: levels
        };
      }
      return null;
    } catch (error) {
      console.error('Error in findById:', error);
      throw new Error(`Failed to fetch organization structure: ${error.message}`);
    }
  }

  /**
   * Get the active organization structure
   * @returns {Promise<Object|null>} Active organization structure or null
   */
  static async findActive() {
    try {
      const query = `SELECT 
        s.STRUCTURE_ID,
        s.ENTERPRISE_ID,
        e.ENTERPRISE_NAME,
        s.STRUCTURE_CODE,
        s.STRUCTURE_NAME,
        s.STRUCTURE_TYPE,
        s.DESCRIPTION,
        s.IS_ACTIVE,
        s.CREATED_BY,
        s.CREATED_DATE,
        s.LAST_UPDATED_BY,
        s.LAST_UPDATED_DATE,
        s.LAST_UPDATE_LOGIN
      FROM ${this.TABLE_NAME} s
      LEFT JOIN ENT.ENTERPRISES e ON s.ENTERPRISE_ID = e.ENTERPRISE_ID
      WHERE s.IS_ACTIVE = 'Y'
      ORDER BY s.CREATED_DATE DESC
      FETCH FIRST 1 ROWS ONLY`;

      const result = await this.executeQuery(query, []);
      
      if (result.rows && result.rows.length > 0) {
        return result.rows[0];
      }
      return null;
    } catch (error) {
      console.error('Error in findActive:', error);
      throw new Error(`Failed to fetch active organization structure: ${error.message}`);
    }
  }

  /**
   * Get levels for the active organization structure
   * @returns {Promise<Object|null>} Object with structure info and levels array, or null if no active structure
   */
  static async getActiveStructureLevels() {
    try {
      const activeStructure = await this.findActive();
      
      if (!activeStructure) {
        return null;
      }

      // Fetch associated levels
      const levels = await HrOrgHierarchyLevelModel.findAll({
        structureId: activeStructure.structure_id || activeStructure.STRUCTURE_ID,
        isActive: true // Only get active levels
      });

      return {
        ...activeStructure,
        levels: levels
      };
    } catch (error) {
      console.error('Error in getActiveStructureLevels:', error);
      throw new Error(`Failed to fetch active structure levels: ${error.message}`);
    }
  }

  /**
   * Create a new organization structure
   * @param {Object} data - Organization structure data
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<Object>} Created organization structure
   */
  static async create(data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        // Get next STRUCTURE_ID from sequence (or use MAX+1 if sequence doesn't exist)
        let structureId;
        try {
          const seqQuery = `SELECT ENT.HR_ORG_STRUCTURES_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`;
          const seqResult = await connection.execute(seqQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          structureId = seqResult.rows[0].NEXT_ID;
        } catch (seqError) {
          // If sequence doesn't exist, get max ID and increment
          const maxQuery = `SELECT NVL(MAX(STRUCTURE_ID), 0) + 1 AS NEXT_ID FROM ${this.TABLE_NAME}`;
          const maxResult = await connection.execute(maxQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          structureId = maxResult.rows[0].NEXT_ID;
        }

        const now = new Date();
        const query = `INSERT INTO ${this.TABLE_NAME} (
          STRUCTURE_ID,
          ENTERPRISE_ID,
          STRUCTURE_CODE,
          STRUCTURE_NAME,
          STRUCTURE_TYPE,
          DESCRIPTION,
          IS_ACTIVE,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATED_DATE,
          LAST_UPDATE_LOGIN
        ) VALUES (
          :1, :2, :3, :4, :5, :6, :7, :8, :9, :10, :11, :12
        )`;

        const isActive = data.IS_ACTIVE !== false && data.IS_ACTIVE !== 'N' ? 'Y' : 'N';
        
        const bindParams = [
          structureId,
          data.ENTERPRISE_ID || null,
          data.STRUCTURE_CODE || null,
          data.STRUCTURE_NAME || null,
          data.STRUCTURE_TYPE || null,
          data.DESCRIPTION || null,
          isActive,
          userId || 'SYSTEM',
          now,
          userId || 'SYSTEM',
          now,
          data.LAST_UPDATE_LOGIN || null
        ];

        await connection.execute(query, bindParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        // If this structure is being created as active, deactivate all other structures
        if (isActive === 'Y') {
          await this.deactivateOtherStructures(connection, structureId, userId);
        }

        // Fetch and return the created record with enterprise name
        const selectQuery = `SELECT 
          s.STRUCTURE_ID,
          s.ENTERPRISE_ID,
          e.ENTERPRISE_NAME,
          s.STRUCTURE_CODE,
          s.STRUCTURE_NAME,
          s.STRUCTURE_TYPE,
          s.DESCRIPTION,
          s.IS_ACTIVE,
          s.CREATED_BY,
          s.CREATED_DATE,
          s.LAST_UPDATED_BY,
          s.LAST_UPDATED_DATE,
          s.LAST_UPDATE_LOGIN
        FROM ${this.TABLE_NAME} s
        LEFT JOIN ENT.ENTERPRISES e ON s.ENTERPRISE_ID = e.ENTERPRISE_ID
        WHERE s.STRUCTURE_ID = :1`;
        const selectResult = await connection.execute(selectQuery, [structureId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        const createdStructure = this.convertKeysToSnakeCase(selectResult.rows[0]);

        // If levels array is provided, create them in the same transaction
        let createdLevels = [];
        if (data.levels && Array.isArray(data.levels) && data.levels.length > 0) {
          try {
            createdLevels = await HrOrgHierarchyLevelModel.createBulk(
              connection,
              structureId,
              data.levels,
              userId
            );
          } catch (levelError) {
            // Re-throw level creation errors (transaction will rollback)
            throw levelError;
          }
        }

        // Return structure with levels
        return {
          ...createdStructure,
          levels: createdLevels
        };
      });
    } catch (error) {
      console.error('Error in create:', error);
      
      // Handle Oracle constraint violations
      // Check for ORA-00001 (unique constraint violation)
      const isUniqueConstraint = 
        error.errorNum === 1 || 
        error.code === 1 ||
        error.message?.includes('ORA-00001') || 
        error.message?.includes('unique constraint') ||
        (error.message && /unique constraint/i.test(error.message));
      
      if (isUniqueConstraint) {
        // Extract constraint name - look for pattern like (ENT.UK_ENT_HR_ORG_STRUCT_CODE)
        const constraintMatch = error.message?.match(/\(([A-Z_][A-Z0-9_.]+)\)/);
        const constraintName = constraintMatch ? constraintMatch[1] : 'UNKNOWN';
        
        // Extract column names - look for pattern like "columns (ENTERPRISE_ID, STRUCTURE_CODE)"
        const columnMatch = error.message?.match(/columns?\s*\(([^)]+)\)/i);
        const columns = columnMatch ? columnMatch[1] : 'ENTERPRISE_ID, STRUCTURE_CODE';
        
        // Extract existing values - look for pattern like "row with column values (ENTERPRISE_ID:1, STRUCTURE_CODE:'ENT001_WORKFORCE')"
        const valuesMatch = error.message?.match(/row with column values\s*\(([^)]+)\)/i);
        const existingValues = valuesMatch ? valuesMatch[1] : null;
        
        // Create user-friendly message
        const userMessage = `A structure with the same ${columns} already exists for this enterprise.`;
        
        const constraintError = new Error(userMessage);
        constraintError.errorNum = 1;
        constraintError.code = 'UNIQUE_CONSTRAINT_VIOLATION';
        constraintError.statusCode = 409;
        constraintError.constraint = constraintName;
        constraintError.columns = columns;
        constraintError.existingValues = existingValues;
        constraintError.userMessage = userMessage;
        throw constraintError;
      }
      
      // Handle foreign key constraint violations
      if (error.errorNum === 2291 || error.message?.includes('ORA-02291') || error.message?.includes('integrity constraint') && error.message?.includes('parent key not found')) {
        const constraintError = new Error(`Referenced record does not exist.`);
        constraintError.errorNum = 2291;
        constraintError.code = 'FOREIGN_KEY_CONSTRAINT';
        constraintError.statusCode = 400;
        constraintError.userMessage = 'The referenced enterprise or related record does not exist.';
        throw constraintError;
      }
      
      // Handle not null constraint violations
      if (error.errorNum === 1400 || error.message?.includes('ORA-01400') || error.message?.includes('cannot insert NULL')) {
        const constraintError = new Error(`Required field cannot be null.`);
        constraintError.errorNum = 1400;
        constraintError.code = 'NOT_NULL_CONSTRAINT';
        constraintError.statusCode = 400;
        constraintError.userMessage = 'One or more required fields are missing or null.';
        throw constraintError;
      }
      
      throw new Error(`Failed to create organization structure: ${error.message}`);
    }
  }

  /**
   * Update an existing organization structure
   * @param {number} structureId - Structure ID
   * @param {Object} data - Updated data
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<Object>} Updated organization structure
   */
  static async update(structureId, data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        const updateFields = [];
        const bindParams = [];
        let paramIndex = 1;

        // Build dynamic update query
        if (data.ENTERPRISE_ID !== undefined) {
          updateFields.push(`ENTERPRISE_ID = :${paramIndex}`);
          bindParams.push(data.ENTERPRISE_ID);
          paramIndex++;
        }
        if (data.STRUCTURE_CODE !== undefined) {
          updateFields.push(`STRUCTURE_CODE = :${paramIndex}`);
          bindParams.push(data.STRUCTURE_CODE);
          paramIndex++;
        }
        if (data.STRUCTURE_NAME !== undefined) {
          updateFields.push(`STRUCTURE_NAME = :${paramIndex}`);
          bindParams.push(data.STRUCTURE_NAME);
          paramIndex++;
        }
        if (data.STRUCTURE_TYPE !== undefined) {
          updateFields.push(`STRUCTURE_TYPE = :${paramIndex}`);
          bindParams.push(data.STRUCTURE_TYPE);
          paramIndex++;
        }
        if (data.DESCRIPTION !== undefined) {
          updateFields.push(`DESCRIPTION = :${paramIndex}`);
          bindParams.push(data.DESCRIPTION);
          paramIndex++;
        }
        let isActivating = false;
        if (data.IS_ACTIVE !== undefined) {
          const newIsActive = data.IS_ACTIVE !== false && data.IS_ACTIVE !== 'N' ? 'Y' : 'N';
          isActivating = newIsActive === 'Y';
          updateFields.push(`IS_ACTIVE = :${paramIndex}`);
          bindParams.push(newIsActive);
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
        bindParams.push(structureId);
        const query = `UPDATE ${this.TABLE_NAME} SET ${updateFields.join(', ')} WHERE STRUCTURE_ID = :${paramIndex}`;

        await connection.execute(query, bindParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        // If this structure is being activated, deactivate all other structures
        if (isActivating) {
          await this.deactivateOtherStructures(connection, structureId, userId);
        }

        // Fetch and return the updated record with enterprise name
        const selectQuery = `SELECT 
          s.STRUCTURE_ID,
          s.ENTERPRISE_ID,
          e.ENTERPRISE_NAME,
          s.STRUCTURE_CODE,
          s.STRUCTURE_NAME,
          s.STRUCTURE_TYPE,
          s.DESCRIPTION,
          s.IS_ACTIVE,
          s.CREATED_BY,
          s.CREATED_DATE,
          s.LAST_UPDATED_BY,
          s.LAST_UPDATED_DATE,
          s.LAST_UPDATE_LOGIN
        FROM ${this.TABLE_NAME} s
        LEFT JOIN ENT.ENTERPRISES e ON s.ENTERPRISE_ID = e.ENTERPRISE_ID
        WHERE s.STRUCTURE_ID = :1`;
        const selectResult = await connection.execute(selectQuery, [structureId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        return this.convertKeysToSnakeCase(selectResult.rows[0]);
      });
    } catch (error) {
      console.error('Error in update:', error);
      
      // Handle Oracle constraint violations
      // Check for ORA-00001 (unique constraint violation)
      const isUniqueConstraint = 
        error.errorNum === 1 || 
        error.code === 1 ||
        error.message?.includes('ORA-00001') || 
        error.message?.includes('unique constraint') ||
        (error.message && /unique constraint/i.test(error.message));
      
      if (isUniqueConstraint) {
        // Extract constraint name - look for pattern like (ENT.UK_ENT_HR_ORG_STRUCT_CODE)
        const constraintMatch = error.message?.match(/\(([A-Z_][A-Z0-9_.]+)\)/);
        const constraintName = constraintMatch ? constraintMatch[1] : 'UNKNOWN';
        
        // Extract column names - look for pattern like "columns (ENTERPRISE_ID, STRUCTURE_CODE)"
        const columnMatch = error.message?.match(/columns?\s*\(([^)]+)\)/i);
        const columns = columnMatch ? columnMatch[1] : 'ENTERPRISE_ID, STRUCTURE_CODE';
        
        // Extract existing values - look for pattern like "row with column values (ENTERPRISE_ID:1, STRUCTURE_CODE:'ENT001_WORKFORCE')"
        const valuesMatch = error.message?.match(/row with column values\s*\(([^)]+)\)/i);
        const existingValues = valuesMatch ? valuesMatch[1] : null;
        
        // Create user-friendly message
        const userMessage = `A structure with the same ${columns} already exists for this enterprise.`;
        
        const constraintError = new Error(userMessage);
        constraintError.errorNum = 1;
        constraintError.code = 'UNIQUE_CONSTRAINT_VIOLATION';
        constraintError.statusCode = 409;
        constraintError.constraint = constraintName;
        constraintError.columns = columns;
        constraintError.existingValues = existingValues;
        constraintError.userMessage = userMessage;
        throw constraintError;
      }
      
      // Handle foreign key constraint violations
      if (error.errorNum === 2291 || error.message?.includes('ORA-02291') || error.message?.includes('integrity constraint') && error.message?.includes('parent key not found')) {
        const constraintError = new Error(`Referenced record does not exist.`);
        constraintError.errorNum = 2291;
        constraintError.code = 'FOREIGN_KEY_CONSTRAINT';
        constraintError.statusCode = 400;
        constraintError.userMessage = 'The referenced enterprise or related record does not exist.';
        throw constraintError;
      }
      
      throw new Error(`Failed to update organization structure: ${error.message}`);
    }
  }

  /**
   * Delete an organization structure (soft delete by setting IS_ACTIVE = 'N')
   * @param {number} structureId - Structure ID
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<boolean>} Success status
   */
  static async softDelete(structureId, userId) {
    try {
      const result = await this.executeWithTransaction(async (connection) => {
        const query = `UPDATE ${this.TABLE_NAME} 
          SET IS_ACTIVE = 'N',
              LAST_UPDATED_BY = :1,
              LAST_UPDATED_DATE = :2
          WHERE STRUCTURE_ID = :3`;

        const updateResult = await connection.execute(query, [userId || 'SYSTEM', new Date(), structureId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        // Verify that the update affected at least one row
        const rowsAffected = updateResult.rowsAffected || updateResult.rowCount || 0;
        if (rowsAffected === 0) {
          throw new Error(`No organization structure found with ID: ${structureId}`);
        }
        
        return { ...updateResult, rowsAffected };
      });
      
      console.log(`Soft delete successful for structure ID: ${structureId}, rows affected: ${result.rowsAffected}`);
      return true;
    } catch (error) {
      console.error('Error in softDelete:', error);
      throw new Error(`Failed to delete organization structure: ${error.message}`);
    }
  }

  /**
   * Get referencing records for an organization structure
   * @param {number} structureId - Structure ID
   * @returns {Promise<Object>} Information about referencing records
   */
  static async getReferencingRecords(structureId) {
    try {
      const references = {};
      
      // Check HR_ORG_HIERARCHY_LEVELS table
      try {
        const levelQuery = `SELECT COUNT(*) AS count FROM ENT.HR_ORG_HIERARCHY_LEVELS WHERE STRUCTURE_ID = :1`;
        const levelResult = await this.executeQuery(levelQuery, [structureId]);
        if (levelResult.rows && levelResult.rows.length > 0) {
          const count = levelResult.rows[0].count || 0;
          if (count > 0) {
            references.hr_org_hierarchy_levels = {
              table: 'ENT.HR_ORG_HIERARCHY_LEVELS',
              count: count,
              description: 'Hierarchy levels are using this structure'
            };
          }
        }
      } catch (err) {
        console.warn('Could not check HR_ORG_HIERARCHY_LEVELS references:', err.message);
      }
      
      return references;
    } catch (error) {
      console.error('Error getting referencing records:', error);
      return {};
    }
  }

  /**
   * Hard delete an organization structure (permanent removal)
   * @param {number} structureId - Structure ID
   * @returns {Promise<Object>} Success status and reference info if constraint violation
   */
  static async hardDelete(structureId) {
    try {
      const result = await this.executeWithTransaction(async (connection) => {
        const query = `DELETE FROM ${this.TABLE_NAME} WHERE STRUCTURE_ID = :1`;
        const deleteResult = await connection.execute(query, [structureId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        // Verify that the delete affected at least one row
        const rowsAffected = deleteResult.rowsAffected || deleteResult.rowCount || 0;
        if (rowsAffected === 0) {
          throw new Error(`No organization structure found with ID: ${structureId}`);
        }
        
        return { ...deleteResult, rowsAffected };
      });
      
      console.log(`Hard delete successful for structure ID: ${structureId}, rows affected: ${result.rowsAffected}`);
      return { success: true };
    } catch (error) {
      console.error('Error in hardDelete:', error);
      
      // Handle foreign key constraint violation
      if (error.errorNum === 2292 || error.message?.includes('ORA-02292') || error.message?.includes('integrity constraint')) {
        // Get information about what's referencing this structure
        const references = await this.getReferencingRecords(structureId);
        
        const constraintName = error.message?.match(/\(([^)]+)\)/)?.[1] || 'UNKNOWN';
        const constraintError = new Error(`Cannot delete organization structure: This structure is referenced by other records in the database.`);
        constraintError.errorNum = 2292;
        constraintError.code = 'FOREIGN_KEY_CONSTRAINT';
        constraintError.constraint = constraintName;
        constraintError.references = references;
        constraintError.suggestion = 'Use soft delete (?soft=true) to deactivate this structure instead of permanently deleting it.';
        throw constraintError;
      }
      
      throw new Error(`Failed to delete organization structure: ${error.message}`);
    }
  }
}

export default HrOrgStructureModel;

