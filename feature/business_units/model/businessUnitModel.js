import db from '../../../config/db.js';
import oracledb from 'oracledb';
import DivisionModel from '../../divisions/model/divisionModel.js';

/**
 * Business Unit Model
 * Handles all database operations for ENT.BUSINESS_UNIT table
 */
class BusinessUnitModel {
  static TABLE_NAME = 'ENT.BUSINESS_UNIT';

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
   * Get all business units
   * @param {Object} filters - Optional filters (businessUnitId, divisionId, companyId, orgStructureId, status, search, pagination)
   * @param {Object} filters.pagination - Pagination options {page, pageSize}
   * @returns {Promise<Object|Array>} Object with {businessUnits, total} if paginated, or Array of business units
   */
  static async findAll(filters = {}) {
    try {
      let countQuery = `SELECT COUNT(*) AS total FROM ${this.TABLE_NAME} bu
      LEFT JOIN ENT.DIVISIONS d ON bu.DIVISION_ID = d.DIVISION_ID
      LEFT JOIN ENT.COMPANIES c ON bu.COMPANY_ID = c.COMPANY_ID`;
      let dataQuery = `SELECT 
        bu.BUSINESS_UNIT_ID,
        bu.UNIT_CODE,
        bu.STATUS,
        bu.UNIT_NAME_EN,
        bu.UNIT_NAME_AR,
        bu.COMPANY_ID,
        bu.DIVISION_ID,
        c.COMPANY_NAME_EN,
        c.COMPANY_NAME_AR,
        d.DIVISION_NAME_EN,
        d.DIVISION_NAME_AR,
        bu.ORG_STRUCTURE_ID,
        s.STRUCTURE_NAME AS ORG_STRUCTURE_NAME,
        bu.HEAD_OF_UNIT,
        bu.HEAD_EMAIL,
        bu.HEAD_PHONE,
        bu.LOCATION,
        bu.CITY,
        bu.ESTABLISHED_DATE,
        bu.BUSINESS_FOCUS,
        bu.TOTAL_EMPLOYEES,
        bu.TOTAL_DEPARTMENTS,
        bu.ANNUAL_BUDGET_KWD,
        bu.DESCRIPTION,
        bu.CREATED_BY,
        bu.CREATED_DATE,
        bu.LAST_UPDATED_BY,
        bu.LAST_UPDATED_DATE,
        bu.LAST_UPDATE_LOGIN
      FROM ${this.TABLE_NAME} bu
      LEFT JOIN ENT.DIVISIONS d ON bu.DIVISION_ID = d.DIVISION_ID
      LEFT JOIN ENT.COMPANIES c ON bu.COMPANY_ID = c.COMPANY_ID
      LEFT JOIN ENT.HR_ORG_STRUCTURES s ON bu.ORG_STRUCTURE_ID = s.STRUCTURE_ID`;

      const conditions = [];
      const bindParams = [];
      let paramIndex = 1;

      if (filters.businessUnitId) {
        conditions.push(`bu.BUSINESS_UNIT_ID = :${paramIndex}`);
        bindParams.push(filters.businessUnitId);
        paramIndex++;
      }

      if (filters.divisionId) {
        conditions.push(`bu.DIVISION_ID = :${paramIndex}`);
        bindParams.push(filters.divisionId);
        paramIndex++;
      }

      if (filters.companyId) {
        conditions.push(`bu.COMPANY_ID = :${paramIndex}`);
        bindParams.push(filters.companyId);
        paramIndex++;
      }

      if (filters.orgStructureId) {
        conditions.push(`bu.ORG_STRUCTURE_ID = :${paramIndex}`);
        bindParams.push(filters.orgStructureId);
        paramIndex++;
      }

      if (filters.status) {
        conditions.push(`bu.STATUS = :${paramIndex}`);
        bindParams.push(filters.status);
        paramIndex++;
      }

      // Search across unit name, code, head of unit, division name, and company name
      if (filters.search) {
        const searchValue = `%${filters.search}%`;
        conditions.push(`(
          UPPER(bu.UNIT_CODE) LIKE UPPER(:${paramIndex}) OR
          UPPER(bu.UNIT_NAME_EN) LIKE UPPER(:${paramIndex + 1}) OR
          UPPER(bu.UNIT_NAME_AR) LIKE UPPER(:${paramIndex + 2}) OR
          UPPER(bu.HEAD_OF_UNIT) LIKE UPPER(:${paramIndex + 3}) OR
          UPPER(d.DIVISION_NAME_EN) LIKE UPPER(:${paramIndex + 4}) OR
          UPPER(c.COMPANY_NAME_EN) LIKE UPPER(:${paramIndex + 5})
        )`);
        bindParams.push(searchValue);
        bindParams.push(searchValue);
        bindParams.push(searchValue);
        bindParams.push(searchValue);
        bindParams.push(searchValue);
        bindParams.push(searchValue);
        paramIndex += 6;
      }

      const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

      countQuery += whereClause;
      dataQuery += whereClause;

      dataQuery += ` ORDER BY bu.CREATED_DATE DESC, bu.BUSINESS_UNIT_ID DESC`;

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
      const businessUnits = result.rows || [];

      if (pagination && pagination.page && pagination.pageSize) {
        return {
          businessUnits: businessUnits,
          total: totalCount
        };
      }

      return businessUnits;
    } catch (error) {
      console.error('Error in findAll:', error);
      throw new Error(`Failed to fetch business units: ${error.message}`);
    }
  }

