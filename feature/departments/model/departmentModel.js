import db from '../../../config/db.js';
import oracledb from 'oracledb';
import BusinessUnitModel from '../../business_units/model/businessUnitModel.js';

/**
 * Department Model
 * Handles all database operations for ENT.DEPARTMENTS table
 */
class DepartmentModel {
  static TABLE_NAME = 'ENT.DEPARTMENTS';

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
   * Get all departments
   * @param {Object} filters - Optional filters (departmentId, businessUnitId, divisionId, companyId, orgStructureId, status, search, pagination)
   * @param {Object} filters.pagination - Pagination options {page, pageSize}
   * @returns {Promise<Object|Array>} Object with {departments, total} if paginated, or Array of departments
   */
  static async findAll(filters = {}) {
    try {
      let countQuery = `SELECT COUNT(*) AS total FROM ${this.TABLE_NAME} dept
      LEFT JOIN ENT.BUSINESS_UNIT bu ON dept.BUSINESS_UNIT_ID = bu.BUSINESS_UNIT_ID
      LEFT JOIN ENT.DIVISIONS d ON dept.DIVISION_ID = d.DIVISION_ID
      LEFT JOIN ENT.COMPANIES c ON dept.COMPANY_ID = c.COMPANY_ID`;
      let dataQuery = `SELECT 
        dept.DEPARTMENT_ID,
        dept.DEPARTMENT_CODE,
        dept.STATUS,
        dept.DEPARTMENT_NAME_EN,
        dept.DEPARTMENT_NAME_AR,
        dept.BUSINESS_UNIT_ID,
        bu.UNIT_NAME_EN AS BUSINESS_UNIT_NAME_EN,
        bu.UNIT_NAME_AR AS BUSINESS_UNIT_NAME_AR,
        dept.DIVISION_ID,
        d.DIVISION_NAME_EN,
        d.DIVISION_NAME_AR,
        dept.COMPANY_ID,
        c.COMPANY_NAME_EN,
        c.COMPANY_NAME_AR,
        dept.ORG_STRUCTURE_ID,
        s.STRUCTURE_NAME AS ORG_STRUCTURE_NAME,
        dept.HEAD_OF_DEPARTMENT,
        dept.HEAD_EMAIL,
        dept.HEAD_PHONE,
        dept.TOTAL_EMPLOYEES,
        dept.TOTAL_SUB_DEPARTMENTS,
        dept.TOTAL_BUDGET,
        dept.DESCRIPTION,
        dept.CREATED_BY,
        dept.CREATED_DATE,
        dept.LAST_UPDATED_BY,
        dept.LAST_UPDATED_DATE,
        dept.LAST_UPDATE_LOGIN
      FROM ${this.TABLE_NAME} dept
      LEFT JOIN ENT.BUSINESS_UNIT bu ON dept.BUSINESS_UNIT_ID = bu.BUSINESS_UNIT_ID
      LEFT JOIN ENT.DIVISIONS d ON dept.DIVISION_ID = d.DIVISION_ID
      LEFT JOIN ENT.COMPANIES c ON dept.COMPANY_ID = c.COMPANY_ID
      LEFT JOIN ENT.HR_ORG_STRUCTURES s ON dept.ORG_STRUCTURE_ID = s.STRUCTURE_ID`;

      const conditions = [];
      const bindParams = [];
      let paramIndex = 1;

      if (filters.departmentId) {
        conditions.push(`dept.DEPARTMENT_ID = :${paramIndex}`);
        bindParams.push(filters.departmentId);
        paramIndex++;
      }

      if (filters.businessUnitId) {
        conditions.push(`dept.BUSINESS_UNIT_ID = :${paramIndex}`);
        bindParams.push(filters.businessUnitId);
        paramIndex++;
      }

      if (filters.divisionId) {
        conditions.push(`dept.DIVISION_ID = :${paramIndex}`);
        bindParams.push(filters.divisionId);
        paramIndex++;
      }

      if (filters.companyId) {
        conditions.push(`dept.COMPANY_ID = :${paramIndex}`);
        bindParams.push(filters.companyId);
        paramIndex++;
      }

      if (filters.orgStructureId) {
        conditions.push(`dept.ORG_STRUCTURE_ID = :${paramIndex}`);
        bindParams.push(filters.orgStructureId);
        paramIndex++;
      }

      if (filters.status) {
        conditions.push(`dept.STATUS = :${paramIndex}`);
        bindParams.push(filters.status);
        paramIndex++;
      }

      // Search across department name, code, head of department, business unit name, division name, and company name
      if (filters.search) {
        const searchValue = `%${filters.search}%`;
        conditions.push(`(
          UPPER(dept.DEPARTMENT_CODE) LIKE UPPER(:${paramIndex}) OR
          UPPER(dept.DEPARTMENT_NAME_EN) LIKE UPPER(:${paramIndex + 1}) OR
          UPPER(dept.DEPARTMENT_NAME_AR) LIKE UPPER(:${paramIndex + 2}) OR
          UPPER(dept.HEAD_OF_DEPARTMENT) LIKE UPPER(:${paramIndex + 3}) OR
          UPPER(bu.UNIT_NAME_EN) LIKE UPPER(:${paramIndex + 4}) OR
          UPPER(d.DIVISION_NAME_EN) LIKE UPPER(:${paramIndex + 5}) OR
          UPPER(c.COMPANY_NAME_EN) LIKE UPPER(:${paramIndex + 6})
        )`);
        bindParams.push(searchValue);
        bindParams.push(searchValue);
        bindParams.push(searchValue);
        bindParams.push(searchValue);
        bindParams.push(searchValue);
        bindParams.push(searchValue);
        bindParams.push(searchValue);
        paramIndex += 7;
      }

      const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

      countQuery += whereClause;
      dataQuery += whereClause;

      dataQuery += ` ORDER BY dept.CREATED_DATE DESC, dept.DEPARTMENT_ID DESC`;

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
      const departments = result.rows || [];

      if (pagination && pagination.page && pagination.pageSize) {
        return {
          departments: departments,
          total: totalCount
        };
      }

      return departments;
    } catch (error) {
      console.error('Error in findAll:', error);
      throw new Error(`Failed to fetch departments: ${error.message}`);
    }
  }

