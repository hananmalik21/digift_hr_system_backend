import db from '../../../config/db.js';
import oracledb from 'oracledb';

/**
 * Org Unit Model
 * Handles all database operations for ENT.ORG_UNITS table
 */
class OrgUnitModel {
  static TABLE_NAME = 'ENT.ORG_UNITS';

  /**
   * Convert object keys from UPPER_CASE to lowercase snake_case
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
   * Find org units by structure and level
   * @param {number} structureId - Structure ID
   * @param {string} levelCode - Level code
   * @param {Object} filters - Optional filters (parentId, search, isActive, pagination)
   * @returns {Promise<Object>} Object with {orgUnits, total}
   */
  static async findByStructureAndLevel(structureId, levelCode, filters = {}) {
    try {
      let countQuery = `SELECT COUNT(*) AS total FROM ${this.TABLE_NAME}`;
      let dataQuery = `SELECT 
        ORG_UNIT_ID,
        ORG_STRUCTURE_ID,
        ENTERPRISE_ID,
        LEVEL_CODE,
        ORG_UNIT_CODE,
        ORG_UNIT_NAME_EN,
        ORG_UNIT_NAME_AR,
        PARENT_ORG_UNIT_ID,
        IS_ACTIVE,
        MANAGER_NAME,
        MANAGER_EMAIL,
        MANAGER_PHONE,
        LOCATION,
        CITY,
        ADDRESS,
        DESCRIPTION,
        CREATED_BY,
        CREATED_DATE,
        LAST_UPDATED_BY,
        LAST_UPDATED_DATE,
        LAST_UPDATE_LOGIN
      FROM ${this.TABLE_NAME}`;

      const conditions = [];
      const bindParams = [];
      let paramIndex = 1;

      // Required filters
      conditions.push(`ORG_STRUCTURE_ID = :${paramIndex}`);
      bindParams.push(structureId);
      paramIndex++;

      conditions.push(`LEVEL_CODE = :${paramIndex}`);
      bindParams.push(levelCode);
      paramIndex++;

      // Optional filters
      if (filters.parentId !== undefined && filters.parentId !== null) {
        conditions.push(`PARENT_ORG_UNIT_ID = :${paramIndex}`);
        bindParams.push(filters.parentId);
        paramIndex++;
      }

      if (filters.isActive !== undefined) {
        const isActiveValue = filters.isActive === true || filters.isActive === 'Y' ? 'Y' : 'N';
        conditions.push(`IS_ACTIVE = :${paramIndex}`);
        bindParams.push(isActiveValue);
        paramIndex++;
      }

      if (filters.search) {
        const searchValue = `%${filters.search}%`;
        conditions.push(`(
          UPPER(ORG_UNIT_CODE) LIKE UPPER(:${paramIndex}) OR
          UPPER(ORG_UNIT_NAME_EN) LIKE UPPER(:${paramIndex + 1}) OR
          UPPER(ORG_UNIT_NAME_AR) LIKE UPPER(:${paramIndex + 2})
        )`);
        bindParams.push(searchValue);
        bindParams.push(searchValue);
        bindParams.push(searchValue);
        paramIndex += 3;
      }

      const whereClause = ` WHERE ${conditions.join(' AND ')}`;
      countQuery += whereClause;
      dataQuery += whereClause;

      dataQuery += ` ORDER BY ORG_UNIT_NAME_EN, ORG_UNIT_ID`;

      // Handle pagination
      const pagination = filters.pagination;
      let totalCount = 0;
      
      const countBindParams = [...bindParams];
      const dataBindParams = [...bindParams];
      
      if (pagination && pagination.page && pagination.pageSize) {
        const countResult = await this.executeQuery(countQuery, countBindParams);
        totalCount = countResult.rows && countResult.rows.length > 0 ? countResult.rows[0].total : 0;

        const offset = (pagination.page - 1) * pagination.pageSize;
        dataQuery += ` OFFSET :${paramIndex} ROWS FETCH NEXT :${paramIndex + 1} ROWS ONLY`;
        dataBindParams.push(offset);
        dataBindParams.push(pagination.pageSize);
      }

      const result = await this.executeQuery(dataQuery, dataBindParams);
      const orgUnits = result.rows || [];

      if (pagination && pagination.page && pagination.pageSize) {
        return {
          orgUnits,
          total: totalCount
        };
      }

      return orgUnits;
    } catch (error) {
      console.error('Error in findByStructureAndLevel:', error);
      throw new Error(`Failed to fetch org units: ${error.message}`);
    }
  }