  /**
   * Get a single business unit by ID
   * @param {number} businessUnitId - Business Unit ID
   * @returns {Promise<Object|null>} Business unit object or null
   */
  static async findById(businessUnitId) {
    try {
      const query = `SELECT 
        bu.BUSINESS_UNIT_ID,
        bu.UNIT_CODE,
        bu.STATUS,
        bu.UNIT_NAME_EN,
        bu.UNIT_NAME_AR,
        bu.COMPANY_ID,
        bu.DIVISION_ID,
        c.COMPANY_NAME_EN,
        c.COMPANY_NAME_AR,
        d.DIVISION_NAME_EN,
        d.DIVISION_NAME_AR,
        bu.ORG_STRUCTURE_ID,
        s.STRUCTURE_NAME AS ORG_STRUCTURE_NAME,
        bu.HEAD_OF_UNIT,
        bu.HEAD_EMAIL,
        bu.HEAD_PHONE,
        bu.LOCATION,
        bu.CITY,
        bu.ESTABLISHED_DATE,
        bu.BUSINESS_FOCUS,
        bu.TOTAL_EMPLOYEES,
        bu.TOTAL_DEPARTMENTS,
        bu.ANNUAL_BUDGET_KWD,
        bu.DESCRIPTION,
        bu.CREATED_BY,
        bu.CREATED_DATE,
        bu.LAST_UPDATED_BY,
        bu.LAST_UPDATED_DATE,
        bu.LAST_UPDATE_LOGIN
      FROM ${this.TABLE_NAME} bu
      LEFT JOIN ENT.DIVISIONS d ON bu.DIVISION_ID = d.DIVISION_ID
      LEFT JOIN ENT.COMPANIES c ON bu.COMPANY_ID = c.COMPANY_ID
      LEFT JOIN ENT.HR_ORG_STRUCTURES s ON bu.ORG_STRUCTURE_ID = s.STRUCTURE_ID
      WHERE bu.BUSINESS_UNIT_ID = :1`;

      const result = await this.executeQuery(query, [businessUnitId]);
      
      if (result.rows && result.rows.length > 0) {
        return result.rows[0];
      }
      return null;
    } catch (error) {
      console.error('Error in findById:', error);
      throw new Error(`Failed to fetch business unit: ${error.message}`);
    }
  }