  /**
   * Get a single department by ID
   * @param {number} departmentId - Department ID
   * @returns {Promise<Object|null>} Department object or null
   */
  static async findById(departmentId) {
    try {
      const query = `SELECT 
        dept.DEPARTMENT_ID,
        dept.DEPARTMENT_CODE,
        dept.STATUS,
        dept.DEPARTMENT_NAME_EN,
        dept.DEPARTMENT_NAME_AR,
        dept.BUSINESS_UNIT_ID,
        bu.UNIT_NAME_EN AS BUSINESS_UNIT_NAME_EN,
        bu.UNIT_NAME_AR AS BUSINESS_UNIT_NAME_AR,
        dept.DIVISION_ID,
        d.DIVISION_NAME_EN,
        d.DIVISION_NAME_AR,
        dept.COMPANY_ID,
        c.COMPANY_NAME_EN,
        c.COMPANY_NAME_AR,
        dept.ORG_STRUCTURE_ID,
        s.STRUCTURE_NAME AS ORG_STRUCTURE_NAME,
        dept.HEAD_OF_DEPARTMENT,
        dept.HEAD_EMAIL,
        dept.HEAD_PHONE,
        dept.TOTAL_EMPLOYEES,
        dept.TOTAL_SUB_DEPARTMENTS,
        dept.TOTAL_BUDGET,
        dept.DESCRIPTION,
        dept.CREATED_BY,
        dept.CREATED_DATE,
        dept.LAST_UPDATED_BY,
        dept.LAST_UPDATED_DATE,
        dept.LAST_UPDATE_LOGIN
      FROM ${this.TABLE_NAME} dept
      LEFT JOIN ENT.BUSINESS_UNIT bu ON dept.BUSINESS_UNIT_ID = bu.BUSINESS_UNIT_ID
      LEFT JOIN ENT.DIVISIONS d ON dept.DIVISION_ID = d.DIVISION_ID
      LEFT JOIN ENT.COMPANIES c ON dept.COMPANY_ID = c.COMPANY_ID
      LEFT JOIN ENT.HR_ORG_STRUCTURES s ON dept.ORG_STRUCTURE_ID = s.STRUCTURE_ID
      WHERE dept.DEPARTMENT_ID = :1`;

      const result = await this.executeQuery(query, [departmentId]);
      
      if (result.rows && result.rows.length > 0) {
        return result.rows[0];
      }
      return null;
    } catch (error) {
      console.error('Error in findById:', error);
      throw new Error(`Failed to fetch department: ${error.message}`);
    }
  }

