// feature/hr_org_structures/model/hrOrgStructureModel.js
import db from '../../../config/db.js';
import oracledb from 'oracledb';
import HrOrgHierarchyLevelModel from '../../hr_org_hierarchy_levels/model/hrOrgHierarchyLevelModel.js';
import { generateSysGuid } from '../../../utils/guidUtils.js';

/**
 * HR Organization Structure Model
 * ENT.HR_ORG_STRUCTURES.STRUCTURE_ID is SYS_GUID() RAW(16)
 * We expose it in API as 32-char HEX (RAWTOHEX)
 *
 * ✅ Fix for ORA-12860 (PDML sibling deadlock):
 * - Disable Parallel DML in the transaction session
 * - Add NO_PARALLEL hints to deletes
 * - Retry with exponential backoff + jitter for deadlocks
 */
class HrOrgStructureModel {
  static TABLE_NAME = 'ENT.HR_ORG_STRUCTURES';

  // -----------------------------
  // Helpers
  // -----------------------------
  static convertKeysToSnakeCase(obj) {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date || obj instanceof Buffer) return obj;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => this.convertKeysToSnakeCase(item));

    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
      const newKey = key.toLowerCase();
      if (value === null || value === undefined) converted[newKey] = value;
      else if (value instanceof Date || value instanceof Buffer) converted[newKey] = value;
      else if (typeof value === 'object') converted[newKey] = this.convertKeysToSnakeCase(value);
      else converted[newKey] = value;
    }
    return converted;
  }

  static async executeQuery(query, bindParams = [], options = {}) {
    const result = await db.executeQuery(query, bindParams, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      ...options
    });

    if (result.rows) result.rows = this.convertKeysToSnakeCase(result.rows);
    return result;
  }

  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static isDeadlockError(err) {
    return (
      err?.errorNum === 12860 || // ORA-12860 (PDML sibling deadlock)
      err?.errorNum === 60 || // ORA-00060 (classic deadlock) - just in case
      /ORA-12860/i.test(err?.message || '') ||
      /ORA-00060/i.test(err?.message || '') ||
      /deadlock/i.test(err?.message || '')
    );
  }

  /**
   * Transaction wrapper
   * ✅ Disables parallel DML to prevent ORA-12860 in delete statements.
   */
  static async executeWithTransaction(callback) {
    let connection;
    try {
      connection = await db.getConnection();

      // ✅ Prevent PDML sibling deadlocks (ORA-12860)
      // Run in serial for this connection/session.
      try {
        await connection.execute(`ALTER SESSION DISABLE PARALLEL DML`);
        await connection.execute(`ALTER SESSION SET parallel_degree_policy = MANUAL`);
      } catch (e) {
        // If user lacks privilege, ignore and continue (still okay; hints below help too)
        console.warn('Could not alter session parallel settings (continuing):', e.message);
      }

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

  // -----------------------------
  // Queries
  // -----------------------------
  static async findAll(filters = {}) {
    try {
      let countQuery = `SELECT COUNT(*) AS total FROM ${this.TABLE_NAME}`;
      let dataQuery = `SELECT
        RAWTOHEX(${this.TABLE_NAME}.STRUCTURE_ID) AS STRUCTURE_ID,
        ${this.TABLE_NAME}.ENTERPRISE_ID,
        E.ENTERPRISE_NAME,
        ${this.TABLE_NAME}.STRUCTURE_CODE,
        ${this.TABLE_NAME}.STRUCTURE_NAME,
        ${this.TABLE_NAME}.STRUCTURE_TYPE,
        ${this.TABLE_NAME}.DESCRIPTION,
        ${this.TABLE_NAME}.IS_ACTIVE,
        ${this.TABLE_NAME}.CREATED_BY,
        ${this.TABLE_NAME}.CREATED_DATE,
        ${this.TABLE_NAME}.LAST_UPDATED_BY,
        ${this.TABLE_NAME}.LAST_UPDATED_DATE,
        ${this.TABLE_NAME}.LAST_UPDATE_LOGIN,
        NVL(OU_COUNTS.ORG_UNIT_COUNT, 0) AS ORG_UNIT_COUNT
      FROM ${this.TABLE_NAME}
      LEFT JOIN ENT.ENTERPRISES E ON ${this.TABLE_NAME}.ENTERPRISE_ID = E.ENTERPRISE_ID
      LEFT JOIN (
        SELECT ORG_STRUCTURE_ID, COUNT(*) AS ORG_UNIT_COUNT
        FROM ENT.ORG_UNITS
        GROUP BY ORG_STRUCTURE_ID
      ) OU_COUNTS ON ${this.TABLE_NAME}.STRUCTURE_ID = OU_COUNTS.ORG_STRUCTURE_ID`;

      const conditions = [];
      const bindParams = [];
      let paramIndex = 1;

      if (filters.structureIdHex) {
        conditions.push(`${this.TABLE_NAME}.STRUCTURE_ID = HEXTORAW(:${paramIndex})`);
        bindParams.push(filters.structureIdHex);
        paramIndex++;
      }

      if (filters.enterpriseId) {
        conditions.push(`${this.TABLE_NAME}.ENTERPRISE_ID = :${paramIndex}`);
        bindParams.push(filters.enterpriseId);
        paramIndex++;
      }

      if (filters.isActive !== undefined) {
        conditions.push(`${this.TABLE_NAME}.IS_ACTIVE = :${paramIndex}`);
        bindParams.push(filters.isActive ? 'Y' : 'N');
        paramIndex++;
      }

      if (filters.structureType) {
        conditions.push(`${this.TABLE_NAME}.STRUCTURE_TYPE = :${paramIndex}`);
        bindParams.push(filters.structureType);
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
      countQuery += whereClause;
      dataQuery += whereClause;

      dataQuery += ` ORDER BY ${this.TABLE_NAME}.CREATED_DATE DESC`;

      const pagination = filters.pagination;
      let totalCount = 0;

      const countBindParams = [...bindParams];
      const dataBindParams = [...bindParams];

      if (pagination && pagination.page && pagination.pageSize) {
        const countResult = await this.executeQuery(countQuery, countBindParams);
        totalCount = countResult.rows?.[0]?.total ?? 0;

        const offset = (pagination.page - 1) * pagination.pageSize;
        dataQuery += ` OFFSET :${paramIndex} ROWS FETCH NEXT :${paramIndex + 1} ROWS ONLY`;
        dataBindParams.push(offset);
        dataBindParams.push(pagination.pageSize);
      }

      const result = await this.executeQuery(dataQuery, dataBindParams);
      const structures = result.rows || [];

      if (structures.length > 0) {
        const structureIdsHex = structures.map(s => s.structure_id);

        const levelsByStructureHex =
          await HrOrgHierarchyLevelModel.fetchLevelsForStructures(structureIdsHex);

        const structuresWithLevels = structures.map(structure => ({
          ...structure,
          levels: levelsByStructureHex[structure.structure_id] || []
        }));

        if (pagination && pagination.page && pagination.pageSize) {
          return { structures: structuresWithLevels, total: totalCount };
        }
        return structuresWithLevels;
      }

      if (pagination && pagination.page && pagination.pageSize) {
        return { structures: [], total: totalCount };
      }
      return structures;
    } catch (error) {
      console.error('Error in findAll:', error);
      throw new Error(`Failed to fetch organization structures: ${error.message}`);
    }
  }

  static async findById(structureIdHex) {
    try {
      const query = `SELECT
        RAWTOHEX(${this.TABLE_NAME}.STRUCTURE_ID) AS STRUCTURE_ID,
        ${this.TABLE_NAME}.ENTERPRISE_ID,
        E.ENTERPRISE_NAME,
        ${this.TABLE_NAME}.STRUCTURE_CODE,
        ${this.TABLE_NAME}.STRUCTURE_NAME,
        ${this.TABLE_NAME}.STRUCTURE_TYPE,
        ${this.TABLE_NAME}.DESCRIPTION,
        ${this.TABLE_NAME}.IS_ACTIVE,
        ${this.TABLE_NAME}.CREATED_BY,
        ${this.TABLE_NAME}.CREATED_DATE,
        ${this.TABLE_NAME}.LAST_UPDATED_BY,
        ${this.TABLE_NAME}.LAST_UPDATED_DATE,
        ${this.TABLE_NAME}.LAST_UPDATE_LOGIN,
        NVL(OU_COUNTS.ORG_UNIT_COUNT, 0) AS ORG_UNIT_COUNT
      FROM ${this.TABLE_NAME}
      LEFT JOIN ENT.ENTERPRISES E ON ${this.TABLE_NAME}.ENTERPRISE_ID = E.ENTERPRISE_ID
      LEFT JOIN (
        SELECT ORG_STRUCTURE_ID, COUNT(*) AS ORG_UNIT_COUNT
        FROM ENT.ORG_UNITS
        WHERE ORG_STRUCTURE_ID = HEXTORAW(:1)
        GROUP BY ORG_STRUCTURE_ID
      ) OU_COUNTS ON ${this.TABLE_NAME}.STRUCTURE_ID = OU_COUNTS.ORG_STRUCTURE_ID
      WHERE ${this.TABLE_NAME}.STRUCTURE_ID = HEXTORAW(:2)`;

      const result = await this.executeQuery(query, [structureIdHex, structureIdHex]);

      if (result.rows?.length > 0) {
        const structure = result.rows[0];
        const levels = await HrOrgHierarchyLevelModel.fetchLevelsForStructure(null, structureIdHex);
        return { ...structure, levels };
      }
      return null;
    } catch (error) {
      console.error('Error in findById:', error);
      throw new Error(`Failed to fetch organization structure: ${error.message}`);
    }
  }

  static async findActive() {
    try {
      const query = `SELECT
        RAWTOHEX(${this.TABLE_NAME}.STRUCTURE_ID) AS STRUCTURE_ID,
        ${this.TABLE_NAME}.ENTERPRISE_ID,
        E.ENTERPRISE_NAME,
        ${this.TABLE_NAME}.STRUCTURE_CODE,
        ${this.TABLE_NAME}.STRUCTURE_NAME,
        ${this.TABLE_NAME}.STRUCTURE_TYPE,
        ${this.TABLE_NAME}.DESCRIPTION,
        ${this.TABLE_NAME}.IS_ACTIVE,
        ${this.TABLE_NAME}.CREATED_BY,
        ${this.TABLE_NAME}.CREATED_DATE,
        ${this.TABLE_NAME}.LAST_UPDATED_BY,
        ${this.TABLE_NAME}.LAST_UPDATED_DATE,
        ${this.TABLE_NAME}.LAST_UPDATE_LOGIN,
        NVL(OU_COUNTS.ORG_UNIT_COUNT, 0) AS ORG_UNIT_COUNT
      FROM ${this.TABLE_NAME}
      LEFT JOIN ENT.ENTERPRISES E ON ${this.TABLE_NAME}.ENTERPRISE_ID = E.ENTERPRISE_ID
      LEFT JOIN (
        SELECT ORG_STRUCTURE_ID, COUNT(*) AS ORG_UNIT_COUNT
        FROM ENT.ORG_UNITS
        GROUP BY ORG_STRUCTURE_ID
      ) OU_COUNTS ON ${this.TABLE_NAME}.STRUCTURE_ID = OU_COUNTS.ORG_STRUCTURE_ID
      WHERE ${this.TABLE_NAME}.IS_ACTIVE = 'Y'
      ORDER BY ${this.TABLE_NAME}.CREATED_DATE DESC
      FETCH FIRST 1 ROWS ONLY`;

      const result = await this.executeQuery(query, []);
      return result.rows?.[0] ?? null;
    } catch (error) {
      console.error('Error in findActive:', error);
      throw new Error(`Failed to fetch active organization structure: ${error.message}`);
    }
  }

  static async getActiveStructureLevels() {
    try {
      const activeStructure = await this.findActive();
      if (!activeStructure) return null;

      const structureIdHex = activeStructure.structure_id;

      const levels = await HrOrgHierarchyLevelModel.findAll({
        structureIdHex,
        isActive: true
      });

      return { ...activeStructure, levels };
    } catch (error) {
      console.error('Error in getActiveStructureLevels:', error);
      throw new Error(`Failed to fetch active structure levels: ${error.message}`);
    }
  }

  /**
   * Deactivate all other structures when one is active
   * excludeStructureIdHex = hex32
   */
  static async deactivateOtherStructures(connection, excludeStructureIdHex, userId) {
    try {
      const q = `UPDATE ${this.TABLE_NAME}
        SET IS_ACTIVE = 'N',
            LAST_UPDATED_BY = :1,
            LAST_UPDATED_DATE = :2
        WHERE IS_ACTIVE = 'Y'
          AND STRUCTURE_ID != HEXTORAW(:3)`;

      const now = new Date();
      const r = await connection.execute(q, [userId || 'SYSTEM', now, excludeStructureIdHex], {
        outFormat: oracledb.OUT_FORMAT_OBJECT
      });

      return r.rowsAffected || r.rowCount || 0;
    } catch (error) {
      console.error('Error deactivating other structures:', error);
      throw new Error(`Failed to deactivate other structures: ${error.message}`);
    }
  }

  // -----------------------------
  // Mutations
  // -----------------------------
  static async create(data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        const getValue = (upperKey, snakeKey, defaultValue = null) => {
          const value = data[upperKey] !== undefined ? data[upperKey] : data[snakeKey];
          return value !== undefined ? value : defaultValue;
        };

        const { buffer: structureIdBuf, hex: structureIdHex } = await generateSysGuid(connection);
        const now = new Date();

        const isActiveValue = getValue('IS_ACTIVE', 'is_active', true);
        const isActive = isActiveValue !== false && isActiveValue !== 'N' && isActiveValue !== 'n' ? 'Y' : 'N';

        const enterpriseId = getValue('ENTERPRISE_ID', 'enterprise_id');
        const structureCode = getValue('STRUCTURE_CODE', 'structure_code');
        const structureName = getValue('STRUCTURE_NAME', 'structure_name');
        const structureType = getValue('STRUCTURE_TYPE', 'structure_type');

        if (enterpriseId === null || enterpriseId === undefined) throw new Error('ENTERPRISE_ID is required and cannot be null');
        if (!structureCode || (typeof structureCode === 'string' && structureCode.trim() === '')) throw new Error('STRUCTURE_CODE is required and cannot be null or empty');
        if (!structureName || (typeof structureName === 'string' && structureName.trim() === '')) throw new Error('STRUCTURE_NAME is required and cannot be null or empty');
        if (!structureType || (typeof structureType === 'string' && structureType.trim() === '')) throw new Error('STRUCTURE_TYPE is required and cannot be null or empty');

        const insert = `INSERT INTO ${this.TABLE_NAME} (
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
          :1,:2,:3,:4,:5,:6,:7,:8,:9,:10,:11,:12
        )`;

        await connection.execute(
          insert,
          [
            structureIdBuf,
            enterpriseId,
            structureCode,
            structureName,
            structureType,
            getValue('DESCRIPTION', 'description', null),
            isActive,
            userId || 'SYSTEM',
            now,
            userId || 'SYSTEM',
            now,
            getValue('LAST_UPDATE_LOGIN', 'last_update_login', null)
          ],
          {
            outFormat: oracledb.OUT_FORMAT_OBJECT,
            bindDefs: { 1: { type: oracledb.BUFFER, maxSize: 16 } }
          }
        );

        if (isActive === 'Y') {
          await this.deactivateOtherStructures(connection, structureIdHex, userId);
        }

        const createdStructure = await this.findById(structureIdHex);

        let createdLevels = [];
        if (data.levels && Array.isArray(data.levels) && data.levels.length > 0) {
          createdLevels = await HrOrgHierarchyLevelModel.createBulk(connection, structureIdHex, data.levels, userId);
        }

        return { ...createdStructure, levels: createdLevels };
      });
    } catch (error) {
      console.error('Error in create:', error);

      const isUniqueConstraint =
        error.errorNum === 1 ||
        error.code === 1 ||
        error.message?.includes('ORA-00001') ||
        /unique constraint/i.test(error.message || '');

      if (isUniqueConstraint) {
        const constraintMatch = error.message?.match(/\(([A-Z_][A-Z0-9_.]+)\)/);
        const constraintName = constraintMatch ? constraintMatch[1] : 'UNKNOWN';

        const columnMatch = error.message?.match(/columns?\s*\(([^)]+)\)/i);
        const columns = columnMatch ? columnMatch[1] : 'ENTERPRISE_ID, STRUCTURE_CODE';

        const valuesMatch = error.message?.match(/row with column values\s*\(([^)]+)\)/i);
        const existingValues = valuesMatch ? valuesMatch[1] : null;

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

      if (
        error.errorNum === 2291 ||
        error.message?.includes('ORA-02291') ||
        (error.message?.includes('integrity constraint') && error.message?.includes('parent key not found'))
      ) {
        const constraintError = new Error(`Referenced record does not exist.`);
        constraintError.errorNum = 2291;
        constraintError.code = 'FOREIGN_KEY_CONSTRAINT';
        constraintError.statusCode = 400;
        constraintError.userMessage = 'The referenced enterprise or related record does not exist.';
        throw constraintError;
      }

      if (error.errorNum === 1400 || error.message?.includes('ORA-01400') || error.message?.includes('cannot insert NULL')) {
        const columnMatch =
          error.message?.match(/cannot insert NULL into \("([^"]+)"\."([^"]+)"\."([^"]+)"/i) ||
          error.message?.match(/column "([^"]+)"/i);
        const columnName = columnMatch ? (columnMatch[3] || columnMatch[1]) : 'UNKNOWN';

        const userMessage =
          columnName !== 'UNKNOWN'
            ? `Required field '${columnName}' cannot be null.`
            : 'One or more required fields are missing or null.';

        const constraintError = new Error(userMessage);
        constraintError.errorNum = 1400;
        constraintError.code = 'NOT_NULL_CONSTRAINT';
        constraintError.statusCode = 400;
        constraintError.userMessage = userMessage;
        constraintError.column = columnName;
        throw constraintError;
      }

      throw new Error(`Failed to create organization structure: ${error.message}`);
    }
  }

  static async update(structureIdHex, data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        const updateFields = [];
        const bindParams = [];
        let paramIndex = 1;

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

        if (updateFields.length === 0) throw new Error('No fields to update');

        updateFields.push(`LAST_UPDATED_BY = :${paramIndex}`);
        bindParams.push(userId || 'SYSTEM');
        paramIndex++;

        updateFields.push(`LAST_UPDATED_DATE = :${paramIndex}`);
        bindParams.push(new Date());
        paramIndex++;

        bindParams.push(structureIdHex);
        const query = `UPDATE ${this.TABLE_NAME}
          SET ${updateFields.join(', ')}
          WHERE STRUCTURE_ID = HEXTORAW(:${paramIndex})`;

        await connection.execute(query, bindParams, { outFormat: oracledb.OUT_FORMAT_OBJECT });

        if (isActivating) {
          await this.deactivateOtherStructures(connection, structureIdHex, userId);
        }

        return await this.findById(structureIdHex);
      });
    } catch (error) {
      console.error('Error in update:', error);

      const isUniqueConstraint =
        error.errorNum === 1 ||
        error.code === 1 ||
        error.message?.includes('ORA-00001') ||
        /unique constraint/i.test(error.message || '');

      if (isUniqueConstraint) {
        const constraintMatch = error.message?.match(/\(([A-Z_][A-Z0-9_.]+)\)/);
        const constraintName = constraintMatch ? constraintMatch[1] : 'UNKNOWN';

        const columnMatch = error.message?.match(/columns?\s*\(([^)]+)\)/i);
        const columns = columnMatch ? columnMatch[1] : 'ENTERPRISE_ID, STRUCTURE_CODE';

        const valuesMatch = error.message?.match(/row with column values\s*\(([^)]+)\)/i);
        const existingValues = valuesMatch ? valuesMatch[1] : null;

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

      if (
        error.errorNum === 2291 ||
        error.message?.includes('ORA-02291') ||
        (error.message?.includes('integrity constraint') && error.message?.includes('parent key not found'))
      ) {
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

  // -----------------------------
  // Delete helpers
  // -----------------------------
  static async getOrgStructureReferences(structureIdHex) {
    try {
      const referenceChecks = await Promise.all([
        this.executeQuery(
          `SELECT COUNT(*) AS count FROM ENT.ORG_UNITS WHERE ORG_STRUCTURE_ID = HEXTORAW(:1)`,
          [structureIdHex]
        )
          .then(result => ({
            table: 'ENT.ORG_UNITS',
            column: 'ORG_STRUCTURE_ID',
            count: result.rows?.[0]?.count || 0,
            description: 'Organization units are using this structure'
          }))
          .catch(err => {
            console.warn('Could not check ENT.ORG_UNITS references:', err.message);
            return null;
          }),

        this.executeQuery(
          `SELECT COUNT(*) AS count FROM ENT.POSITIONS WHERE ORG_STRUCTURE_ID = HEXTORAW(:1)`,
          [structureIdHex]
        )
          .then(result => ({
            table: 'ENT.POSITIONS',
            column: 'ORG_STRUCTURE_ID',
            count: result.rows?.[0]?.count || 0,
            description: 'Positions are using this structure'
          }))
          .catch(err => {
            console.warn('Could not check ENT.POSITIONS references:', err.message);
            return null;
          })
      ]);

      return referenceChecks.filter(ref => ref !== null && ref.count > 0);
    } catch (error) {
      console.error('Error getting structure references:', error);
      return [];
    }
  }

  /**
   * hardDelete(structureIdHex)
   * Deletes hierarchy levels first, then the structure (safe)
   * ✅ Includes ORA-12860 retry + PDML prevention
   */
  static async hardDelete(structureIdHex, retryCount = 0) {
    const maxRetries = 4;
    const baseDelay = 120; // ms

    try {
      const result = await this.executeWithTransaction(async (connection) => {
        // 1) delete levels
        const deleteLevelsQuery =
          `DELETE /*+ NO_PARALLEL */ FROM ENT.HR_ORG_HIERARCHY_LEVELS WHERE STRUCTURE_ID = HEXTORAW(:1)`;

        try {
          await connection.execute(deleteLevelsQuery, [structureIdHex], {
            outFormat: oracledb.OUT_FORMAT_OBJECT,
            autoCommit: false
          });
        } catch (levelErr) {
          if (levelErr.errorNum !== 942 && !levelErr.message?.includes('not found')) {
            console.warn('Error deleting hierarchy levels (continuing):', levelErr.message);
          }
        }

        // 2) delete structure
        const query =
          `DELETE /*+ NO_PARALLEL */ FROM ${this.TABLE_NAME} WHERE STRUCTURE_ID = HEXTORAW(:1)`;

        const r = await connection.execute(query, [structureIdHex], {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
          autoCommit: false
        });

        const rowsAffected = r.rowsAffected || r.rowCount || 0;
        if (rowsAffected === 0) throw new Error(`No organization structure found with ID: ${structureIdHex}`);
        return { ...r, rowsAffected };
      });

      console.log(`Hard delete successful for structure ID: ${structureIdHex}, rows affected: ${result.rowsAffected}`);
      return { success: true, rowsAffected: result.rowsAffected };
    } catch (error) {
      if (this.isDeadlockError(error) && retryCount < maxRetries) {
        const jitter = Math.floor(Math.random() * 80);
        const delay = baseDelay * Math.pow(2, retryCount) + jitter;
        console.warn(
          `Deadlock detected for hardDelete ${structureIdHex}, retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`
        );
        await this.sleep(delay);
        return this.hardDelete(structureIdHex, retryCount + 1);
      }

      console.error('Error in hardDelete:', error);
      throw error;
    }
  }

  /**
   * forceDelete(structureIdHex)
   * Deletes hierarchy levels, org units, positions, then structure (autofallback)
   * ✅ Includes ORA-12860 retry + PDML prevention
   */
  static async forceDelete(structureIdHex, retryCount = 0) {
    const maxRetries = 4;
    const baseDelay = 120; // ms

    try {
      const result = await this.executeWithTransaction(async (connection) => {
        // 1) Delete hierarchy levels
        try {
          const q = `DELETE /*+ NO_PARALLEL */ FROM ENT.HR_ORG_HIERARCHY_LEVELS WHERE STRUCTURE_ID = HEXTORAW(:1)`;
          await connection.execute(q, [structureIdHex], { outFormat: oracledb.OUT_FORMAT_OBJECT, autoCommit: false });
        } catch (err) {
          console.warn('Could not delete hierarchy levels (may not exist):', err.message);
        }

        // 2) Delete org units
        try {
          const q = `DELETE /*+ NO_PARALLEL */ FROM ENT.ORG_UNITS WHERE ORG_STRUCTURE_ID = HEXTORAW(:1)`;
          await connection.execute(q, [structureIdHex], { outFormat: oracledb.OUT_FORMAT_OBJECT, autoCommit: false });
        } catch (err) {
          console.warn('Could not delete org units (may have dependencies):', err.message);
        }

        // 3) Delete positions
        try {
          const q = `DELETE /*+ NO_PARALLEL */ FROM ENT.POSITIONS WHERE ORG_STRUCTURE_ID = HEXTORAW(:1)`;
          await connection.execute(q, [structureIdHex], { outFormat: oracledb.OUT_FORMAT_OBJECT, autoCommit: false });
        } catch (err) {
          console.warn('Could not delete positions (may have dependencies):', err.message);
        }

        // 4) Delete the structure
        const query = `DELETE /*+ NO_PARALLEL */ FROM ${this.TABLE_NAME} WHERE STRUCTURE_ID = HEXTORAW(:1)`;
        const r = await connection.execute(query, [structureIdHex], {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
          autoCommit: false
        });

        const rowsAffected = r.rowsAffected || r.rowCount || 0;
        if (rowsAffected === 0) throw new Error(`No organization structure found with ID: ${structureIdHex}`);
        return { ...r, rowsAffected };
      });

      console.log(`Force delete successful for structure ID: ${structureIdHex}, rows affected: ${result.rowsAffected}`);
      return { success: true, rowsAffected: result.rowsAffected };
    } catch (error) {
      if (this.isDeadlockError(error) && retryCount < maxRetries) {
        const jitter = Math.floor(Math.random() * 80);
        const delay = baseDelay * Math.pow(2, retryCount) + jitter;
        console.warn(
          `Deadlock detected for forceDelete ${structureIdHex}, retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`
        );
        await this.sleep(delay);
        return this.forceDelete(structureIdHex, retryCount + 1);
      }

      console.error('Error in forceDelete:', error);
      throw error;
    }
  }
}

export default HrOrgStructureModel;
