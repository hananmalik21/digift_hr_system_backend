import db from '../../../config/db.js';
import oracledb from 'oracledb';

/**
 * Org Unit Model
 * Handles all database operations for ENT.ORG_UNITS table
 *
 * ✅ Update: Adds parent_unit { id, name, level } in:
 * - findByStructureAndLevel()
 * - findById()
 * - findAllByStructure()
 * - buildTree() (keeps parent_unit on nodes; linking still uses parent_org_unit_id)
 */
class OrgUnitModel {
  static TABLE_NAME = 'ENT.ORG_UNITS';

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
   * ✅ Build parent_unit object from JOIN columns
   * parent_unit: { id, name, level }
   */
  static withParentUnit(row) {
    if (!row) return row;

    const parentId = row.parent_id ?? row.PARENT_ID ?? null;

    const parentName =
      row.parent_name_en ??
      row.PARENT_NAME_EN ??
      row.parent_name_ar ??
      row.PARENT_NAME_AR ??
      null;

    const parentLevel = row.parent_level_code ?? row.PARENT_LEVEL_CODE ?? null;

    const mapped = {
      ...row,
      parent_unit: parentId
        ? {
            id: parentId,
            name: parentName,
            level: parentLevel
          }
        : null
    };

    // remove helper columns (snake_case)
    delete mapped.parent_id;
    delete mapped.parent_name_en;
    delete mapped.parent_name_ar;
    delete mapped.parent_level_code;

    // remove helper columns (upper-case safety)
    delete mapped.PARENT_ID;
    delete mapped.PARENT_NAME_EN;
    delete mapped.PARENT_NAME_AR;
    delete mapped.PARENT_LEVEL_CODE;

    return mapped;
  }

  /**
   * Find org units by structure and level (✅ includes parent_unit)
   */
  static async findByStructureAndLevel(structureId, levelCode, filters = {}) {
    try {
      let countQuery = `SELECT COUNT(*) AS total FROM ${this.TABLE_NAME} ou`;

      let dataQuery = `SELECT
        ou.ORG_UNIT_ID,
        ou.ORG_STRUCTURE_ID,
        ou.ENTERPRISE_ID,
        ou.LEVEL_CODE,
        ou.ORG_UNIT_CODE,
        ou.ORG_UNIT_NAME_EN,
        ou.ORG_UNIT_NAME_AR,
        ou.PARENT_ORG_UNIT_ID,
        ou.IS_ACTIVE,
        ou.MANAGER_NAME,
        ou.MANAGER_EMAIL,
        ou.MANAGER_PHONE,
        ou.LOCATION,
        ou.CITY,
        ou.ADDRESS,
        ou.DESCRIPTION,
        ou.CREATED_BY,
        ou.CREATED_DATE,
        ou.LAST_UPDATED_BY,
        ou.LAST_UPDATED_DATE,
        ou.LAST_UPDATE_LOGIN,

        pou.ORG_UNIT_ID       AS PARENT_ID,
        pou.ORG_UNIT_NAME_EN  AS PARENT_NAME_EN,
        pou.ORG_UNIT_NAME_AR  AS PARENT_NAME_AR,
        pou.LEVEL_CODE        AS PARENT_LEVEL_CODE
      FROM ${this.TABLE_NAME} ou
      LEFT JOIN ${this.TABLE_NAME} pou
        ON pou.ORG_UNIT_ID = ou.PARENT_ORG_UNIT_ID`;

      const conditions = [];
      const bindParams = [];
      let paramIndex = 1;

      conditions.push(`ou.ORG_STRUCTURE_ID = :${paramIndex}`);
      bindParams.push(structureId);
      paramIndex++;

      conditions.push(`ou.LEVEL_CODE = :${paramIndex}`);
      bindParams.push(levelCode);
      paramIndex++;

      if (filters.parentId !== undefined && filters.parentId !== null) {
        conditions.push(`ou.PARENT_ORG_UNIT_ID = :${paramIndex}`);
        bindParams.push(filters.parentId);
        paramIndex++;
      }

      if (filters.isActive !== undefined) {
        const isActiveValue = filters.isActive === true || filters.isActive === 'Y' ? 'Y' : 'N';
        conditions.push(`ou.IS_ACTIVE = :${paramIndex}`);
        bindParams.push(isActiveValue);
        paramIndex++;
      }

      if (filters.search) {
        const searchValue = `%${filters.search}%`;
        conditions.push(`(
          UPPER(ou.ORG_UNIT_CODE) LIKE UPPER(:${paramIndex}) OR
          UPPER(ou.ORG_UNIT_NAME_EN) LIKE UPPER(:${paramIndex + 1}) OR
          UPPER(ou.ORG_UNIT_NAME_AR) LIKE UPPER(:${paramIndex + 2})
        )`);
        bindParams.push(searchValue, searchValue, searchValue);
        paramIndex += 3;
      }

      const whereClause = ` WHERE ${conditions.join(' AND ')}`;
      countQuery += whereClause;
      dataQuery += whereClause;

      dataQuery += ` ORDER BY ou.ORG_UNIT_NAME_EN, ou.ORG_UNIT_ID`;

      const pagination = filters.pagination;
      let totalCount = 0;

      const countBindParams = [...bindParams];
      const dataBindParams = [...bindParams];

      if (pagination && pagination.page && pagination.pageSize) {
        const countResult = await this.executeQuery(countQuery, countBindParams);
        totalCount = countResult.rows?.length ? countResult.rows[0].total : 0;

        const offset = (pagination.page - 1) * pagination.pageSize;
        dataQuery += ` OFFSET :${paramIndex} ROWS FETCH NEXT :${paramIndex + 1} ROWS ONLY`;
        dataBindParams.push(offset, pagination.pageSize);
      }

      const result = await this.executeQuery(dataQuery, dataBindParams);
      const rows = result.rows || [];
      const orgUnits = rows.map(r => this.withParentUnit(r));

      if (pagination && pagination.page && pagination.pageSize) {
        return { orgUnits, total: totalCount };
      }

      return orgUnits;
    } catch (error) {
      console.error('Error in findByStructureAndLevel:', error);
      throw new Error(`Failed to fetch org units: ${error.message}`);
    }
  }