  /**
   * Create a new department
   * @param {Object} data - Department data
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<Object>} Created department
   */
  static async create(data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        // Fetch business unit to get division, company, and org structure info if only BUSINESS_UNIT_ID is provided
        let businessUnitId = data.BUSINESS_UNIT_ID;
        let businessUnitNameEn = data.BUSINESS_UNIT_NAME_EN;
        let businessUnitNameAr = data.BUSINESS_UNIT_NAME_AR;
        let divisionId = data.DIVISION_ID;
        let divisionNameEn = data.DIVISION_NAME_EN;
        let divisionNameAr = data.DIVISION_NAME_AR;
        let companyId = data.COMPANY_ID;
        let companyNameEn = data.COMPANY_NAME_EN;
        let companyNameAr = data.COMPANY_NAME_AR;
        let orgStructureId = data.ORG_STRUCTURE_ID;
        let orgStructureName = data.ORG_STRUCTURE_NAME;

        if (data.BUSINESS_UNIT_ID && (!divisionId || !companyId || !orgStructureId)) {
          const businessUnit = await BusinessUnitModel.findById(data.BUSINESS_UNIT_ID);
          if (!businessUnit) {
            throw new Error(`Business unit with ID ${data.BUSINESS_UNIT_ID} not found`);
          }
          
          // Get business unit info
          businessUnitNameEn = businessUnit.unit_name_en || businessUnit.UNIT_NAME_EN;
          businessUnitNameAr = businessUnit.unit_name_ar || businessUnit.UNIT_NAME_AR;
          
          // Get division info from business unit
          divisionId = businessUnit.division_id || businessUnit.DIVISION_ID;
          divisionNameEn = businessUnit.division_name_en || businessUnit.DIVISION_NAME_EN;
          divisionNameAr = businessUnit.division_name_ar || businessUnit.DIVISION_NAME_AR;
          
          // Get company info from business unit
          companyId = businessUnit.company_id || businessUnit.COMPANY_ID;
          companyNameEn = businessUnit.company_name_en || businessUnit.COMPANY_NAME_EN;
          companyNameAr = businessUnit.company_name_ar || businessUnit.COMPANY_NAME_AR;
          
          // Get org structure info from business unit
          orgStructureId = businessUnit.org_structure_id || businessUnit.ORG_STRUCTURE_ID;
          orgStructureName = businessUnit.org_structure_name || businessUnit.ORG_STRUCTURE_NAME;
        }

        // Get next DEPARTMENT_ID from sequence
        let departmentId;
        try {
          const seqQuery = `SELECT ENT.DEPARTMENTS_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`;
          const seqResult = await connection.execute(seqQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          departmentId = seqResult.rows[0].NEXT_ID;
        } catch (seqError) {
          const maxQuery = `SELECT NVL(MAX(DEPARTMENT_ID), 0) + 1 AS NEXT_ID FROM ${this.TABLE_NAME}`;
          const maxResult = await connection.execute(maxQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          departmentId = maxResult.rows[0].NEXT_ID;
        }

        const now = new Date();
        const query = `INSERT INTO ${this.TABLE_NAME} (
          DEPARTMENT_ID,
          DEPARTMENT_CODE,
          STATUS,
          DEPARTMENT_NAME_EN,
          DEPARTMENT_NAME_AR,
          BUSINESS_UNIT_ID,
          BUSINESS_UNIT_NAME_EN,
          BUSINESS_UNIT_NAME_AR,
          DIVISION_ID,
          DIVISION_NAME_EN,
          DIVISION_NAME_AR,
          COMPANY_ID,
          COMPANY_NAME_EN,
          COMPANY_NAME_AR,
          ORG_STRUCTURE_ID,
          ORG_STRUCTURE_NAME,
          HEAD_OF_DEPARTMENT,
          HEAD_EMAIL,
          HEAD_PHONE,
          TOTAL_EMPLOYEES,
          TOTAL_SUB_DEPARTMENTS,
          TOTAL_BUDGET,
          DESCRIPTION,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATED_DATE,
          LAST_UPDATE_LOGIN
        ) VALUES (
          :1, :2, :3, :4, :5, :6, :7, :8, :9, :10, :11, :12, :13, :14, :15, :16, :17, :18, :19, :20, :21, :22, :23, :24, :25, :26, :27, :28
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
          departmentId,
          data.DEPARTMENT_CODE || null,
          data.STATUS || 'ACTIVE',
          data.DEPARTMENT_NAME_EN || null,
          data.DEPARTMENT_NAME_AR || null,
          businessUnitId || null,
          businessUnitNameEn || null,
          businessUnitNameAr || null,
          divisionId || null,
          divisionNameEn || null,
          divisionNameAr || null,
          companyId || null,
          companyNameEn || null,
          companyNameAr || null,
          orgStructureId || null,
          orgStructureName || null,
          data.HEAD_OF_DEPARTMENT || null,
          data.HEAD_EMAIL || null,
          data.HEAD_PHONE || null,
          data.TOTAL_EMPLOYEES || null,
          data.TOTAL_SUB_DEPARTMENTS || null,
          data.TOTAL_BUDGET || null,
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
          dept.DEPARTMENT_ID,
          dept.DEPARTMENT_CODE,
          dept.STATUS,
          dept.DEPARTMENT_NAME_EN,
          dept.DEPARTMENT_NAME_AR,
          dept.BUSINESS_UNIT_ID,
          bu.UNIT_NAME_EN AS BUSINESS_UNIT_NAME_EN,
          bu.UNIT_NAME_AR AS BUSINESS_UNIT_NAME_AR,
          dept.DIVISION_ID,
          d.DIVISION_NAME_EN,
          d.DIVISION_NAME_AR,
          dept.COMPANY_ID,
          c.COMPANY_NAME_EN,
          c.COMPANY_NAME_AR,
          dept.ORG_STRUCTURE_ID,
          s.STRUCTURE_NAME AS ORG_STRUCTURE_NAME,
          dept.HEAD_OF_DEPARTMENT,
          dept.HEAD_EMAIL,
          dept.HEAD_PHONE,
          dept.TOTAL_EMPLOYEES,
          dept.TOTAL_SUB_DEPARTMENTS,
          dept.TOTAL_BUDGET,
          dept.DESCRIPTION,
          dept.CREATED_BY,
          dept.CREATED_DATE,
          dept.LAST_UPDATED_BY,
          dept.LAST_UPDATED_DATE,
          dept.LAST_UPDATE_LOGIN
        FROM ${this.TABLE_NAME} dept
        LEFT JOIN ENT.BUSINESS_UNIT bu ON dept.BUSINESS_UNIT_ID = bu.BUSINESS_UNIT_ID
        LEFT JOIN ENT.DIVISIONS d ON dept.DIVISION_ID = d.DIVISION_ID
        LEFT JOIN ENT.COMPANIES c ON dept.COMPANY_ID = c.COMPANY_ID
        LEFT JOIN ENT.HR_ORG_STRUCTURES s ON dept.ORG_STRUCTURE_ID = s.STRUCTURE_ID
        WHERE dept.DEPARTMENT_ID = :1`;
        const selectResult = await connection.execute(selectQuery, [departmentId], {
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
        const columns = columnMatch ? columnMatch[1] : 'DEPARTMENT_CODE';
        
        const userMessage = `A department with the same ${columns} already exists.`;
        
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
        constraintError.userMessage = 'The referenced business unit, division, company, or organization structure does not exist.';
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
      
      throw new Error(`Failed to create department: ${error.message}`);
    }
  }

  /**
   * Update an existing department
   * @param {number} departmentId - Department ID
   * @param {Object} data - Updated data
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<Object>} Updated department
   */
  static async update(departmentId, data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        // If BUSINESS_UNIT_ID is updated, fetch business unit info
        let businessUnitId = data.BUSINESS_UNIT_ID;
        let businessUnitNameEn = data.BUSINESS_UNIT_NAME_EN;
        let businessUnitNameAr = data.BUSINESS_UNIT_NAME_AR;
        let divisionId = data.DIVISION_ID;
        let divisionNameEn = data.DIVISION_NAME_EN;
        let divisionNameAr = data.DIVISION_NAME_AR;
        let companyId = data.COMPANY_ID;
        let companyNameEn = data.COMPANY_NAME_EN;
        let companyNameAr = data.COMPANY_NAME_AR;
        let orgStructureId = data.ORG_STRUCTURE_ID;
        let orgStructureName = data.ORG_STRUCTURE_NAME;

        if (data.BUSINESS_UNIT_ID !== undefined && (!divisionId || !companyId || !orgStructureId)) {
          const businessUnit = await BusinessUnitModel.findById(data.BUSINESS_UNIT_ID);
          if (businessUnit) {
            businessUnitNameEn = businessUnit.unit_name_en || businessUnit.UNIT_NAME_EN;
            businessUnitNameAr = businessUnit.unit_name_ar || businessUnit.UNIT_NAME_AR;
            divisionId = businessUnit.division_id || businessUnit.DIVISION_ID;
            divisionNameEn = businessUnit.division_name_en || businessUnit.DIVISION_NAME_EN;
            divisionNameAr = businessUnit.division_name_ar || businessUnit.DIVISION_NAME_AR;
            companyId = businessUnit.company_id || businessUnit.COMPANY_ID;
            companyNameEn = businessUnit.company_name_en || businessUnit.COMPANY_NAME_EN;
            companyNameAr = businessUnit.company_name_ar || businessUnit.COMPANY_NAME_AR;
            orgStructureId = businessUnit.org_structure_id || businessUnit.ORG_STRUCTURE_ID;
            orgStructureName = businessUnit.org_structure_name || businessUnit.ORG_STRUCTURE_NAME;
          }
        }

        const updateFields = [];
        const bindParams = [];
        let paramIndex = 1;

        if (data.DEPARTMENT_CODE !== undefined) {
          updateFields.push(`DEPARTMENT_CODE = :${paramIndex}`);
          bindParams.push(data.DEPARTMENT_CODE);
          paramIndex++;
        }
        if (data.STATUS !== undefined) {
          updateFields.push(`STATUS = :${paramIndex}`);
          bindParams.push(data.STATUS);
          paramIndex++;
        }
        if (data.DEPARTMENT_NAME_EN !== undefined) {
          updateFields.push(`DEPARTMENT_NAME_EN = :${paramIndex}`);
          bindParams.push(data.DEPARTMENT_NAME_EN);
          paramIndex++;
        }
        if (data.DEPARTMENT_NAME_AR !== undefined) {
          updateFields.push(`DEPARTMENT_NAME_AR = :${paramIndex}`);
          bindParams.push(data.DEPARTMENT_NAME_AR);
          paramIndex++;
        }
        if (businessUnitId !== undefined) {
          updateFields.push(`BUSINESS_UNIT_ID = :${paramIndex}`);
          bindParams.push(businessUnitId);
          paramIndex++;
        }
        if (businessUnitNameEn !== undefined) {
          updateFields.push(`BUSINESS_UNIT_NAME_EN = :${paramIndex}`);
          bindParams.push(businessUnitNameEn);
          paramIndex++;
        }
        if (businessUnitNameAr !== undefined) {
          updateFields.push(`BUSINESS_UNIT_NAME_AR = :${paramIndex}`);
          bindParams.push(businessUnitNameAr);
          paramIndex++;
        }
        if (divisionId !== undefined) {
          updateFields.push(`DIVISION_ID = :${paramIndex}`);
          bindParams.push(divisionId);
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
        if (data.HEAD_OF_DEPARTMENT !== undefined) {
          updateFields.push(`HEAD_OF_DEPARTMENT = :${paramIndex}`);
          bindParams.push(data.HEAD_OF_DEPARTMENT);
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
        if (data.TOTAL_EMPLOYEES !== undefined) {
          updateFields.push(`TOTAL_EMPLOYEES = :${paramIndex}`);
          bindParams.push(data.TOTAL_EMPLOYEES);
          paramIndex++;
        }
        if (data.TOTAL_SUB_DEPARTMENTS !== undefined) {
          updateFields.push(`TOTAL_SUB_DEPARTMENTS = :${paramIndex}`);
          bindParams.push(data.TOTAL_SUB_DEPARTMENTS);
          paramIndex++;
        }
        if (data.TOTAL_BUDGET !== undefined) {
          updateFields.push(`TOTAL_BUDGET = :${paramIndex}`);
          bindParams.push(data.TOTAL_BUDGET);
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
        bindParams.push(departmentId);
        const query = `UPDATE ${this.TABLE_NAME} SET ${updateFields.join(', ')} WHERE DEPARTMENT_ID = :${paramIndex}`;

        await connection.execute(query, bindParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        // Fetch and return the updated record
        const selectQuery = `SELECT 
          dept.DEPARTMENT_ID,
          dept.DEPARTMENT_CODE,
          dept.STATUS,
          dept.DEPARTMENT_NAME_EN,
          dept.DEPARTMENT_NAME_AR,
          dept.BUSINESS_UNIT_ID,
          bu.UNIT_NAME_EN AS BUSINESS_UNIT_NAME_EN,
          bu.UNIT_NAME_AR AS BUSINESS_UNIT_NAME_AR,
          dept.DIVISION_ID,
          d.DIVISION_NAME_EN,
          d.DIVISION_NAME_AR,
          dept.COMPANY_ID,
          c.COMPANY_NAME_EN,
          c.COMPANY_NAME_AR,
          dept.ORG_STRUCTURE_ID,
          s.STRUCTURE_NAME AS ORG_STRUCTURE_NAME,
          dept.HEAD_OF_DEPARTMENT,
          dept.HEAD_EMAIL,
          dept.HEAD_PHONE,
          dept.TOTAL_EMPLOYEES,
          dept.TOTAL_SUB_DEPARTMENTS,
          dept.TOTAL_BUDGET,
          dept.DESCRIPTION,
          dept.CREATED_BY,
          dept.CREATED_DATE,
          dept.LAST_UPDATED_BY,
          dept.LAST_UPDATED_DATE,
          dept.LAST_UPDATE_LOGIN
        FROM ${this.TABLE_NAME} dept
        LEFT JOIN ENT.BUSINESS_UNIT bu ON dept.BUSINESS_UNIT_ID = bu.BUSINESS_UNIT_ID
        LEFT JOIN ENT.DIVISIONS d ON dept.DIVISION_ID = d.DIVISION_ID
        LEFT JOIN ENT.COMPANIES c ON dept.COMPANY_ID = c.COMPANY_ID
        LEFT JOIN ENT.HR_ORG_STRUCTURES s ON dept.ORG_STRUCTURE_ID = s.STRUCTURE_ID
        WHERE dept.DEPARTMENT_ID = :1`;
        const selectResult = await connection.execute(selectQuery, [departmentId], {
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
        const columns = columnMatch ? columnMatch[1] : 'DEPARTMENT_CODE';
        
        const userMessage = `A department with the same ${columns} already exists.`;
        
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
        constraintError.userMessage = 'The referenced business unit, division, company, or organization structure does not exist.';
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
      
      throw new Error(`Failed to update department: ${error.message}`);
    }
  }

  /**
   * Delete a department (soft delete by setting STATUS = 'INACTIVE')
   * @param {number} departmentId - Department ID
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<boolean>} Success status
   */
  static async softDelete(departmentId, userId) {
    try {
      const result = await this.executeWithTransaction(async (connection) => {
        const query = `UPDATE ${this.TABLE_NAME} 
          SET STATUS = 'INACTIVE',
              LAST_UPDATED_BY = :1,
              LAST_UPDATED_DATE = :2
          WHERE DEPARTMENT_ID = :3`;

        const updateResult = await connection.execute(query, [userId || 'SYSTEM', new Date(), departmentId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        const rowsAffected = updateResult.rowsAffected || updateResult.rowCount || 0;
        if (rowsAffected === 0) {
          throw new Error(`No department found with ID: ${departmentId}`);
        }
        
        return { ...updateResult, rowsAffected };
      });
      
      console.log(`Soft delete successful for department ID: ${departmentId}, rows affected: ${result.rowsAffected}`);
      return true;
    } catch (error) {
      console.error('Error in softDelete:', error);
      throw new Error(`Failed to delete department: ${error.message}`);
    }
  }

  /**
   * Hard delete a department (permanent removal)
   * @param {number} departmentId - Department ID
   * @returns {Promise<Object>} Success status
   */
  static async hardDelete(departmentId) {
    try {
      const result = await this.executeWithTransaction(async (connection) => {
        const query = `DELETE FROM ${this.TABLE_NAME} WHERE DEPARTMENT_ID = :1`;
        const deleteResult = await connection.execute(query, [departmentId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        const rowsAffected = deleteResult.rowsAffected || deleteResult.rowCount || 0;
        if (rowsAffected === 0) {
          throw new Error(`No department found with ID: ${departmentId}`);
        }
        
        return { ...deleteResult, rowsAffected };
      });
      
      console.log(`Hard delete successful for department ID: ${departmentId}, rows affected: ${result.rowsAffected}`);
      return { success: true };
    } catch (error) {
      console.error('Error in hardDelete:', error);
      
      if (error.errorNum === 2292 || error.message?.includes('ORA-02292') || error.message?.includes('integrity constraint')) {
        const constraintName = error.message?.match(/\(([^)]+)\)/)?.[1] || 'UNKNOWN';
        const constraintError = new Error(`Cannot delete department: This department is referenced by other records in the database.`);
        constraintError.errorNum = 2292;
        constraintError.code = 'FOREIGN_KEY_CONSTRAINT';
        constraintError.constraint = constraintName;
        constraintError.suggestion = 'Use soft delete (?soft=true) to deactivate this department instead of permanently deleting it.';
        throw constraintError;
      }
      
      throw new Error(`Failed to delete department: ${error.message}`);
    }
  }
}

export default DepartmentModel;