  /**
   * Find parent options for a level
   * @param {number} structureId - Structure ID
   * @param {string} parentLevelCode - Parent level code
   * @param {Object} filters - Optional filters (search, pagination)
   * @returns {Promise<Object|Array>} Object with {orgUnits, total} if paginated, or Array
   */
  static async findParentOptions(structureId, parentLevelCode, filters = {}) {
    try {
      let countQuery = `SELECT COUNT(*) AS total FROM ${this.TABLE_NAME}`;
      let dataQuery = `SELECT 
        ORG_UNIT_ID,
        ORG_UNIT_CODE,
        ORG_UNIT_NAME_EN,
        ORG_UNIT_NAME_AR
      FROM ${this.TABLE_NAME}`;

      const conditions = [];
      const bindParams = [];
      let paramIndex = 1;

      conditions.push(`ORG_STRUCTURE_ID = :${paramIndex}`);
      bindParams.push(structureId);
      paramIndex++;

      conditions.push(`LEVEL_CODE = :${paramIndex}`);
      bindParams.push(parentLevelCode);
      paramIndex++;

      // Filter by IS_ACTIVE='Y' - only active org units can be parents
      conditions.push(`IS_ACTIVE = :${paramIndex}`);
      bindParams.push('Y');
      paramIndex++;

      if (filters.search) {
        const searchValue = `%${filters.search}%`;
        conditions.push(`(
          UPPER(ORG_UNIT_CODE) LIKE UPPER(:${paramIndex}) OR
          UPPER(ORG_UNIT_NAME_EN) LIKE UPPER(:${paramIndex + 1}) OR
          UPPER(ORG_UNIT_NAME_AR) LIKE UPPER(:${paramIndex + 2})
        )`);
        bindParams.push(searchValue);
        bindParams.push(searchValue);
        bindParams.push(searchValue);
        paramIndex += 3;
      }

      const whereClause = ` WHERE ${conditions.join(' AND ')}`;
      countQuery += whereClause;
      dataQuery += whereClause;

      dataQuery += ` ORDER BY ORG_UNIT_NAME_EN, ORG_UNIT_ID`;

      const pagination = filters.pagination;
      let totalCount = 0;
      
      const countBindParams = [...bindParams];
      const dataBindParams = [...bindParams];
      
      if (pagination && pagination.page && pagination.pageSize) {
        const countResult = await this.executeQuery(countQuery, countBindParams);
        totalCount = countResult.rows && countResult.rows.length > 0 ? countResult.rows[0].total : 0;

        const offset = (pagination.page - 1) * pagination.pageSize;
        dataQuery += ` OFFSET :${paramIndex} ROWS FETCH NEXT :${paramIndex + 1} ROWS ONLY`;
        dataBindParams.push(offset);
        dataBindParams.push(pagination.pageSize);
      }

      const result = await this.executeQuery(dataQuery, dataBindParams);
      const orgUnits = result.rows || [];

      if (pagination && pagination.page && pagination.pageSize) {
        return {
          orgUnits,
          total: totalCount
        };
      }

      return orgUnits;
    } catch (error) {
      console.error('Error in findParentOptions:', error);
      throw new Error(`Failed to fetch parent options: ${error.message}`);
    }
  }