  /**
   * Find parent options for a level (unchanged)
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
        bindParams.push(searchValue, searchValue, searchValue);
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
        totalCount = countResult.rows?.length ? countResult.rows[0].total : 0;

        const offset = (pagination.page - 1) * pagination.pageSize;
        dataQuery += ` OFFSET :${paramIndex} ROWS FETCH NEXT :${paramIndex + 1} ROWS ONLY`;
        dataBindParams.push(offset, pagination.pageSize);
      }

      const result = await this.executeQuery(dataQuery, dataBindParams);
      const orgUnits = result.rows || [];

      if (pagination && pagination.page && pagination.pageSize) {
        return { orgUnits, total: totalCount };
      }

      return orgUnits;
    } catch (error) {
      console.error('Error in findParentOptions:', error);
      throw new Error(`Failed to fetch parent options: ${error.message}`);
    }
  }

  /**
   * Find org unit by ID (✅ includes parent_unit with level)
   */
  static async findById(orgUnitId, structureId = null) {
    try {
      let query = `SELECT
        ou.ORG_UNIT_ID,
        ou.ORG_STRUCTURE_ID,
        ou.ENTERPRISE_ID,
        ou.LEVEL_CODE,
        ou.ORG_UNIT_CODE,
        ou.ORG_UNIT_NAME_EN,
        ou.ORG_UNIT_NAME_AR,
        ou.PARENT_ORG_UNIT_ID,
        ou.IS_ACTIVE,
        ou.MANAGER_NAME,
        ou.MANAGER_EMAIL,
        ou.MANAGER_PHONE,
        ou.LOCATION,
        ou.CITY,
        ou.ADDRESS,
        ou.DESCRIPTION,
        ou.CREATED_BY,
        ou.CREATED_DATE,
        ou.LAST_UPDATED_BY,
        ou.LAST_UPDATED_DATE,
        ou.LAST_UPDATE_LOGIN,

        pou.ORG_UNIT_ID       AS PARENT_ID,
        pou.ORG_UNIT_NAME_EN  AS PARENT_NAME_EN,
        pou.ORG_UNIT_NAME_AR  AS PARENT_NAME_AR,
        pou.LEVEL_CODE        AS PARENT_LEVEL_CODE
      FROM ${this.TABLE_NAME} ou
      LEFT JOIN ${this.TABLE_NAME} pou
        ON pou.ORG_UNIT_ID = ou.PARENT_ORG_UNIT_ID
      WHERE ou.ORG_UNIT_ID = :1`;

      const bindParams = [orgUnitId];

      if (structureId !== null) {
        query += ` AND ou.ORG_STRUCTURE_ID = :2`;
        bindParams.push(structureId);
      }

      const result = await this.executeQuery(query, bindParams);
      if (result.rows?.length) return this.withParentUnit(result.rows[0]);
      return null;
    } catch (error) {
      console.error('Error in findById:', error);
      throw new Error(`Failed to fetch org unit: ${error.message}`);
    }
  }

