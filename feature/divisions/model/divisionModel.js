import db from '../../../config/db.js';
import oracledb from 'oracledb';
import CompanyModel from '../../companies/model/companyModel.js';

/**
 * Division Model
 * Handles all database operations for ENT.DIVISIONS table
 */
class DivisionModel {
  static TABLE_NAME = 'ENT.DIVISIONS';

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
   * Convert date string to Date object for Oracle
   * @param {string|Date|null} dateValue - Date string or Date object
   * @returns {Date|null} Date object or null
   */
  static convertToDate(dateValue) {
    if (!dateValue) return null;
    if (dateValue instanceof Date) return dateValue;
    if (typeof dateValue === 'string') {
      const parsed = new Date(dateValue);
      if (isNaN(parsed.getTime())) {
        return null;
      }
      return parsed;
    }
    return null;
  }

  /**
   * Get all divisions
   * @param {Object} filters - Optional filters (divisionId, companyId, orgStructureId, status, search, pagination)
   * @param {Object} filters.pagination - Pagination options {page, pageSize}
   * @returns {Promise<Object|Array>} Object with {divisions, total} if paginated, or Array of divisions
   */
  static async findAll(filters = {}) {
    try {
      let countQuery = `SELECT COUNT(*) AS total FROM ${this.TABLE_NAME} d
      LEFT JOIN ENT.COMPANIES c ON d.COMPANY_ID = c.COMPANY_ID`;
      let dataQuery = `SELECT 
        d.DIVISION_ID,
        d.DIVISION_CODE,
        d.STATUS,
        d.DIVISION_NAME_EN,
        d.DIVISION_NAME_AR,
        d.COMPANY_ID,
        c.COMPANY_NAME_EN,
        c.COMPANY_NAME_AR,
        d.ORG_STRUCTURE_ID,
        s.STRUCTURE_NAME AS ORG_STRUCTURE_NAME,
        d.HEAD_OF_DIVISION,
        d.HEAD_EMAIL,
        d.HEAD_PHONE,
        d.LOCATION,
        d.CITY,
        d.ADDRESS,
        d.ESTABLISHED_DATE,
        d.BUSINESS_FOCUS,
        d.TOTAL_EMPLOYEES,
        d.TOTAL_DEPARTMENTS,
        d.ANNUAL_BUDGET_KWD,
        d.DESCRIPTION,
        d.CREATED_BY,
        d.CREATED_DATE,
        d.LAST_UPDATED_BY,
        d.LAST_UPDATED_DATE,
        d.LAST_UPDATE_LOGIN
      FROM ${this.TABLE_NAME} d
      LEFT JOIN ENT.COMPANIES c ON d.COMPANY_ID = c.COMPANY_ID
      LEFT JOIN ENT.HR_ORG_STRUCTURES s ON d.ORG_STRUCTURE_ID = s.STRUCTURE_ID`;

      const conditions = [];
      const bindParams = [];
      let paramIndex = 1;

      if (filters.divisionId) {
        conditions.push(`d.DIVISION_ID = :${paramIndex}`);
        bindParams.push(filters.divisionId);
        paramIndex++;
      }

      if (filters.companyId) {
        conditions.push(`d.COMPANY_ID = :${paramIndex}`);
        bindParams.push(filters.companyId);
        paramIndex++;
      }

      if (filters.orgStructureId) {
        conditions.push(`d.ORG_STRUCTURE_ID = :${paramIndex}`);
        bindParams.push(filters.orgStructureId);
        paramIndex++;
      }

      if (filters.status) {
        conditions.push(`d.STATUS = :${paramIndex}`);
        bindParams.push(filters.status);
        paramIndex++;
      }

      // Search across division name, code, head of division, and company name
      if (filters.search) {
        const searchValue = `%${filters.search}%`;
        conditions.push(`(
          UPPER(d.DIVISION_CODE) LIKE UPPER(:${paramIndex}) OR
          UPPER(d.DIVISION_NAME_EN) LIKE UPPER(:${paramIndex + 1}) OR
          UPPER(d.DIVISION_NAME_AR) LIKE UPPER(:${paramIndex + 2}) OR
          UPPER(d.HEAD_OF_DIVISION) LIKE UPPER(:${paramIndex + 3}) OR
          UPPER(c.COMPANY_NAME_EN) LIKE UPPER(:${paramIndex + 4})
        )`);
        bindParams.push(searchValue);
        bindParams.push(searchValue);
        bindParams.push(searchValue);
        bindParams.push(searchValue);
        bindParams.push(searchValue);
        paramIndex += 5;
      }

      const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

      countQuery += whereClause;
      dataQuery += whereClause;

      dataQuery += ` ORDER BY d.CREATED_DATE DESC, d.DIVISION_ID DESC`;

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
      const divisions = result.rows || [];

      if (pagination && pagination.page && pagination.pageSize) {
        return {
          divisions: divisions,
          total: totalCount
        };
      }

      return divisions;
    } catch (error) {
      console.error('Error in findAll:', error);
      throw new Error(`Failed to fetch divisions: ${error.message}`);
    }
  }