  /**
   * Find org unit by ID
   * @param {number} orgUnitId - Org Unit ID
   * @param {number} structureId - Structure ID (for validation)
   * @returns {Promise<Object|null>} Org unit or null
   */
  static async findById(orgUnitId, structureId = null) {
    try {
      let query = `SELECT 
        ORG_UNIT_ID,
        ORG_STRUCTURE_ID,
        ENTERPRISE_ID,
        LEVEL_CODE,
        ORG_UNIT_CODE,
        ORG_UNIT_NAME_EN,
        ORG_UNIT_NAME_AR,
        PARENT_ORG_UNIT_ID,
        IS_ACTIVE,
        MANAGER_NAME,
        MANAGER_EMAIL,
        MANAGER_PHONE,
        LOCATION,
        CITY,
        ADDRESS,
        DESCRIPTION,
        CREATED_BY,
        CREATED_DATE,
        LAST_UPDATED_BY,
        LAST_UPDATED_DATE,
        LAST_UPDATE_LOGIN
      FROM ${this.TABLE_NAME}
      WHERE ORG_UNIT_ID = :1`;

      const bindParams = [orgUnitId];

      if (structureId !== null) {
        query += ` AND ORG_STRUCTURE_ID = :2`;
        bindParams.push(structureId);
      }

      const result = await this.executeQuery(query, bindParams);
      
      if (result.rows && result.rows.length > 0) {
        return result.rows[0];
      }
      return null;
    } catch (error) {
      console.error('Error in findById:', error);
      throw new Error(`Failed to fetch org unit: ${error.message}`);
    }
  }

  /**
   * Find all org units for a structure (for tree building)
   * @param {number} structureId - Structure ID
   * @returns {Promise<Array>} Array of org units
   */
  static async findAllByStructure(structureId) {
    try {
      const query = `SELECT 
        ORG_UNIT_ID,
        ORG_STRUCTURE_ID,
        ENTERPRISE_ID,
        LEVEL_CODE,
        ORG_UNIT_CODE,
        ORG_UNIT_NAME_EN,
        ORG_UNIT_NAME_AR,
        PARENT_ORG_UNIT_ID,
        IS_ACTIVE,
        MANAGER_NAME,
        MANAGER_EMAIL,
        MANAGER_PHONE,
        LOCATION,
        CITY,
        ADDRESS,
        DESCRIPTION,
        CREATED_BY,
        CREATED_DATE,
        LAST_UPDATED_BY,
        LAST_UPDATED_DATE,
        LAST_UPDATE_LOGIN
      FROM ${this.TABLE_NAME}
      WHERE ORG_STRUCTURE_ID = :1
      ORDER BY LEVEL_CODE, ORG_UNIT_NAME_EN, ORG_UNIT_ID`;

      const result = await this.executeQuery(query, [structureId]);
      return result.rows || [];
    } catch (error) {
      console.error('Error in findAllByStructure:', error);
      throw new Error(`Failed to fetch org units: ${error.message}`);
    }
  }

  /**
   * Validate parent org unit exists and belongs to structure
   * @param {Object} connection - Database connection
   * @param {number} parentOrgUnitId - Parent Org Unit ID
   * @param {number} structureId - Structure ID
   * @param {string} expectedLevelCode - Expected level code for parent
   * @returns {Promise<boolean>} True if valid
   */
  static async validateParent(connection, parentOrgUnitId, structureId, expectedLevelCode) {
    try {
      const query = `SELECT COUNT(*) AS count 
        FROM ${this.TABLE_NAME}
        WHERE ORG_UNIT_ID = :1 
          AND ORG_STRUCTURE_ID = :2 
          AND LEVEL_CODE = :3`;
      
      const result = await connection.execute(query, [parentOrgUnitId, structureId, expectedLevelCode], {
        outFormat: oracledb.OUT_FORMAT_OBJECT
      });
      
      const count = result.rows && result.rows.length > 0 ? result.rows[0].COUNT : 0;
      return count > 0;
    } catch (error) {
      console.error('Error in validateParent:', error);
      return false;
    }
  }