  /**
   * Create a new business unit
   * @param {Object} data - Business unit data
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<Object>} Created business unit
   */
  static async create(data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        // Fetch division to get company and org structure info if only DIVISION_ID is provided
        let companyId = data.COMPANY_ID;
        let companyNameEn = data.COMPANY_NAME_EN;
        let companyNameAr = data.COMPANY_NAME_AR;
        let orgStructureId = data.ORG_STRUCTURE_ID;
        let orgStructureName = data.ORG_STRUCTURE_NAME;
        let divisionNameEn = data.DIVISION_NAME_EN;
        let divisionNameAr = data.DIVISION_NAME_AR;

        if (data.DIVISION_ID && !companyId) {
          const division = await DivisionModel.findById(data.DIVISION_ID);
          if (!division) {
            throw new Error(`Division with ID ${data.DIVISION_ID} not found`);
          }
          companyId = division.company_id || division.COMPANY_ID;
          companyNameEn = division.company_name_en || division.COMPANY_NAME_EN;
          companyNameAr = division.company_name_ar || division.COMPANY_NAME_AR;
          orgStructureId = division.org_structure_id || division.ORG_STRUCTURE_ID;
          orgStructureName = division.org_structure_name || division.ORG_STRUCTURE_NAME;
          divisionNameEn = division.division_name_en || division.DIVISION_NAME_EN;
          divisionNameAr = division.division_name_ar || division.DIVISION_NAME_AR;
        }

        // Get next BUSINESS_UNIT_ID from sequence
        let businessUnitId;
        try {
          const seqQuery = `SELECT ENT.BUSINESS_UNIT_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`;
          const seqResult = await connection.execute(seqQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          businessUnitId = seqResult.rows[0].NEXT_ID;
        } catch (seqError) {
          const maxQuery = `SELECT NVL(MAX(BUSINESS_UNIT_ID), 0) + 1 AS NEXT_ID FROM ${this.TABLE_NAME}`;
          const maxResult = await connection.execute(maxQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          businessUnitId = maxResult.rows[0].NEXT_ID;
        }

        const now = new Date();
        const query = `INSERT INTO ${this.TABLE_NAME} (
          BUSINESS_UNIT_ID,
          UNIT_CODE,
          STATUS,
          UNIT_NAME_EN,
          UNIT_NAME_AR,
          COMPANY_ID,
          DIVISION_ID,
          COMPANY_NAME_EN,
          COMPANY_NAME_AR,
          DIVISION_NAME_EN,
          DIVISION_NAME_AR,
          ORG_STRUCTURE_ID,
          ORG_STRUCTURE_NAME,
          HEAD_OF_UNIT,
          HEAD_EMAIL,
          HEAD_PHONE,
          LOCATION,
          CITY,
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
          :1, :2, :3, :4, :5, :6, :7, :8, :9, :10, :11, :12, :13, :14, :15, :16, :17, :18, :19, :20, :21, :22, :23, :24, :25, :26, :27, :28, :29
        )`;

        // Fetch ORG_STRUCTURE_NAME if ORG_STRUCTURE_ID is available but name is not
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
          businessUnitId,
          data.UNIT_CODE || null,
          data.STATUS || 'ACTIVE',
          data.UNIT_NAME_EN || null,
          data.UNIT_NAME_AR || null,
          companyId || null,
          data.DIVISION_ID || null,
          companyNameEn || null,
          companyNameAr || null,
          divisionNameEn || null,
          divisionNameAr || null,
          orgStructureId || null,
          orgStructureName || null,
          data.HEAD_OF_UNIT || null,
          data.HEAD_EMAIL || null,
          data.HEAD_PHONE || null,
          data.LOCATION || null,
          data.CITY || null,
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
          bu.BUSINESS_UNIT_ID,
          bu.UNIT_CODE,
          bu.STATUS,
          bu.UNIT_NAME_EN,
          bu.UNIT_NAME_AR,
          bu.COMPANY_ID,
          bu.DIVISION_ID,
          c.COMPANY_NAME_EN,
          c.COMPANY_NAME_AR,
          d.DIVISION_NAME_EN,
          d.DIVISION_NAME_AR,
          bu.ORG_STRUCTURE_ID,
          s.STRUCTURE_NAME AS ORG_STRUCTURE_NAME,
          bu.HEAD_OF_UNIT,
          bu.HEAD_EMAIL,
          bu.HEAD_PHONE,
          bu.LOCATION,
          bu.CITY,
          bu.ESTABLISHED_DATE,
          bu.BUSINESS_FOCUS,
          bu.TOTAL_EMPLOYEES,
          bu.TOTAL_DEPARTMENTS,
          bu.ANNUAL_BUDGET_KWD,
          bu.DESCRIPTION,
          bu.CREATED_BY,
          bu.CREATED_DATE,
          bu.LAST_UPDATED_BY,
          bu.LAST_UPDATED_DATE,
          bu.LAST_UPDATE_LOGIN
        FROM ${this.TABLE_NAME} bu
        LEFT JOIN ENT.DIVISIONS d ON bu.DIVISION_ID = d.DIVISION_ID
        LEFT JOIN ENT.COMPANIES c ON bu.COMPANY_ID = c.COMPANY_ID
        LEFT JOIN ENT.HR_ORG_STRUCTURES s ON bu.ORG_STRUCTURE_ID = s.STRUCTURE_ID
        WHERE bu.BUSINESS_UNIT_ID = :1`;
        const selectResult = await connection.execute(selectQuery, [businessUnitId], {
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
        const columns = columnMatch ? columnMatch[1] : 'UNIT_CODE';
        
        const userMessage = `A business unit with the same ${columns} already exists.`;
        
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
        constraintError.userMessage = 'The referenced division, company, or organization structure does not exist.';
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
      
      throw new Error(`Failed to create business unit: ${error.message}`);
    }
  }

  /**
   * Update an existing business unit
   * @param {number} businessUnitId - Business Unit ID
   * @param {Object} data - Updated data
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<Object>} Updated business unit
   */
  static async update(businessUnitId, data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        // If DIVISION_ID is updated, fetch division info
        let companyId = data.COMPANY_ID;
        let companyNameEn = data.COMPANY_NAME_EN;
        let companyNameAr = data.COMPANY_NAME_AR;
        let orgStructureId = data.ORG_STRUCTURE_ID;
        let orgStructureName = data.ORG_STRUCTURE_NAME;
        let divisionNameEn = data.DIVISION_NAME_EN;
        let divisionNameAr = data.DIVISION_NAME_AR;

        if (data.DIVISION_ID !== undefined && !companyId) {
          const division = await DivisionModel.findById(data.DIVISION_ID);
          if (division) {
            companyId = division.company_id || division.COMPANY_ID;
            companyNameEn = division.company_name_en || division.COMPANY_NAME_EN;
            companyNameAr = division.company_name_ar || division.COMPANY_NAME_AR;
            orgStructureId = division.org_structure_id || division.ORG_STRUCTURE_ID;
            orgStructureName = division.org_structure_name || division.ORG_STRUCTURE_NAME;
            divisionNameEn = division.division_name_en || division.DIVISION_NAME_EN;
            divisionNameAr = division.division_name_ar || division.DIVISION_NAME_AR;
          }
        }

        const updateFields = [];
        const bindParams = [];
        let paramIndex = 1;

        if (data.UNIT_CODE !== undefined) {
          updateFields.push(`UNIT_CODE = :${paramIndex}`);
          bindParams.push(data.UNIT_CODE);
          paramIndex++;
        }
        if (data.STATUS !== undefined) {
          updateFields.push(`STATUS = :${paramIndex}`);
          bindParams.push(data.STATUS);
          paramIndex++;
        }
        if (data.UNIT_NAME_EN !== undefined) {
          updateFields.push(`UNIT_NAME_EN = :${paramIndex}`);
          bindParams.push(data.UNIT_NAME_EN);
          paramIndex++;
        }
        if (data.UNIT_NAME_AR !== undefined) {
          updateFields.push(`UNIT_NAME_AR = :${paramIndex}`);
          bindParams.push(data.UNIT_NAME_AR);
          paramIndex++;
        }
        if (data.DIVISION_ID !== undefined) {
          updateFields.push(`DIVISION_ID = :${paramIndex}`);
          bindParams.push(data.DIVISION_ID);
          paramIndex++;
        }
        if (companyId !== undefined) {
          updateFields.push(`COMPANY_ID = :${paramIndex}`);
          bindParams.push(companyId);
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
        if (divisionNameEn !== undefined) {
          updateFields.push(`DIVISION_NAME_EN = :${paramIndex}`);
          bindParams.push(divisionNameEn);
          paramIndex++;
        }
        if (divisionNameAr !== undefined) {
          updateFields.push(`DIVISION_NAME_AR = :${paramIndex}`);
          bindParams.push(divisionNameAr);
          paramIndex++;
        }
        if (orgStructureId !== undefined) {
          updateFields.push(`ORG_STRUCTURE_ID = :${paramIndex}`);
          bindParams.push(orgStructureId);
          paramIndex++;
        }
        if (orgStructureName !== undefined) {
          updateFields.push(`ORG_STRUCTURE_NAME = :${paramIndex}`);
          bindParams.push(orgStructureName);
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
        if (data.HEAD_OF_UNIT !== undefined) {
          updateFields.push(`HEAD_OF_UNIT = :${paramIndex}`);
          bindParams.push(data.HEAD_OF_UNIT);
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
        bindParams.push(businessUnitId);
        const query = `UPDATE ${this.TABLE_NAME} SET ${updateFields.join(', ')} WHERE BUSINESS_UNIT_ID = :${paramIndex}`;

        await connection.execute(query, bindParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        // Fetch and return the updated record
        const selectQuery = `SELECT 
          bu.BUSINESS_UNIT_ID,
          bu.UNIT_CODE,
          bu.STATUS,
          bu.UNIT_NAME_EN,
          bu.UNIT_NAME_AR,
          bu.COMPANY_ID,
          bu.DIVISION_ID,
          c.COMPANY_NAME_EN,
          c.COMPANY_NAME_AR,
          d.DIVISION_NAME_EN,
          d.DIVISION_NAME_AR,
          bu.ORG_STRUCTURE_ID,
          s.STRUCTURE_NAME AS ORG_STRUCTURE_NAME,
          bu.HEAD_OF_UNIT,
          bu.HEAD_EMAIL,
          bu.HEAD_PHONE,
          bu.LOCATION,
          bu.CITY,
          bu.ESTABLISHED_DATE,
          bu.BUSINESS_FOCUS,
          bu.TOTAL_EMPLOYEES,
          bu.TOTAL_DEPARTMENTS,
          bu.ANNUAL_BUDGET_KWD,
          bu.DESCRIPTION,
          bu.CREATED_BY,
          bu.CREATED_DATE,
          bu.LAST_UPDATED_BY,
          bu.LAST_UPDATED_DATE,
          bu.LAST_UPDATE_LOGIN
        FROM ${this.TABLE_NAME} bu
        LEFT JOIN ENT.DIVISIONS d ON bu.DIVISION_ID = d.DIVISION_ID
        LEFT JOIN ENT.COMPANIES c ON bu.COMPANY_ID = c.COMPANY_ID
        LEFT JOIN ENT.HR_ORG_STRUCTURES s ON bu.ORG_STRUCTURE_ID = s.STRUCTURE_ID
        WHERE bu.BUSINESS_UNIT_ID = :1`;
        const selectResult = await connection.execute(selectQuery, [businessUnitId], {
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
        const columns = columnMatch ? columnMatch[1] : 'UNIT_CODE';
        
        const userMessage = `A business unit with the same ${columns} already exists.`;
        
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
        constraintError.userMessage = 'The referenced division, company, or organization structure does not exist.';
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
      
      throw new Error(`Failed to update business unit: ${error.message}`);
    }
  }

  /**
   * Delete a business unit (soft delete by setting STATUS = 'INACTIVE')
   * @param {number} businessUnitId - Business Unit ID
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<boolean>} Success status
   */
  static async softDelete(businessUnitId, userId) {
    try {
      const result = await this.executeWithTransaction(async (connection) => {
        const query = `UPDATE ${this.TABLE_NAME} 
          SET STATUS = 'INACTIVE',
              LAST_UPDATED_BY = :1,
              LAST_UPDATED_DATE = :2
          WHERE BUSINESS_UNIT_ID = :3`;

        const updateResult = await connection.execute(query, [userId || 'SYSTEM', new Date(), businessUnitId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        const rowsAffected = updateResult.rowsAffected || updateResult.rowCount || 0;
        if (rowsAffected === 0) {
          throw new Error(`No business unit found with ID: ${businessUnitId}`);
        }
        
        return { ...updateResult, rowsAffected };
      });
      
      console.log(`Soft delete successful for business unit ID: ${businessUnitId}, rows affected: ${result.rowsAffected}`);
      return true;
    } catch (error) {
      console.error('Error in softDelete:', error);
      throw new Error(`Failed to delete business unit: ${error.message}`);
    }
  }

  /**
   * Hard delete a business unit (permanent removal)
   * @param {number} businessUnitId - Business Unit ID
   * @returns {Promise<Object>} Success status
   */
  static async hardDelete(businessUnitId) {
    try {
      const result = await this.executeWithTransaction(async (connection) => {
        const query = `DELETE FROM ${this.TABLE_NAME} WHERE BUSINESS_UNIT_ID = :1`;
        const deleteResult = await connection.execute(query, [businessUnitId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        const rowsAffected = deleteResult.rowsAffected || deleteResult.rowCount || 0;
        if (rowsAffected === 0) {
          throw new Error(`No business unit found with ID: ${businessUnitId}`);
        }
        
        return { ...deleteResult, rowsAffected };
      });
      
      console.log(`Hard delete successful for business unit ID: ${businessUnitId}, rows affected: ${result.rowsAffected}`);
      return { success: true };
    } catch (error) {
      console.error('Error in hardDelete:', error);
      
      if (error.errorNum === 2292 || error.message?.includes('ORA-02292') || error.message?.includes('integrity constraint')) {
        const constraintName = error.message?.match(/\(([^)]+)\)/)?.[1] || 'UNKNOWN';
        const constraintError = new Error(`Cannot delete business unit: This business unit is referenced by other records in the database.`);
        constraintError.errorNum = 2292;
        constraintError.code = 'FOREIGN_KEY_CONSTRAINT';
        constraintError.constraint = constraintName;
        constraintError.suggestion = 'Use soft delete (?soft=true) to deactivate this business unit instead of permanently deleting it.';
        throw constraintError;
      }
      
      throw new Error(`Failed to delete business unit: ${error.message}`);
    }
  }
}

export default BusinessUnitModel;