  /**
   * Get a single division by ID
   * @param {number} divisionId - Division ID
   * @returns {Promise<Object|null>} Division object or null
   */
  static async findById(divisionId) {
    try {
      const query = `SELECT 
        d.DIVISION_ID,
        d.DIVISION_CODE,
        d.STATUS,
        d.DIVISION_NAME_EN,
        d.DIVISION_NAME_AR,
        d.COMPANY_ID,
        c.COMPANY_NAME_EN,
        c.COMPANY_NAME_AR,
        d.ORG_STRUCTURE_ID,
        s.STRUCTURE_NAME AS ORG_STRUCTURE_NAME,
        d.HEAD_OF_DIVISION,
        d.HEAD_EMAIL,
        d.HEAD_PHONE,
        d.LOCATION,
        d.CITY,
        d.ADDRESS,
        d.ESTABLISHED_DATE,
        d.BUSINESS_FOCUS,
        d.TOTAL_EMPLOYEES,
        d.TOTAL_DEPARTMENTS,
        d.ANNUAL_BUDGET_KWD,
        d.DESCRIPTION,
        d.CREATED_BY,
        d.CREATED_DATE,
        d.LAST_UPDATED_BY,
        d.LAST_UPDATED_DATE,
        d.LAST_UPDATE_LOGIN
      FROM ${this.TABLE_NAME} d
      LEFT JOIN ENT.COMPANIES c ON d.COMPANY_ID = c.COMPANY_ID
      LEFT JOIN ENT.HR_ORG_STRUCTURES s ON d.ORG_STRUCTURE_ID = s.STRUCTURE_ID
      WHERE d.DIVISION_ID = :1`;

      const result = await this.executeQuery(query, [divisionId]);
      
      if (result.rows && result.rows.length > 0) {
        return result.rows[0];
      }
      return null;
    } catch (error) {
      console.error('Error in findById:', error);
      throw new Error(`Failed to fetch division: ${error.message}`);
    }
  }