  /**
   * Find all org units for a structure (✅ includes parent_unit with level)
   */
  static async findAllByStructure(structureId) {
    try {
      const query = `SELECT
        ou.ORG_UNIT_ID,
        ou.ORG_STRUCTURE_ID,
        ou.ENTERPRISE_ID,
        ou.LEVEL_CODE,
        ou.ORG_UNIT_CODE,
        ou.ORG_UNIT_NAME_EN,
        ou.ORG_UNIT_NAME_AR,
        ou.PARENT_ORG_UNIT_ID,
        ou.IS_ACTIVE,
        ou.MANAGER_NAME,
        ou.MANAGER_EMAIL,
        ou.MANAGER_PHONE,
        ou.LOCATION,
        ou.CITY,
        ou.ADDRESS,
        ou.DESCRIPTION,
        ou.CREATED_BY,
        ou.CREATED_DATE,
        ou.LAST_UPDATED_BY,
        ou.LAST_UPDATED_DATE,
        ou.LAST_UPDATE_LOGIN,

        pou.ORG_UNIT_ID       AS PARENT_ID,
        pou.ORG_UNIT_NAME_EN  AS PARENT_NAME_EN,
        pou.ORG_UNIT_NAME_AR  AS PARENT_NAME_AR,
        pou.LEVEL_CODE        AS PARENT_LEVEL_CODE
      FROM ${this.TABLE_NAME} ou
      LEFT JOIN ${this.TABLE_NAME} pou
        ON pou.ORG_UNIT_ID = ou.PARENT_ORG_UNIT_ID
      WHERE ou.ORG_STRUCTURE_ID = :1
      ORDER BY ou.LEVEL_CODE, ou.ORG_UNIT_NAME_EN, ou.ORG_UNIT_ID`;

      const result = await this.executeQuery(query, [structureId]);
      const rows = result.rows || [];
      return rows.map(r => this.withParentUnit(r));
    } catch (error) {
      console.error('Error in findAllByStructure:', error);
      throw new Error(`Failed to fetch org units: ${error.message}`);
    }
  }

  /**
   * Build tree structure (unchanged linking; keeps parent_unit in nodes)
   */
  static buildTree(orgUnits) {
    const unitMap = new Map();
    const roots = [];

    orgUnits.forEach(unit => {
      const unitId = unit.org_unit_id || unit.ORG_UNIT_ID;
      unitMap.set(unitId, { ...unit, children: [] });
    });

    orgUnits.forEach(unit => {
      const unitId = unit.org_unit_id || unit.ORG_UNIT_ID;
      const parentId = unit.parent_org_unit_id || unit.PARENT_ORG_UNIT_ID;

      if (parentId && unitMap.has(parentId)) {
        unitMap.get(parentId).children.push(unitMap.get(unitId));
      } else {
        roots.push(unitMap.get(unitId));
      }
    });

    return roots;
  }
}

export default OrgUnitModel;