  /**
   * Create org unit
   * @param {number} structureId - Structure ID
   * @param {number} enterpriseId - Enterprise ID (from structure)
   * @param {Object} data - Org unit data
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Created org unit
   */
  static async create(structureId, enterpriseId, data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        // Get next ORG_UNIT_ID
        let orgUnitId;
        try {
          const seqQuery = `SELECT ENT.ORG_UNITS_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`;
          const seqResult = await connection.execute(seqQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          orgUnitId = seqResult.rows[0].NEXT_ID;
          console.log('Using sequence, got ORG_UNIT_ID:', orgUnitId);
        } catch (seqError) {
          console.warn('Sequence not found, using MAX+1 approach:', seqError.message);
          try {
            const maxQuery = `SELECT NVL(MAX(ORG_UNIT_ID), 0) + 1 AS NEXT_ID FROM ${this.TABLE_NAME}`;
            const maxResult = await connection.execute(maxQuery, [], {
              outFormat: oracledb.OUT_FORMAT_OBJECT
            });
            orgUnitId = maxResult.rows[0].NEXT_ID;
            console.log('Using MAX+1, got ORG_UNIT_ID:', orgUnitId);
          } catch (maxError) {
            console.error('Error getting MAX ORG_UNIT_ID:', maxError);
            throw new Error(`Failed to generate ORG_UNIT_ID: ${maxError.message}`);
          }
        }

        const now = new Date();
        const query = `INSERT INTO ${this.TABLE_NAME} (
          ORG_UNIT_ID,
          ORG_STRUCTURE_ID,
          ENTERPRISE_ID,
          LEVEL_CODE,
          ORG_UNIT_CODE,
          ORG_UNIT_NAME_EN,
          ORG_UNIT_NAME_AR,
          PARENT_ORG_UNIT_ID,
          IS_ACTIVE,
          MANAGER_NAME,
          MANAGER_EMAIL,
          MANAGER_PHONE,
          LOCATION,
          CITY,
          ADDRESS,
          DESCRIPTION,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATED_DATE,
          LAST_UPDATE_LOGIN
        ) VALUES (
          :1, :2, :3, :4, :5, :6, :7, :8, :9, :10, :11, :12, :13, :14, :15, :16, :17, :18, :19, :20, :21
        )`;

        const isActive = data.is_active !== undefined 
          ? (data.is_active === true || data.is_active === 'Y' ? 'Y' : 'N')
          : 'Y';

        // Handle parent_org_unit_id - can be explicitly null or undefined
        let parentOrgUnitId = null;
        if (data.parent_org_unit_id !== undefined) {
          parentOrgUnitId = data.parent_org_unit_id || null;
        } else if (data.PARENT_ORG_UNIT_ID !== undefined) {
          parentOrgUnitId = data.PARENT_ORG_UNIT_ID || null;
        }

        // Extract field values with proper fallback
        const levelCode = data.level_code || data.LEVEL_CODE;
        const orgUnitCode = data.org_unit_code || data.ORG_UNIT_CODE;
        const orgUnitNameEn = data.org_unit_name_en || data.ORG_UNIT_NAME_EN;
        const orgUnitNameAr = data.org_unit_name_ar || data.ORG_UNIT_NAME_AR || null;

        // Validate required fields before insert
        if (!levelCode || levelCode.trim() === '') {
          throw new Error('LEVEL_CODE is required and cannot be empty');
        }
        if (!orgUnitCode || orgUnitCode.trim() === '') {
          throw new Error('ORG_UNIT_CODE is required and cannot be empty');
        }
        if (!orgUnitNameEn || orgUnitNameEn.trim() === '') {
          throw new Error('ORG_UNIT_NAME_EN is required and cannot be empty');
        }

        const bindParams = [
          orgUnitId,
          structureId, // Always use structureId from URL
          enterpriseId || null, // Enterprise ID from structure (metadata only)
          levelCode,
          orgUnitCode,
          orgUnitNameEn,
          orgUnitNameAr,
          parentOrgUnitId,
          isActive,
          data.manager_name || data.MANAGER_NAME || null,
          data.manager_email || data.MANAGER_EMAIL || null,
          data.manager_phone || data.MANAGER_PHONE || null,
          data.location || data.LOCATION || null,
          data.city || data.CITY || null,
          data.address || data.ADDRESS || null,
          data.description || data.DESCRIPTION || null,
          userId || 'SYSTEM',
          now,
          userId || 'SYSTEM',
          now,
          data.last_update_login || data.LAST_UPDATE_LOGIN || null
        ];

        console.log('Creating org unit with bindParams:', {
          orgUnitId,
          structureId,
          enterpriseId,
          levelCode,
          orgUnitCode,
          orgUnitNameEn,
          orgUnitNameAr,
          parentOrgUnitId,
          isActive,
          bindParamsLength: bindParams.length,
          bindParams: bindParams.map((p, i) => ({ index: i, value: p, type: typeof p }))
        });

        try {
          await connection.execute(query, bindParams, {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
        } catch (executeError) {
          console.error('=== DATABASE EXECUTE ERROR ===');
          console.error('Error message:', executeError.message);
          console.error('Error number:', executeError.errorNum);
          console.error('Error code:', executeError.code);
          console.error('Full error object:', JSON.stringify(executeError, Object.getOwnPropertyNames(executeError)));
          console.error('Bind params sent:', bindParams);
          throw executeError;
        }

        // Fetch and return created record
        const selectQuery = `SELECT 
          ORG_UNIT_ID,
          ORG_STRUCTURE_ID,
          ENTERPRISE_ID,
          LEVEL_CODE,
          ORG_UNIT_CODE,
          ORG_UNIT_NAME_EN,
          ORG_UNIT_NAME_AR,
          PARENT_ORG_UNIT_ID,
          IS_ACTIVE,
          MANAGER_NAME,
          MANAGER_EMAIL,
          MANAGER_PHONE,
          LOCATION,
          CITY,
          ADDRESS,
          DESCRIPTION,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATED_DATE,
          LAST_UPDATE_LOGIN
        FROM ${this.TABLE_NAME}
        WHERE ORG_UNIT_ID = :1`;
        
        const selectResult = await connection.execute(selectQuery, [orgUnitId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        return this.convertKeysToSnakeCase(selectResult.rows[0]);
      });
    } catch (error) {
      console.error('Error in create:', error);
      console.error('Error details:', {
        message: error.message,
        errorNum: error.errorNum,
        code: error.code,
        stack: error.stack,
        bindParams: error.bindParams || 'N/A'
      });
      
      // Handle constraint violations
      if (error.errorNum === 1 || error.code === 1 || error.message?.includes('ORA-00001') || error.message?.includes('unique constraint')) {
        // Extract attempted values
        const codeAttempted = data.org_unit_code || data.ORG_UNIT_CODE || 'UNKNOWN';
        const nameAttempted = data.org_unit_name_en || data.ORG_UNIT_NAME_EN || 'UNKNOWN';
        
        // Check if error mentions ORG_UNIT_NAME_EN or ORG_UNIT_CODE in the constraint message
        const errorMsg = error.message || '';
        const isNameConstraint = errorMsg.toUpperCase().includes('ORG_UNIT_NAME_EN') || 
                                 errorMsg.toUpperCase().includes('NAME');
        const isCodeConstraint = errorMsg.toUpperCase().includes('ORG_UNIT_CODE') || 
                                 errorMsg.toUpperCase().includes('CODE');
        
        let errorMessage;
        if (isNameConstraint) {
          errorMessage = `An org unit with name '${nameAttempted}' already exists in this structure. Please use a different name.`;
        } else if (isCodeConstraint) {
          errorMessage = `An org unit with code '${codeAttempted}' already exists in this structure. Please use a different code.`;
        } else {
          // Default to code if we can't determine
          errorMessage = `An org unit with code '${codeAttempted}' or name '${nameAttempted}' already exists in this structure. Please use different values.`;
        }
        
        const constraintError = new Error(errorMessage);
        constraintError.errorNum = error.errorNum || 1;
        constraintError.code = 'UNIQUE_CONSTRAINT_VIOLATION';
        constraintError.statusCode = 409;
        constraintError.originalError = error.message;
        constraintError.conflictingCode = codeAttempted;
        constraintError.conflictingName = nameAttempted;
        throw constraintError;
      }
      
      if (error.errorNum === 2291 || error.code === 2291 || error.message?.includes('ORA-02291')) {
        const constraintError = new Error('Referenced parent org unit does not exist.');
        constraintError.errorNum = error.errorNum || 2291;
        constraintError.code = 'FOREIGN_KEY_CONSTRAINT';
        constraintError.statusCode = 400;
        constraintError.originalError = error.message;
        throw constraintError;
      }
      
      if (error.errorNum === 1400 || error.code === 1400 || error.message?.includes('ORA-01400') || error.message?.includes('cannot insert NULL')) {
        // Extract column name from Oracle error message
        // Oracle error format: "ORA-01400: cannot insert NULL into ("SCHEMA"."TABLE"."COLUMN")"
        const columnMatch = error.message?.match(/cannot insert NULL into \("([^"]+)"\."([^"]+)"\."([^"]+)"/i) || 
                          error.message?.match(/column "([^"]+)"/i);
        const columnName = columnMatch ? (columnMatch[3] || columnMatch[1]) : 'UNKNOWN';
        
        const constraintError = new Error(`Required field '${columnName}' cannot be null. Please provide a value for this field.`);
        constraintError.errorNum = error.errorNum || 1400;
        constraintError.code = 'NOT_NULL_CONSTRAINT';
        constraintError.statusCode = 400;
        constraintError.originalError = error.message;
        constraintError.columnName = columnName;
        throw constraintError;
      }
      
      // Preserve original error details
      const enhancedError = new Error(`Failed to create org unit: ${error.message}`);
      enhancedError.originalError = error;
      enhancedError.errorNum = error.errorNum;
      enhancedError.code = error.code;
      throw enhancedError;
    }
  }

  /**
   * Update org unit
   * @param {number} orgUnitId - Org Unit ID
   * @param {number} structureId - Structure ID (for validation)
   * @param {Object} data - Updated data
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Updated org unit
   */
  static async update(orgUnitId, structureId, data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        const updateFields = [];
        const bindParams = [];
        let paramIndex = 1;

        // Build dynamic update query
        if (data.org_unit_code !== undefined || data.ORG_UNIT_CODE !== undefined) {
          updateFields.push(`ORG_UNIT_CODE = :${paramIndex}`);
          bindParams.push(data.org_unit_code || data.ORG_UNIT_CODE);
          paramIndex++;
        }
        if (data.org_unit_name_en !== undefined || data.ORG_UNIT_NAME_EN !== undefined) {
          updateFields.push(`ORG_UNIT_NAME_EN = :${paramIndex}`);
          bindParams.push(data.org_unit_name_en || data.ORG_UNIT_NAME_EN);
          paramIndex++;
        }
        if (data.org_unit_name_ar !== undefined || data.ORG_UNIT_NAME_AR !== undefined) {
          updateFields.push(`ORG_UNIT_NAME_AR = :${paramIndex}`);
          bindParams.push(data.org_unit_name_ar !== null ? (data.org_unit_name_ar || data.ORG_UNIT_NAME_AR) : null);
          paramIndex++;
        }
        if (data.is_active !== undefined || data.IS_ACTIVE !== undefined) {
          const isActive = data.is_active === true || data.is_active === 'Y' ? 'Y' : 'N';
          updateFields.push(`IS_ACTIVE = :${paramIndex}`);
          bindParams.push(isActive);
          paramIndex++;
        }
        if (data.parent_org_unit_id !== undefined || data.PARENT_ORG_UNIT_ID !== undefined) {
          const parentId = data.parent_org_unit_id !== undefined 
            ? (data.parent_org_unit_id || null)
            : (data.PARENT_ORG_UNIT_ID || null);
          updateFields.push(`PARENT_ORG_UNIT_ID = :${paramIndex}`);
          bindParams.push(parentId);
          paramIndex++;
        }
        if (data.manager_name !== undefined || data.MANAGER_NAME !== undefined) {
          updateFields.push(`MANAGER_NAME = :${paramIndex}`);
          bindParams.push(data.manager_name !== null ? (data.manager_name || data.MANAGER_NAME) : null);
          paramIndex++;
        }
        if (data.manager_email !== undefined || data.MANAGER_EMAIL !== undefined) {
          updateFields.push(`MANAGER_EMAIL = :${paramIndex}`);
          bindParams.push(data.manager_email !== null ? (data.manager_email || data.MANAGER_EMAIL) : null);
          paramIndex++;
        }
        if (data.manager_phone !== undefined || data.MANAGER_PHONE !== undefined) {
          updateFields.push(`MANAGER_PHONE = :${paramIndex}`);
          bindParams.push(data.manager_phone !== null ? (data.manager_phone || data.MANAGER_PHONE) : null);
          paramIndex++;
        }
        if (data.location !== undefined || data.LOCATION !== undefined) {
          updateFields.push(`LOCATION = :${paramIndex}`);
          bindParams.push(data.location !== null ? (data.location || data.LOCATION) : null);
          paramIndex++;
        }
        if (data.city !== undefined || data.CITY !== undefined) {
          updateFields.push(`CITY = :${paramIndex}`);
          bindParams.push(data.city !== null ? (data.city || data.CITY) : null);
          paramIndex++;
        }
        if (data.address !== undefined || data.ADDRESS !== undefined) {
          updateFields.push(`ADDRESS = :${paramIndex}`);
          bindParams.push(data.address !== null ? (data.address || data.ADDRESS) : null);
          paramIndex++;
        }
        if (data.description !== undefined || data.DESCRIPTION !== undefined) {
          updateFields.push(`DESCRIPTION = :${paramIndex}`);
          bindParams.push(data.description !== null ? (data.description || data.DESCRIPTION) : null);
          paramIndex++;
        }
        if (data.last_update_login !== undefined || data.LAST_UPDATE_LOGIN !== undefined) {
          updateFields.push(`LAST_UPDATE_LOGIN = :${paramIndex}`);
          bindParams.push(data.last_update_login !== null ? (data.last_update_login || data.LAST_UPDATE_LOGIN) : null);
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
        bindParams.push(orgUnitId);
        bindParams.push(structureId);
        const query = `UPDATE ${this.TABLE_NAME} 
          SET ${updateFields.join(', ')} 
          WHERE ORG_UNIT_ID = :${paramIndex} AND ORG_STRUCTURE_ID = :${paramIndex + 1}`;

        await connection.execute(query, bindParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        // Fetch and return updated record
        const selectQuery = `SELECT 
          ORG_UNIT_ID,
          ORG_STRUCTURE_ID,
          ENTERPRISE_ID,
          LEVEL_CODE,
          ORG_UNIT_CODE,
          ORG_UNIT_NAME_EN,
          ORG_UNIT_NAME_AR,
          PARENT_ORG_UNIT_ID,
          IS_ACTIVE,
          MANAGER_NAME,
          MANAGER_EMAIL,
          MANAGER_PHONE,
          LOCATION,
          CITY,
          ADDRESS,
          DESCRIPTION,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATED_DATE,
          LAST_UPDATE_LOGIN
        FROM ${this.TABLE_NAME}
        WHERE ORG_UNIT_ID = :1 AND ORG_STRUCTURE_ID = :2`;
        
        const selectResult = await connection.execute(selectQuery, [orgUnitId, structureId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        return this.convertKeysToSnakeCase(selectResult.rows[0]);
      });
    } catch (error) {
      console.error('Error in update:', error);
      
      // Handle constraint violations
      if (error.errorNum === 1 || error.message?.includes('ORA-00001') || error.message?.includes('unique constraint')) {
        const constraintError = new Error('A org unit with the same code already exists in this structure.');
        constraintError.errorNum = 1;
        constraintError.code = 'UNIQUE_CONSTRAINT_VIOLATION';
        constraintError.statusCode = 409;
        throw constraintError;
      }
      
      if (error.errorNum === 2291 || error.message?.includes('ORA-02291')) {
        const constraintError = new Error('Referenced parent org unit does not exist.');
        constraintError.errorNum = 2291;
        constraintError.code = 'FOREIGN_KEY_CONSTRAINT';
        constraintError.statusCode = 400;
        throw constraintError;
      }
      
      throw new Error(`Failed to update org unit: ${error.message}`);
    }
  }

  /**
   * Soft delete an org unit (sets IS_ACTIVE='N')
   * @param {number} orgUnitId - Org Unit ID
   * @param {number} structureId - Structure ID (for validation)
   * @param {string} userId - User ID performing the deletion
   * @returns {Promise<boolean>} Success status
   */
  static async softDelete(orgUnitId, structureId, userId) {
    try {
      const result = await this.executeWithTransaction(async (connection) => {
        // First verify the org unit exists and belongs to the structure
        const checkQuery = `SELECT ORG_UNIT_ID FROM ${this.TABLE_NAME} 
          WHERE ORG_UNIT_ID = :1 AND ORG_STRUCTURE_ID = :2`;
        const checkResult = await connection.execute(checkQuery, [orgUnitId, structureId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        if (!checkResult.rows || checkResult.rows.length === 0) {
          throw new Error(`No org unit found with ID: ${orgUnitId} in structure ${structureId}`);
        }

        const now = new Date();
        const query = `UPDATE ${this.TABLE_NAME} 
          SET IS_ACTIVE = 'N',
              LAST_UPDATED_BY = :1,
              LAST_UPDATED_DATE = :2
          WHERE ORG_UNIT_ID = :3 AND ORG_STRUCTURE_ID = :4`;

        const updateResult = await connection.execute(query, [
          userId || 'SYSTEM',
          now,
          orgUnitId,
          structureId
        ], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        const rowsAffected = updateResult.rowsAffected || updateResult.rowCount || 0;
        if (rowsAffected === 0) {
          throw new Error(`No org unit found with ID: ${orgUnitId} in structure ${structureId}`);
        }
        
        return { ...updateResult, rowsAffected };
      });
      
      console.log(`Soft delete successful for org unit ID: ${orgUnitId}, rows affected: ${result.rowsAffected}`);
      return true;
    } catch (error) {
      console.error('Error in softDelete:', error);
      throw new Error(`Failed to delete org unit: ${error.message}`);
    }
  }

  /**
   * Hard delete an org unit (permanent removal)
   * @param {number} orgUnitId - Org Unit ID
   * @param {number} structureId - Structure ID (for validation)
   * @returns {Promise<Object>} Success status
   */
  static async hardDelete(orgUnitId, structureId) {
    try {
      const result = await this.executeWithTransaction(async (connection) => {
        // First verify the org unit exists and belongs to the structure
        const checkQuery = `SELECT ORG_UNIT_ID FROM ${this.TABLE_NAME} 
          WHERE ORG_UNIT_ID = :1 AND ORG_STRUCTURE_ID = :2`;
        const checkResult = await connection.execute(checkQuery, [orgUnitId, structureId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        if (!checkResult.rows || checkResult.rows.length === 0) {
          throw new Error(`No org unit found with ID: ${orgUnitId} in structure ${structureId}`);
        }

        const query = `DELETE FROM ${this.TABLE_NAME} 
          WHERE ORG_UNIT_ID = :1 AND ORG_STRUCTURE_ID = :2`;
        const deleteResult = await connection.execute(query, [orgUnitId, structureId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        const rowsAffected = deleteResult.rowsAffected || deleteResult.rowCount || 0;
        if (rowsAffected === 0) {
          throw new Error(`No org unit found with ID: ${orgUnitId} in structure ${structureId}`);
        }
        
        return { ...deleteResult, rowsAffected };
      });
      
      console.log(`Hard delete successful for org unit ID: ${orgUnitId}, rows affected: ${result.rowsAffected}`);
      return { success: true };
    } catch (error) {
      console.error('Error in hardDelete:', error);
      
      if (error.errorNum === 2292 || error.message?.includes('ORA-02292') || error.message?.includes('integrity constraint')) {
        const constraintName = error.message?.match(/\(([^)]+)\)/)?.[1] || 'UNKNOWN';
        const constraintError = new Error(`Cannot delete org unit: This org unit is referenced by other records in the database.`);
        constraintError.errorNum = 2292;
        constraintError.code = 'FOREIGN_KEY_CONSTRAINT';
        constraintError.constraint = constraintName;
        constraintError.suggestion = 'Use soft delete (?soft=true) to deactivate this org unit instead of permanently deleting it.';
        throw constraintError;
      }
      
      throw new Error(`Failed to delete org unit: ${error.message}`);
    }
  }

  /**
   * Build tree structure from flat org units array
   * @param {Array} orgUnits - Flat array of org units
   * @returns {Array} Tree structure with children arrays
   */
  static buildTree(orgUnits) {
    const unitMap = new Map();
    const roots = [];

    // Create map of all units
    orgUnits.forEach(unit => {
      const unitId = unit.org_unit_id || unit.ORG_UNIT_ID;
      unitMap.set(unitId, {
        ...unit,
        children: []
      });
    });

    // Build tree
    orgUnits.forEach(unit => {
      const unitId = unit.org_unit_id || unit.ORG_UNIT_ID;
      const parentId = unit.parent_org_unit_id || unit.PARENT_ORG_UNIT_ID;

      if (parentId && unitMap.has(parentId)) {
        // Has parent, add to parent's children
        unitMap.get(parentId).children.push(unitMap.get(unitId));
      } else {
        // Root node
        roots.push(unitMap.get(unitId));
      }
    });

    return roots;
  }
}

export default OrgUnitModel;