  /**
   * Create a new division
   * @param {Object} data - Division data
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<Object>} Created division
   */
  static async create(data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        // Fetch company to get ORG_STRUCTURE_ID if only COMPANY_ID is provided
        let orgStructureId = data.ORG_STRUCTURE_ID;
        let companyNameEn = data.COMPANY_NAME_EN;
        let companyNameAr = data.COMPANY_NAME_AR;

        if (data.COMPANY_ID && !orgStructureId) {
          const company = await CompanyModel.findById(data.COMPANY_ID);
          if (!company) {
            throw new Error(`Company with ID ${data.COMPANY_ID} not found`);
          }
          orgStructureId = company.org_structure_id || company.ORG_STRUCTURE_ID;
          companyNameEn = company.company_name_en || company.COMPANY_NAME_EN;
          companyNameAr = company.company_name_ar || company.COMPANY_NAME_AR;
        }

        // Get next DIVISION_ID from sequence
        let divisionId;
        try {
          const seqQuery = `SELECT ENT.DIVISIONS_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`;
          const seqResult = await connection.execute(seqQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          divisionId = seqResult.rows[0].NEXT_ID;
        } catch (seqError) {
          const maxQuery = `SELECT NVL(MAX(DIVISION_ID), 0) + 1 AS NEXT_ID FROM ${this.TABLE_NAME}`;
          const maxResult = await connection.execute(maxQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          divisionId = maxResult.rows[0].NEXT_ID;
        }

        const now = new Date();
        const query = `INSERT INTO ${this.TABLE_NAME} (
          DIVISION_ID,
          DIVISION_CODE,
          STATUS,
          DIVISION_NAME_EN,
          DIVISION_NAME_AR,
          COMPANY_ID,
          COMPANY_NAME_EN,
          COMPANY_NAME_AR,
          ORG_STRUCTURE_ID,
          ORG_STRUCTURE_NAME,
          HEAD_OF_DIVISION,
          HEAD_EMAIL,
          HEAD_PHONE,
          LOCATION,
          CITY,
          ADDRESS,
          ESTABLISHED_DATE,
          BUSINESS_FOCUS,
          TOTAL_EMPLOYEES,
          TOTAL_DEPARTMENTS,
          ANNUAL_BUDGET_KWD,
          DESCRIPTION,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATED_DATE,
          LAST_UPDATE_LOGIN
        ) VALUES (
          :1, :2, :3, :4, :5, :6, :7, :8, :9, :10, :11, :12, :13, :14, :15, :16, :17, :18, :19, :20, :21, :22, :23, :24, :25, :26, :27
        )`;

        // Fetch ORG_STRUCTURE_NAME if ORG_STRUCTURE_ID is available
        let orgStructureName = data.ORG_STRUCTURE_NAME;
        if (orgStructureId && !orgStructureName) {
          try {
            const orgQuery = `SELECT STRUCTURE_NAME FROM ENT.HR_ORG_STRUCTURES WHERE STRUCTURE_ID = :1`;
            const orgResult = await connection.execute(orgQuery, [orgStructureId], {
              outFormat: oracledb.OUT_FORMAT_OBJECT
            });
            if (orgResult.rows && orgResult.rows.length > 0) {
              orgStructureName = orgResult.rows[0].STRUCTURE_NAME;
            }
          } catch (orgError) {
            console.warn('Could not fetch ORG_STRUCTURE_NAME:', orgError.message);
          }
        }

        const bindParams = [
          divisionId,
          data.DIVISION_CODE || null,
          data.STATUS || 'ACTIVE',
          data.DIVISION_NAME_EN || null,
          data.DIVISION_NAME_AR || null,
          data.COMPANY_ID || null,
          companyNameEn || null,
          companyNameAr || null,
          orgStructureId || null,
          orgStructureName || null,
          data.HEAD_OF_DIVISION || null,
          data.HEAD_EMAIL || null,
          data.HEAD_PHONE || null,
          data.LOCATION || null,
          data.CITY || null,
          data.ADDRESS || null,
          this.convertToDate(data.ESTABLISHED_DATE),
          data.BUSINESS_FOCUS || null,
          data.TOTAL_EMPLOYEES || null,
          data.TOTAL_DEPARTMENTS || null,
          data.ANNUAL_BUDGET_KWD || null,
          data.DESCRIPTION || null,
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
        const selectQuery = `SELECT 
          d.DIVISION_ID,
          d.DIVISION_CODE,
          d.STATUS,
          d.DIVISION_NAME_EN,
          d.DIVISION_NAME_AR,
          d.COMPANY_ID,
          c.COMPANY_NAME_EN,
          c.COMPANY_NAME_AR,
          d.ORG_STRUCTURE_ID,
          s.STRUCTURE_NAME AS ORG_STRUCTURE_NAME,
          d.HEAD_OF_DIVISION,
          d.HEAD_EMAIL,
          d.HEAD_PHONE,
          d.LOCATION,
          d.CITY,
          d.ADDRESS,
          d.ESTABLISHED_DATE,
          d.BUSINESS_FOCUS,
          d.TOTAL_EMPLOYEES,
          d.TOTAL_DEPARTMENTS,
          d.ANNUAL_BUDGET_KWD,
          d.DESCRIPTION,
          d.CREATED_BY,
          d.CREATED_DATE,
          d.LAST_UPDATED_BY,
          d.LAST_UPDATED_DATE,
          d.LAST_UPDATE_LOGIN
        FROM ${this.TABLE_NAME} d
        LEFT JOIN ENT.COMPANIES c ON d.COMPANY_ID = c.COMPANY_ID
        LEFT JOIN ENT.HR_ORG_STRUCTURES s ON d.ORG_STRUCTURE_ID = s.STRUCTURE_ID
        WHERE d.DIVISION_ID = :1`;
        const selectResult = await connection.execute(selectQuery, [divisionId], {
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
        const columns = columnMatch ? columnMatch[1] : 'DIVISION_CODE';
        
        const userMessage = `A division with the same ${columns} already exists.`;
        
        const constraintError = new Error(userMessage);
        constraintError.errorNum = 1;
        constraintError.code = 'UNIQUE_CONSTRAINT_VIOLATION';
        constraintError.statusCode = 409;
        constraintError.constraint = constraintName;
        constraintError.columns = columns;
        constraintError.userMessage = userMessage;
        throw constraintError;
      }
      
      // Handle foreign key constraint violations
      if (error.errorNum === 2291 || error.message?.includes('ORA-02291') || error.message?.includes('integrity constraint') && error.message?.includes('parent key not found')) {
        const constraintError = new Error(`Referenced record does not exist.`);
        constraintError.errorNum = 2291;
        constraintError.code = 'FOREIGN_KEY_CONSTRAINT';
        constraintError.statusCode = 400;
        constraintError.userMessage = 'The referenced company or organization structure does not exist.';
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
      
      // Handle check constraint violations
      if (error.errorNum === 2290 || error.message?.includes('ORA-02290') || error.message?.includes('check constraint')) {
        const constraintMatch = error.message?.match(/\(([A-Z_][A-Z0-9_.]+)\)/);
        const constraintName = constraintMatch ? constraintMatch[1] : 'UNKNOWN';
        
        let userMessage = 'Invalid value provided. Please check the field values.';
        if (constraintName.includes('STATUS')) {
          userMessage = 'Invalid STATUS value. Valid values may be: ACTIVE, INACTIVE, SUSPENDED, or check database constraints.';
        }
        
        const constraintError = new Error(userMessage);
        constraintError.errorNum = 2290;
        constraintError.code = 'CHECK_CONSTRAINT_VIOLATION';
        constraintError.statusCode = 400;
        constraintError.constraint = constraintName;
        constraintError.userMessage = userMessage;
        throw constraintError;
      }
      
      throw new Error(`Failed to create division: ${error.message}`);
    }
  }

  /**
   * Update an existing division
   * @param {number} divisionId - Division ID
   * @param {Object} data - Updated data
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<Object>} Updated division
   */
  static async update(divisionId, data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        // If COMPANY_ID is updated, fetch company info
        let orgStructureId = data.ORG_STRUCTURE_ID;
        let companyNameEn = data.COMPANY_NAME_EN;
        let companyNameAr = data.COMPANY_NAME_AR;

        if (data.COMPANY_ID !== undefined && !orgStructureId) {
          const company = await CompanyModel.findById(data.COMPANY_ID);
          if (company) {
            orgStructureId = company.org_structure_id || company.ORG_STRUCTURE_ID;
            companyNameEn = company.company_name_en || company.COMPANY_NAME_EN;
            companyNameAr = company.company_name_ar || company.COMPANY_NAME_AR;
          }
        }

        const updateFields = [];
        const bindParams = [];
        let paramIndex = 1;

        if (data.DIVISION_CODE !== undefined) {
          updateFields.push(`DIVISION_CODE = :${paramIndex}`);
          bindParams.push(data.DIVISION_CODE);
          paramIndex++;
        }
        if (data.STATUS !== undefined) {
          updateFields.push(`STATUS = :${paramIndex}`);
          bindParams.push(data.STATUS);
          paramIndex++;
        }
        if (data.DIVISION_NAME_EN !== undefined) {
          updateFields.push(`DIVISION_NAME_EN = :${paramIndex}`);
          bindParams.push(data.DIVISION_NAME_EN);
          paramIndex++;
        }
        if (data.DIVISION_NAME_AR !== undefined) {
          updateFields.push(`DIVISION_NAME_AR = :${paramIndex}`);
          bindParams.push(data.DIVISION_NAME_AR);
          paramIndex++;
        }
        if (data.COMPANY_ID !== undefined) {
          updateFields.push(`COMPANY_ID = :${paramIndex}`);
          bindParams.push(data.COMPANY_ID);
          paramIndex++;
        }
        if (companyNameEn !== undefined) {
          updateFields.push(`COMPANY_NAME_EN = :${paramIndex}`);
          bindParams.push(companyNameEn);
          paramIndex++;
        }
        if (companyNameAr !== undefined) {
          updateFields.push(`COMPANY_NAME_AR = :${paramIndex}`);
          bindParams.push(companyNameAr);
          paramIndex++;
        }
        if (orgStructureId !== undefined) {
          updateFields.push(`ORG_STRUCTURE_ID = :${paramIndex}`);
          bindParams.push(orgStructureId);
          paramIndex++;
        }
        if (data.ORG_STRUCTURE_NAME !== undefined) {
          updateFields.push(`ORG_STRUCTURE_NAME = :${paramIndex}`);
          bindParams.push(data.ORG_STRUCTURE_NAME);
          paramIndex++;
        } else if (orgStructureId !== undefined) {
          // Fetch ORG_STRUCTURE_NAME if ORG_STRUCTURE_ID is set
          try {
            const orgQuery = `SELECT STRUCTURE_NAME FROM ENT.HR_ORG_STRUCTURES WHERE STRUCTURE_ID = :1`;
            const orgResult = await connection.execute(orgQuery, [orgStructureId], {
              outFormat: oracledb.OUT_FORMAT_OBJECT
            });
            if (orgResult.rows && orgResult.rows.length > 0) {
              updateFields.push(`ORG_STRUCTURE_NAME = :${paramIndex}`);
              bindParams.push(orgResult.rows[0].STRUCTURE_NAME);
              paramIndex++;
            }
          } catch (orgError) {
            console.warn('Could not fetch ORG_STRUCTURE_NAME:', orgError.message);
          }
        }
        if (data.HEAD_OF_DIVISION !== undefined) {
          updateFields.push(`HEAD_OF_DIVISION = :${paramIndex}`);
          bindParams.push(data.HEAD_OF_DIVISION);
          paramIndex++;
        }
        if (data.HEAD_EMAIL !== undefined) {
          updateFields.push(`HEAD_EMAIL = :${paramIndex}`);
          bindParams.push(data.HEAD_EMAIL);
          paramIndex++;
        }
        if (data.HEAD_PHONE !== undefined) {
          updateFields.push(`HEAD_PHONE = :${paramIndex}`);
          bindParams.push(data.HEAD_PHONE);
          paramIndex++;
        }
        if (data.LOCATION !== undefined) {
          updateFields.push(`LOCATION = :${paramIndex}`);
          bindParams.push(data.LOCATION);
          paramIndex++;
        }
        if (data.CITY !== undefined) {
          updateFields.push(`CITY = :${paramIndex}`);
          bindParams.push(data.CITY);
          paramIndex++;
        }
        if (data.ADDRESS !== undefined) {
          updateFields.push(`ADDRESS = :${paramIndex}`);
          bindParams.push(data.ADDRESS);
          paramIndex++;
        }
        if (data.ESTABLISHED_DATE !== undefined) {
          updateFields.push(`ESTABLISHED_DATE = :${paramIndex}`);
          bindParams.push(this.convertToDate(data.ESTABLISHED_DATE));
          paramIndex++;
        }
        if (data.BUSINESS_FOCUS !== undefined) {
          updateFields.push(`BUSINESS_FOCUS = :${paramIndex}`);
          bindParams.push(data.BUSINESS_FOCUS);
          paramIndex++;
        }
        if (data.TOTAL_EMPLOYEES !== undefined) {
          updateFields.push(`TOTAL_EMPLOYEES = :${paramIndex}`);
          bindParams.push(data.TOTAL_EMPLOYEES);
          paramIndex++;
        }
        if (data.TOTAL_DEPARTMENTS !== undefined) {
          updateFields.push(`TOTAL_DEPARTMENTS = :${paramIndex}`);
          bindParams.push(data.TOTAL_DEPARTMENTS);
          paramIndex++;
        }
        if (data.ANNUAL_BUDGET_KWD !== undefined) {
          updateFields.push(`ANNUAL_BUDGET_KWD = :${paramIndex}`);
          bindParams.push(data.ANNUAL_BUDGET_KWD);
          paramIndex++;
        }
        if (data.DESCRIPTION !== undefined) {
          updateFields.push(`DESCRIPTION = :${paramIndex}`);
          bindParams.push(data.DESCRIPTION);
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
        bindParams.push(divisionId);
        const query = `UPDATE ${this.TABLE_NAME} SET ${updateFields.join(', ')} WHERE DIVISION_ID = :${paramIndex}`;

        await connection.execute(query, bindParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        // Fetch and return the updated record
        const selectQuery = `SELECT 
          d.DIVISION_ID,
          d.DIVISION_CODE,
          d.STATUS,
          d.DIVISION_NAME_EN,
          d.DIVISION_NAME_AR,
          d.COMPANY_ID,
          c.COMPANY_NAME_EN,
          c.COMPANY_NAME_AR,
          d.ORG_STRUCTURE_ID,
          s.STRUCTURE_NAME AS ORG_STRUCTURE_NAME,
          d.HEAD_OF_DIVISION,
          d.HEAD_EMAIL,
          d.HEAD_PHONE,
          d.LOCATION,
          d.CITY,
          d.ADDRESS,
          d.ESTABLISHED_DATE,
          d.BUSINESS_FOCUS,
          d.TOTAL_EMPLOYEES,
          d.TOTAL_DEPARTMENTS,
          d.ANNUAL_BUDGET_KWD,
          d.DESCRIPTION,
          d.CREATED_BY,
          d.CREATED_DATE,
          d.LAST_UPDATED_BY,
          d.LAST_UPDATED_DATE,
          d.LAST_UPDATE_LOGIN
        FROM ${this.TABLE_NAME} d
        LEFT JOIN ENT.COMPANIES c ON d.COMPANY_ID = c.COMPANY_ID
        LEFT JOIN ENT.HR_ORG_STRUCTURES s ON d.ORG_STRUCTURE_ID = s.STRUCTURE_ID
        WHERE d.DIVISION_ID = :1`;
        const selectResult = await connection.execute(selectQuery, [divisionId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        return this.convertKeysToSnakeCase(selectResult.rows[0]);
      });
    } catch (error) {
      console.error('Error in update:', error);
      
      // Handle constraint violations (same as create)
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
        const columns = columnMatch ? columnMatch[1] : 'DIVISION_CODE';
        
        const userMessage = `A division with the same ${columns} already exists.`;
        
        const constraintError = new Error(userMessage);
        constraintError.errorNum = 1;
        constraintError.code = 'UNIQUE_CONSTRAINT_VIOLATION';
        constraintError.statusCode = 409;
        constraintError.constraint = constraintName;
        constraintError.columns = columns;
        constraintError.userMessage = userMessage;
        throw constraintError;
      }
      
      if (error.errorNum === 2291 || error.message?.includes('ORA-02291') || error.message?.includes('integrity constraint') && error.message?.includes('parent key not found')) {
        const constraintError = new Error(`Referenced record does not exist.`);
        constraintError.errorNum = 2291;
        constraintError.code = 'FOREIGN_KEY_CONSTRAINT';
        constraintError.statusCode = 400;
        constraintError.userMessage = 'The referenced company or organization structure does not exist.';
        throw constraintError;
      }
      
      if (error.errorNum === 2290 || error.message?.includes('ORA-02290') || error.message?.includes('check constraint')) {
        const constraintMatch = error.message?.match(/\(([A-Z_][A-Z0-9_.]+)\)/);
        const constraintName = constraintMatch ? constraintMatch[1] : 'UNKNOWN';
        
        let userMessage = 'Invalid value provided. Please check the field values.';
        if (constraintName.includes('STATUS')) {
          userMessage = 'Invalid STATUS value. Valid values may be: ACTIVE, INACTIVE, SUSPENDED, or check database constraints.';
        }
        
        const constraintError = new Error(userMessage);
        constraintError.errorNum = 2290;
        constraintError.code = 'CHECK_CONSTRAINT_VIOLATION';
        constraintError.statusCode = 400;
        constraintError.constraint = constraintName;
        constraintError.userMessage = userMessage;
        throw constraintError;
      }
      
      throw new Error(`Failed to update division: ${error.message}`);
    }
  }

  /**
   * Delete a division (soft delete by setting STATUS = 'INACTIVE')
   * @param {number} divisionId - Division ID
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<boolean>} Success status
   */
  static async softDelete(divisionId, userId) {
    try {
      const result = await this.executeWithTransaction(async (connection) => {
        const query = `UPDATE ${this.TABLE_NAME} 
          SET STATUS = 'INACTIVE',
              LAST_UPDATED_BY = :1,
              LAST_UPDATED_DATE = :2
          WHERE DIVISION_ID = :3`;

        const updateResult = await connection.execute(query, [userId || 'SYSTEM', new Date(), divisionId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        const rowsAffected = updateResult.rowsAffected || updateResult.rowCount || 0;
        if (rowsAffected === 0) {
          throw new Error(`No division found with ID: ${divisionId}`);
        }
        
        return { ...updateResult, rowsAffected };
      });
      
      console.log(`Soft delete successful for division ID: ${divisionId}, rows affected: ${result.rowsAffected}`);
      return true;
    } catch (error) {
      console.error('Error in softDelete:', error);
      throw new Error(`Failed to delete division: ${error.message}`);
    }
  }

  /**
   * Hard delete a division (permanent removal)
   * @param {number} divisionId - Division ID
   * @returns {Promise<Object>} Success status
   */
  static async hardDelete(divisionId) {
    try {
      const result = await this.executeWithTransaction(async (connection) => {
        const query = `DELETE FROM ${this.TABLE_NAME} WHERE DIVISION_ID = :1`;
        const deleteResult = await connection.execute(query, [divisionId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        const rowsAffected = deleteResult.rowsAffected || deleteResult.rowCount || 0;
        if (rowsAffected === 0) {
          throw new Error(`No division found with ID: ${divisionId}`);
        }
        
        return { ...deleteResult, rowsAffected };
      });
      
      console.log(`Hard delete successful for division ID: ${divisionId}, rows affected: ${result.rowsAffected}`);
      return { success: true };
    } catch (error) {
      console.error('Error in hardDelete:', error);
      
      if (error.errorNum === 2292 || error.message?.includes('ORA-02292') || error.message?.includes('integrity constraint')) {
        const constraintName = error.message?.match(/\(([^)]+)\)/)?.[1] || 'UNKNOWN';
        const constraintError = new Error(`Cannot delete division: This division is referenced by other records in the database.`);
        constraintError.errorNum = 2292;
        constraintError.code = 'FOREIGN_KEY_CONSTRAINT';
        constraintError.constraint = constraintName;
        constraintError.suggestion = 'Use soft delete (?soft=true) to deactivate this division instead of permanently deleting it.';
        throw constraintError;
      }
      
      throw new Error(`Failed to delete division: ${error.message}`);
    }
  }
}

export default DivisionModel;

