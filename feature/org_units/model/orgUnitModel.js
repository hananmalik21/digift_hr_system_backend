import db from '../../../config/db.js';
import oracledb from 'oracledb';

/**
 * Org Unit Model
 * Handles all database operations for ENT.ORG_UNITS table
 *
 * ✅ Adds: parent_unit object in responses:
 *   parent_unit: { id, name, level } | null
 * - Uses a self-join to ENT.ORG_UNITS to fetch parent name + level
 */
class OrgUnitModel {
  static TABLE_NAME = 'ENT.ORG_UNITS';
  static STRUCTURE_TABLE_NAME = 'ENT.HR_ORG_STRUCTURES';

  /** Shared SELECT columns for org unit with parent join (used by findById, findAllByStructure, findByStructureAndLevel, create) */
  static ORG_UNIT_SELECT_COLUMNS = `ou.ORG_UNIT_ID, ou.ORG_STRUCTURE_ID, ou.ENTERPRISE_ID, ou.LEVEL_CODE,
    ou.ORG_UNIT_CODE, ou.ORG_UNIT_NAME_EN, ou.ORG_UNIT_NAME_AR, ou.PARENT_ORG_UNIT_ID,
    ou.IS_ACTIVE, ou.MANAGER_NAME, ou.MANAGER_EMAIL, ou.MANAGER_PHONE, ou.LOCATION,
    ou.CITY, ou.ADDRESS, ou.DESCRIPTION, ou.CREATED_BY, ou.CREATED_DATE,
    ou.LAST_UPDATED_BY, ou.LAST_UPDATED_DATE, ou.LAST_UPDATE_LOGIN,
    p.ORG_UNIT_NAME_EN AS PARENT_ORG_UNIT_NAME_EN,
    p.ORG_UNIT_NAME_AR AS PARENT_ORG_UNIT_NAME_AR,
    p.LEVEL_CODE AS PARENT_ORG_LEVEL_CODE,
    s.STRUCTURE_NAME AS ORG_STRUCTURE_NAME`;
  static get _orgUnitFromJoin() {
    return `FROM ${this.TABLE_NAME} ou
      LEFT JOIN ${this.TABLE_NAME} p ON p.ORG_UNIT_ID = ou.PARENT_ORG_UNIT_ID AND p.ORG_STRUCTURE_ID = ou.ORG_STRUCTURE_ID
      LEFT JOIN ${this.STRUCTURE_TABLE_NAME} s ON s.STRUCTURE_ID = ou.ORG_STRUCTURE_ID`;
  }

  /**
   * Convert object keys from UPPER_CASE to lowercase snake_case
   * Converts Buffer objects (Oracle RAW/GUID types) to hex strings
   */
  static convertKeysToSnakeCase(obj) {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date) return obj;
    if (obj instanceof Buffer) {
      // Convert Buffer (Oracle RAW/GUID) to uppercase hex string
      return obj.toString('hex').toUpperCase();
    }
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => this.convertKeysToSnakeCase(item));

    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
      const newKey = key.toLowerCase();
      if (value === null || value === undefined) {
        converted[newKey] = value;
      } else if (value instanceof Date) {
        converted[newKey] = value;
      } else if (value instanceof Buffer) {
        // Convert Buffer (Oracle RAW/GUID) to uppercase hex string
        converted[newKey] = value.toString('hex').toUpperCase();
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
      if (connection?.rollback) {
        try {
          await connection.rollback();
        } catch {
          // Silently handle rollback errors
        }
      }
      throw error;
    } finally {
      if (connection?.close) {
        try {
          await connection.close();
        } catch {
          // Silently handle close errors
        }
      }
    }
  }

  /**
   * Convert GUID to hex string format
   */
  static guidToHex(guid) {
    if (Buffer.isBuffer(guid)) {
      return guid.toString('hex').toUpperCase();
    }
    if (typeof guid === 'string') {
      return guid.toUpperCase();
    }
    return String(guid).toUpperCase();
  }

  /**
   * Convert hex string GUID to Buffer for Oracle RAW binding
   * Oracle RAW(16) expects exactly 16 bytes (32 hex characters)
   */
  static guidToBuffer(guid) {
    if (Buffer.isBuffer(guid)) {
      // Ensure buffer is exactly 16 bytes for Oracle RAW(16)
      if (guid.length === 16) {
        return guid;
      }
      // If buffer is wrong size, try to convert from hex
      const hex = guid.toString('hex').toUpperCase();
      return this.guidToBuffer(hex);
    }
    
    if (!guid || guid === '') {
      return null;
    }
    
    const hexId = typeof guid === 'string' ? guid.toUpperCase().trim() : String(guid).toUpperCase().trim();
    
    // Validate hex string format
    if (!/^[0-9A-F]+$/i.test(hexId)) {
      // If not a valid hex string, return as-is (might be a different format)
      return hexId;
    }
    
    try {
      // Oracle RAW(16) expects exactly 16 bytes (32 hex characters)
      // If the hex string is shorter, pad with zeros; if longer, truncate
      let normalizedHex = hexId;
      if (normalizedHex.length < 32) {
        // Pad with leading zeros
        normalizedHex = normalizedHex.padStart(32, '0');
      } else if (normalizedHex.length > 32) {
        // Truncate to 32 characters (take first 32)
        normalizedHex = normalizedHex.substring(0, 32);
      }
      
      const buffer = Buffer.from(normalizedHex, 'hex');
      
      // Ensure we have exactly 16 bytes
      if (buffer.length !== 16) {
        // If conversion didn't produce 16 bytes, pad or truncate
        const result = Buffer.alloc(16);
        buffer.copy(result, 0, 0, Math.min(buffer.length, 16));
        return result;
      }
      
      return buffer;
    } catch (error) {
      // If conversion fails, return the original hex string
      // Oracle might accept it as a string in some cases
      return hexId;
    }
  }

  /**
   * Build parent_unit object using aliased parent columns
   */
  static attachParentUnit(row) {
    if (!row) return row;

    const parentId = row.parent_org_unit_id ?? null;
    const parentNameEn = row.parent_org_unit_name_en ?? null;
    const parentNameAr = row.parent_org_unit_name_ar ?? null;
    const parentLevel = row.parent_org_level_code ?? null;

    return {
      ...row,
      parent_unit: parentId
        ? {
            id: parentId,
            name: parentNameEn || parentNameAr || null,
            level: parentLevel || null
          }
        : null
    };
  }

  /**
   * Find org units by structure and level.
   * When paginated, uses a single query with COUNT(*) OVER() (one round-trip).
   *
   * @param {string} structureId - Structure ID (hex32)
   * @param {string} levelCode - Level code (e.g. 'COMPANY', 'BUSINESS_UNIT')
   * @param {Object} [filters] - Optional parentId, search, isActive, pagination, connection
   * @returns {Promise<Array|{ orgUnits: Array, total: number }>} Array if no pagination; else { orgUnits, total }
   */
  static async findByStructureAndLevel(structureId, levelCode, filters = {}) {
    try {
      const pagination = filters.pagination;
      const needsCount = pagination && pagination.page && pagination.pageSize;
      
      // Build WHERE conditions - order by selectivity (most selective first)
      const conditions = [];
      const bindParams = [];
      let paramIndex = 1;

      // Most selective filters first (structure + level are required and most selective)
      // Convert hex string GUID to RAW for Oracle comparison
      conditions.push(`ou.ORG_STRUCTURE_ID = HEXTORAW(:${paramIndex})`);
      bindParams.push(structureId);
      paramIndex++;

      conditions.push(`ou.LEVEL_CODE = :${paramIndex}`);
      bindParams.push(levelCode);
      paramIndex++;

      // Optional filters - parentId is very selective
      if (filters.parentId !== undefined && filters.parentId !== null) {
        const parentIdBuffer = this.guidToBuffer(filters.parentId);
        const parentIdHex = this.guidToHex(filters.parentId);
        // Handle both RAW and hex string formats for GUID
        conditions.push(`(ou.PARENT_ORG_UNIT_ID = :${paramIndex} OR RAWTOHEX(ou.PARENT_ORG_UNIT_ID) = :${paramIndex + 1})`);
        bindParams.push(parentIdBuffer, parentIdHex);
        paramIndex += 2;
      }

      // IS_ACTIVE filter (moderately selective)
      if (filters.isActive !== undefined) {
        const isActiveValue = filters.isActive === true || filters.isActive === 'Y' ? 'Y' : 'N';
        conditions.push(`ou.IS_ACTIVE = :${paramIndex}`);
        bindParams.push(isActiveValue);
        paramIndex++;
      }

      // Search filter (least selective, use function-based index if available)
      if (filters.search) {
        const searchValue = `%${filters.search.toUpperCase()}%`;
        conditions.push(`(
          UPPER(ou.ORG_UNIT_CODE) LIKE :${paramIndex} OR
          UPPER(ou.ORG_UNIT_NAME_EN) LIKE :${paramIndex + 1} OR
          UPPER(ou.ORG_UNIT_NAME_AR) LIKE :${paramIndex + 2}
        )`);
        bindParams.push(searchValue, searchValue, searchValue);
        paramIndex += 3;
      }

      const whereClause = ` WHERE ${conditions.join(' AND ')}`;

      const baseSelect = this.ORG_UNIT_SELECT_COLUMNS;
      const baseFrom = this._orgUnitFromJoin;

      if (needsCount) {
        const offset = (pagination.page - 1) * pagination.pageSize;
        const dataQuery = `SELECT /*+ FIRST_ROWS(${pagination.pageSize}) */ ${baseSelect},
          COUNT(*) OVER() AS total
          ${baseFrom}
          ${whereClause}
          ORDER BY ou.ORG_UNIT_NAME_EN, ou.ORG_UNIT_ID
          OFFSET :${paramIndex} ROWS FETCH NEXT :${paramIndex + 1} ROWS ONLY`;
        const dataBindParams = [...bindParams, offset, pagination.pageSize];
        const execOpts = filters.connection ? { connection: filters.connection } : {};
        const result = await this.executeQuery(dataQuery, dataBindParams, execOpts);
        const rows = result.rows || [];
        const totalCount = rows.length > 0 ? (rows[0].total ?? 0) : 0;
        const orgUnits = rows.map((r) => {
          const { total: _total, ...row } = r;
          return this.attachParentUnit(row);
        });
        return { orgUnits, total: totalCount };
      }

      const dataQuery = `SELECT /*+ FIRST_ROWS(100) */ ${baseSelect}
        ${baseFrom}
        ${whereClause}
        ORDER BY ou.ORG_UNIT_NAME_EN, ou.ORG_UNIT_ID`;
      const execOpts = filters.connection ? { connection: filters.connection } : {};
      const result = await this.executeQuery(dataQuery, bindParams, execOpts);
      const orgUnits = (result.rows || []).map((r) => this.attachParentUnit(r));
      return orgUnits;
    } catch (error) {
      throw new Error(`Failed to fetch org units: ${error.message}`);
    }
  }

  /**
   * Map a DB row to parent-option shape { id, name, level }.
   * @private
   */
  static _rowToParentOption(r) {
    return {
      id: r.org_unit_id,
      name: r.org_unit_name_en || r.org_unit_name_ar || null,
      level: r.level_code
    };
  }

  /**
   * Fetch parent options in one SQL round-trip: structure check, level resolution, and paginated org units.
   * Used by GET parents endpoint for minimal latency (one connection, one query).
   *
   * @param {string} structureId - Structure ID (hex32)
   * @param {string} childLevelCode - Child level code (e.g. 'BUSINESS_UNIT')
   * @param {Object} filters - Filters
   * @param {{ page: number, pageSize: number }} filters.pagination - Required
   * @param {string} [filters.search] - Optional search on code/name
   * @param {Object} [options] - Execution options
   * @param {Object} [options.connection] - Reuse this DB connection
   * @returns {Promise<{ structExists: number, isActive: string|null, childLevelFound: number, parentLevelCode: string|null, orgUnits: Array, total: number }>}
   */
  static async findParentOptionsInOneQuery(structureId, childLevelCode, filters = {}, options = {}) {
    const pagination = filters.pagination;
    if (!pagination?.page || !pagination?.pageSize) {
      throw new Error('findParentOptionsInOneQuery requires pagination');
    }
    const offset = (pagination.page - 1) * pagination.pageSize;
    const bindParams = [structureId, childLevelCode, offset, pagination.pageSize];
    let paramIndex = 5;
    const searchCondition = filters.search
      ? ` AND (UPPER(ou.ORG_UNIT_CODE) LIKE UPPER(:${paramIndex}) OR UPPER(ou.ORG_UNIT_NAME_EN) LIKE UPPER(:${paramIndex + 1}) OR UPPER(ou.ORG_UNIT_NAME_AR) LIKE UPPER(:${paramIndex + 2}))`
      : '';
    if (filters.search) {
      const v = `%${filters.search}%`;
      bindParams.push(v, v, v);
      paramIndex += 3;
    }
    const query = `WITH struct AS (SELECT STRUCTURE_ID, IS_ACTIVE FROM ENT.HR_ORG_STRUCTURES WHERE STRUCTURE_ID = HEXTORAW(:1)),
  ordered_levels AS (
    SELECT LEVEL_CODE, ROW_NUMBER() OVER (ORDER BY DISPLAY_ORDER, LEVEL_NUMBER) AS rn
    FROM ENT.HR_ORG_HIERARCHY_LEVELS l
    WHERE l.STRUCTURE_ID = (SELECT STRUCTURE_ID FROM struct) AND l.IS_ACTIVE = 'Y'
  ),
  child_rn AS (SELECT rn FROM ordered_levels WHERE UPPER(LEVEL_CODE) = UPPER(:2)),
  parent_rn AS (SELECT rn - 1 AS prn FROM child_rn WHERE rn > 1),
  parent_level AS (SELECT LEVEL_CODE AS pl FROM ordered_levels o JOIN parent_rn p ON o.rn = p.prn),
  data_set AS (
    SELECT ou.ORG_UNIT_ID, ou.ORG_UNIT_CODE, ou.ORG_UNIT_NAME_EN, ou.ORG_UNIT_NAME_AR, ou.LEVEL_CODE,
           COUNT(*) OVER() AS total
    FROM ${this.TABLE_NAME} ou
    CROSS JOIN struct
    WHERE ou.ORG_STRUCTURE_ID = (SELECT STRUCTURE_ID FROM struct)
      AND EXISTS (SELECT 1 FROM parent_level)
      AND ou.LEVEL_CODE = (SELECT pl FROM parent_level)
      AND ou.IS_ACTIVE = 'Y'${searchCondition}
  ),
  data_ordered AS (SELECT * FROM data_set ORDER BY ORG_UNIT_NAME_EN, ORG_UNIT_ID),
  data_paged AS (SELECT * FROM data_ordered OFFSET :3 ROWS FETCH NEXT :4 ROWS ONLY),
  meta_row AS (
    SELECT 1 AS struct_exists, s.IS_ACTIVE AS is_active, (SELECT pl FROM parent_level) AS parent_level,
           (SELECT COUNT(*) FROM child_rn) AS child_level_found,
           (SELECT NVL(MAX(total),0) FROM data_set) AS total
    FROM struct s
  )
SELECT 0 AS struct_exists, NULL AS is_active, NULL AS parent_level, 0 AS child_level_found, NULL AS org_unit_id, NULL AS org_unit_code, NULL AS org_unit_name_en, NULL AS org_unit_name_ar, NULL AS level_code, 0 AS total FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM struct)
UNION ALL
SELECT m.struct_exists, m.is_active, m.parent_level, m.child_level_found, NULL, NULL, NULL, NULL, NULL, m.total FROM meta_row m
UNION ALL
SELECT NULL, NULL, NULL, NULL, d.ORG_UNIT_ID, d.ORG_UNIT_CODE, d.ORG_UNIT_NAME_EN, d.ORG_UNIT_NAME_AR, d.LEVEL_CODE, d.total FROM data_paged d
ORDER BY 1 DESC NULLS LAST, 10 NULLS LAST`;
    const result = await this.executeQuery(query, bindParams, options);
    const rows = result.rows || [];
    if (rows.length === 0) {
      return { structExists: 0, isActive: null, childLevelFound: 0, parentLevelCode: null, orgUnits: [], total: 0 };
    }
    const first = rows[0];
    const structExists = first.struct_exists ?? 0;
    const isActive = first.is_active;
    const parentLevelCode = first.parent_level ?? first.parent_level_code;
    const childLevelFound = first.child_level_found ?? 0;
    const total = first.total ?? 0;
    const dataRows = rows.filter((r) => r.org_unit_id != null);
    const orgUnits = dataRows.map((r) => this._rowToParentOption(r));
    return { structExists, isActive, childLevelFound, parentLevelCode, orgUnits, total };
  }

  /**
   * Find parent options for a level (structure and level already resolved).
   * When paginated, uses one query with COUNT(*) OVER() for total + page.
   *
   * @param {string} structureId - Structure ID (hex32)
   * @param {string} parentLevelCode - Level code of parent org units
   * @param {Object} filters - Filters
   * @param {string} [filters.search] - Optional search on code/name
   * @param {{ page: number, pageSize: number }} [filters.pagination] - If set, returns { orgUnits, total }
   * @param {Object} [filters.connection] - Optional DB connection to reuse
   * @returns {Promise<{ orgUnits: Array, total: number }|Array>} Paginated: { orgUnits, total }; else array
   */
  static async findParentOptions(structureId, parentLevelCode, filters = {}) {
    try {
      const conditions = [];
      const bindParams = [];
      let paramIndex = 1;

      conditions.push(`ou.ORG_STRUCTURE_ID = HEXTORAW(:${paramIndex})`);
      bindParams.push(structureId);
      paramIndex++;

      conditions.push(`ou.LEVEL_CODE = :${paramIndex}`);
      bindParams.push(parentLevelCode);
      paramIndex++;

      conditions.push(`ou.IS_ACTIVE = :${paramIndex}`);
      bindParams.push('Y');
      paramIndex++;

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
      const pagination = filters.pagination;

      if (pagination && pagination.page && pagination.pageSize) {
        // Single query: data + total via COUNT(*) OVER() (one round-trip instead of COUNT + data)
        const offset = (pagination.page - 1) * pagination.pageSize;
        const dataQuery = `SELECT ou.ORG_UNIT_ID, ou.ORG_UNIT_CODE, ou.ORG_UNIT_NAME_EN, ou.ORG_UNIT_NAME_AR, ou.LEVEL_CODE,
          COUNT(*) OVER() AS total
          FROM ${this.TABLE_NAME} ou
          ${whereClause}
          ORDER BY ou.ORG_UNIT_NAME_EN, ou.ORG_UNIT_ID
          OFFSET :${paramIndex} ROWS FETCH NEXT :${paramIndex + 1} ROWS ONLY`;
        const dataBindParams = [...bindParams, offset, pagination.pageSize];
        const result = await this.executeQuery(dataQuery, dataBindParams, filters.connection ? { connection: filters.connection } : {});
        const rows = result.rows || [];
        const totalCount = rows.length > 0 ? (rows[0].total ?? 0) : 0;
        const parents = rows.map((r) => this._rowToParentOption(r));
        return { orgUnits: parents, total: totalCount };
      }

      const dataQuery = `SELECT
        ou.ORG_UNIT_ID,
        ou.ORG_UNIT_CODE,
        ou.ORG_UNIT_NAME_EN,
        ou.ORG_UNIT_NAME_AR,
        ou.LEVEL_CODE
      FROM ${this.TABLE_NAME} ou
      ${whereClause}
      ORDER BY ou.ORG_UNIT_NAME_EN, ou.ORG_UNIT_ID`;
      const result = await this.executeQuery(dataQuery, bindParams, filters.connection ? { connection: filters.connection } : {});
      const parents = (result.rows || []).map((r) => this._rowToParentOption(r));
      return parents;
    } catch (error) {
      throw new Error(`Failed to fetch parent options: ${error.message}`);
    }
  }

  /**
   * Find org unit by ID (includes parent_unit object)
   * Handles both GUID/RAW and numeric IDs
   * @param {string} orgUnitId - Org unit ID (GUID hex or numeric)
   * @param {string|number|null} structureId - Structure ID (optional)
   * @param {object} [connection] - Optional Oracle connection for use within a transaction (ensures SELECT sees uncommitted changes)
   */
  static async findById(orgUnitId, structureId = null, connection = null) {
    try {
      let query = `SELECT ${this.ORG_UNIT_SELECT_COLUMNS}
      FROM ${this.TABLE_NAME} ou
      LEFT JOIN ${this.TABLE_NAME} p ON p.ORG_UNIT_ID = ou.PARENT_ORG_UNIT_ID
      LEFT JOIN ${this.STRUCTURE_TABLE_NAME} s ON s.STRUCTURE_ID = ou.ORG_STRUCTURE_ID
      WHERE (ou.ORG_UNIT_ID = :1 OR RAWTOHEX(ou.ORG_UNIT_ID) = :2)`;

      const hexId = this.guidToHex(orgUnitId);
      const rawId = this.guidToBuffer(orgUnitId);
      const bindParams = [rawId, hexId];

      if (structureId !== null) {
        query += ` AND ou.ORG_STRUCTURE_ID = HEXTORAW(:3)`;
        bindParams.push(structureId);
      }

      const options = connection ? { connection } : {};
      const result = await this.executeQuery(query, bindParams, options);

      if (result.rows && result.rows.length > 0) {
        return this.attachParentUnit(result.rows[0]);
      }
      return null;
    } catch (error) {
      throw new Error(`Failed to fetch org unit: ${error.message}`);
    }
  }

  /**
   * Find all org units for a structure (includes parent_unit object)
   */
  static async findAllByStructure(structureId) {
    try {
      const query = `SELECT ${this.ORG_UNIT_SELECT_COLUMNS}
      FROM ${this.TABLE_NAME} ou
      LEFT JOIN ${this.TABLE_NAME} p ON p.ORG_UNIT_ID = ou.PARENT_ORG_UNIT_ID
      LEFT JOIN ${this.STRUCTURE_TABLE_NAME} s ON s.STRUCTURE_ID = ou.ORG_STRUCTURE_ID
      WHERE ou.ORG_STRUCTURE_ID = HEXTORAW(:1)
      ORDER BY ou.LEVEL_CODE, ou.ORG_UNIT_NAME_EN, ou.ORG_UNIT_ID`;

      const result = await this.executeQuery(query, [structureId]);
      return (result.rows || []).map(r => this.attachParentUnit(r));
    } catch (error) {
      throw new Error(`Failed to fetch org units: ${error.message}`);
    }
  }

  /**
   * Find all active org units for a structure (minimal data for tree)
   */
  static async findActiveByStructure(structureId) {
    try {
      const query = `SELECT 
        ou.ORG_UNIT_ID,
        ou.LEVEL_CODE,
        ou.ORG_UNIT_CODE,
        ou.ORG_UNIT_NAME_EN,
        ou.ORG_UNIT_NAME_AR,
        ou.PARENT_ORG_UNIT_ID,
        ou.IS_ACTIVE
      FROM ${this.TABLE_NAME} ou
      WHERE ou.ORG_STRUCTURE_ID = HEXTORAW(:1)
        AND ou.IS_ACTIVE = 'Y'
      ORDER BY ou.LEVEL_CODE, ou.ORG_UNIT_NAME_EN, ou.ORG_UNIT_ID`;

      const result = await this.executeQuery(query, [structureId]);
      return result.rows || [];
    } catch (error) {
      throw new Error(`Failed to fetch active org units: ${error.message}`);
    }
  }

  /**
   * Extract minimal data from org unit for tree display
   */
  static toMinimalData(orgUnit) {
    if (!orgUnit) return null;
    
    return {
      org_unit_id: orgUnit.org_unit_id || orgUnit.ORG_UNIT_ID,
      org_unit_code: orgUnit.org_unit_code || orgUnit.ORG_UNIT_CODE,
      org_unit_name_en: orgUnit.org_unit_name_en || orgUnit.ORG_UNIT_NAME_EN,
      org_unit_name_ar: orgUnit.org_unit_name_ar || orgUnit.ORG_UNIT_NAME_AR,
      level_code: orgUnit.level_code || orgUnit.LEVEL_CODE,
      parent_org_unit_id: orgUnit.parent_org_unit_id || orgUnit.PARENT_ORG_UNIT_ID || null,
      is_active: orgUnit.is_active || orgUnit.IS_ACTIVE
    };
  }

  /**
   * Validate parent org unit exists and belongs to structure
   */
  static async validateParent(connection, parentOrgUnitId, structureId, expectedLevelCode) {
    try {
      const query = `SELECT COUNT(*) AS count
        FROM ${this.TABLE_NAME}
        WHERE ORG_UNIT_ID = :1
          AND ORG_STRUCTURE_ID = HEXTORAW(:2)
          AND LEVEL_CODE = :3`;

      const result = await connection.execute(query, [parentOrgUnitId, structureId, expectedLevelCode], {
        outFormat: oracledb.OUT_FORMAT_OBJECT
      });

      const count = result.rows && result.rows.length > 0 ? (result.rows[0].COUNT ?? result.rows[0].count ?? 0) : 0;
      return count > 0;
    } catch {
      return false;
    }
  }

  /**
   * Create org unit (returns record with parent_unit object)
   */
  static async create(structureId, enterpriseId, data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        // Generate ORG_UNIT_ID using SYS_GUID() for GUID/RAW type
        let orgUnitId;
        try {
          const guidQuery = `SELECT SYS_GUID() AS NEXT_ID FROM DUAL`;
          const guidResult = await connection.execute(guidQuery, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
          orgUnitId = this.guidToHex(guidResult.rows[0].NEXT_ID);
        } catch (guidError) {
          // Fallback: try sequence if GUID generation fails
          try {
            const seqQuery = `SELECT ENT.ORG_UNITS_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`;
            const seqResult = await connection.execute(seqQuery, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
            orgUnitId = seqResult.rows[0].NEXT_ID;
          } catch {
            throw new Error(`Failed to generate org unit ID: ${guidError.message}`);
          }
        }

        const now = new Date();

        const isActive = data.is_active !== undefined
          ? (data.is_active === true || data.is_active === 'Y' ? 'Y' : 'N')
          : 'Y';

        let parentOrgUnitId = null;
        if (data.parent_org_unit_id !== undefined) parentOrgUnitId = data.parent_org_unit_id || null;
        else if (data.PARENT_ORG_UNIT_ID !== undefined) parentOrgUnitId = data.PARENT_ORG_UNIT_ID || null;

        const levelCode = data.level_code || data.LEVEL_CODE;
        const orgUnitCode = data.org_unit_code || data.ORG_UNIT_CODE;
        const orgUnitNameEn = data.org_unit_name_en || data.ORG_UNIT_NAME_EN;
        const orgUnitNameAr = data.org_unit_name_ar || data.ORG_UNIT_NAME_AR || null;

        if (!levelCode?.trim()) throw new Error('LEVEL_CODE is required and cannot be empty');
        if (!orgUnitCode?.trim()) throw new Error('ORG_UNIT_CODE is required and cannot be empty');
        if (!orgUnitNameEn?.trim()) throw new Error('ORG_UNIT_NAME_EN is required and cannot be empty');

        const insertQuery = `INSERT INTO ${this.TABLE_NAME} (
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
          :1,:2,:3,:4,:5,:6,:7,:8,:9,:10,:11,:12,:13,:14,:15,:16,:17,:18,:19,:20,:21
        )`;

        const bindParams = [
          orgUnitId,
          structureId,
          enterpriseId || null,
          levelCode,
          orgUnitCode,
          orgUnitNameEn,
          orgUnitNameAr,
          parentOrgUnitId ? this.guidToBuffer(parentOrgUnitId) : null,
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

        // Convert GUID to proper format for Oracle RAW type binding
        bindParams[0] = this.guidToBuffer(orgUnitId);
        bindParams[1] = this.guidToBuffer(structureId);

        await connection.execute(insertQuery, bindParams, { outFormat: oracledb.OUT_FORMAT_OBJECT });

        // Prepare finalOrgUnitId for querying - use hex string format
        const finalOrgUnitId = this.guidToHex(orgUnitId);
        const hexId = finalOrgUnitId;
        const rawId = this.guidToBuffer(orgUnitId);

        const selectQuery = `SELECT ${this.ORG_UNIT_SELECT_COLUMNS}
        FROM ${this.TABLE_NAME} ou
        LEFT JOIN ${this.TABLE_NAME} p ON p.ORG_UNIT_ID = ou.PARENT_ORG_UNIT_ID
        LEFT JOIN ${this.STRUCTURE_TABLE_NAME} s ON s.STRUCTURE_ID = ou.ORG_STRUCTURE_ID
        WHERE ou.ORG_STRUCTURE_ID = HEXTORAW(:1) 
          AND (ou.ORG_UNIT_ID = :2 OR RAWTOHEX(ou.ORG_UNIT_ID) = :3)`;

        let selectResult = await connection.execute(selectQuery, [structureId, rawId, hexId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        // If that didn't work, try using ROWID (get the most recently inserted row for this structure)
        if (!selectResult.rows || selectResult.rows.length === 0) {
          const rowidQuery = `SELECT ${this.ORG_UNIT_SELECT_COLUMNS}
          FROM ${this.TABLE_NAME} ou
          LEFT JOIN ${this.TABLE_NAME} p ON p.ORG_UNIT_ID = ou.PARENT_ORG_UNIT_ID
          LEFT JOIN ${this.STRUCTURE_TABLE_NAME} s ON s.STRUCTURE_ID = ou.ORG_STRUCTURE_ID
          WHERE ou.ORG_STRUCTURE_ID = HEXTORAW(:1)
            AND ou.ORG_UNIT_CODE = :2
            AND ou.LEVEL_CODE = :3
            AND ROWNUM = 1
          ORDER BY ou.CREATED_DATE DESC`;

          selectResult = await connection.execute(rowidQuery, [
            structureId,
            data.org_unit_code || data.ORG_UNIT_CODE,
            data.level_code || data.LEVEL_CODE
          ], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
        }

        if (!selectResult.rows || selectResult.rows.length === 0) {
          throw new Error(`Failed to retrieve created org unit with ID ${finalOrgUnitId}`);
        }

        // Convert keys and attach parent_unit object
        const row = this.convertKeysToSnakeCase(selectResult.rows[0]);
        return this.attachParentUnit(row);
      });
    } catch (error) {
      if (error.errorNum === 1 || error.message?.includes('ORA-00001')) {
        const codeAttempted = data.org_unit_code || data.ORG_UNIT_CODE || 'UNKNOWN';
        const nameAttempted = data.org_unit_name_en || data.ORG_UNIT_NAME_EN || 'UNKNOWN';
        const constraintError = new Error(
          `An org unit with code '${codeAttempted}' or name '${nameAttempted}' already exists in this structure.`
        );
        constraintError.statusCode = 409;
        constraintError.code = 'UNIQUE_CONSTRAINT_VIOLATION';
        throw constraintError;
      }

      if (error.errorNum === 2291 || error.message?.includes('ORA-02291')) {
        const constraintError = new Error('Referenced parent org unit does not exist.');
        constraintError.statusCode = 400;
        constraintError.code = 'FOREIGN_KEY_CONSTRAINT';
        throw constraintError;
      }

      if (error.errorNum === 1400 || error.message?.includes('ORA-01400')) {
        const columnMatch =
          error.message?.match(/cannot insert NULL into \("([^"]+)"\."([^"]+)"\."([^"]+)"/i) ||
          error.message?.match(/column "([^"]+)"/i);
        const columnName = columnMatch ? (columnMatch[3] || columnMatch[1]) : 'UNKNOWN';
        const constraintError = new Error(`Required field '${columnName}' cannot be null.`);
        constraintError.statusCode = 400;
        constraintError.code = 'NOT_NULL_CONSTRAINT';
        throw constraintError;
      }

      throw new Error(`Failed to create org unit: ${error.message}`);
    }
  }

  /**
   * Update org unit (returns record with parent_unit object)
   */
  static async update(orgUnitId, structureId, data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        const updateFields = [];
        const bindParams = [];
        let paramIndex = 1;

        const setIfProvided = (col, snake, upper, transform = v => v) => {
          const val = data[snake] !== undefined ? data[snake] : data[upper];
          if (val !== undefined) {
            // Convert empty strings to null for optional fields
            const processedVal = (val === '' || val === null) ? null : val;
            updateFields.push(`${col} = :${paramIndex}`);
            bindParams.push(transform(processedVal));
            paramIndex++;
          }
        };

        setIfProvided('ORG_UNIT_CODE', 'org_unit_code', 'ORG_UNIT_CODE');
        setIfProvided('ORG_UNIT_NAME_EN', 'org_unit_name_en', 'ORG_UNIT_NAME_EN');
        setIfProvided('ORG_UNIT_NAME_AR', 'org_unit_name_ar', 'ORG_UNIT_NAME_AR', v => (v === null ? null : v));
        setIfProvided('IS_ACTIVE', 'is_active', 'IS_ACTIVE', v => (v === true || v === 'Y' ? 'Y' : 'N'));
        
        // Handle PARENT_ORG_UNIT_ID with GUID conversion
        if (data.parent_org_unit_id !== undefined || data.PARENT_ORG_UNIT_ID !== undefined) {
          let parentId = data.parent_org_unit_id ?? data.PARENT_ORG_UNIT_ID ?? null;
          
          // Handle empty strings and trim whitespace
          if (parentId && typeof parentId === 'string') {
            parentId = parentId.trim();
            if (parentId === '') {
              parentId = null;
            }
          }
          
          if (parentId) {
            updateFields.push(`PARENT_ORG_UNIT_ID = :${paramIndex}`);
            bindParams.push(this.guidToBuffer(parentId));
            paramIndex++;
          } else {
            updateFields.push(`PARENT_ORG_UNIT_ID = :${paramIndex}`);
            bindParams.push(null);
            paramIndex++;
          }
        }
        
        setIfProvided('MANAGER_NAME', 'manager_name', 'MANAGER_NAME', v => (v === null || v === '' ? null : v));
        setIfProvided('MANAGER_EMAIL', 'manager_email', 'MANAGER_EMAIL', v => (v === null || v === '' ? null : v));
        setIfProvided('MANAGER_PHONE', 'manager_phone', 'MANAGER_PHONE', v => (v === null || v === '' ? null : v));
        setIfProvided('LOCATION', 'location', 'LOCATION', v => (v === null || v === '' ? null : v));
        setIfProvided('CITY', 'city', 'CITY', v => (v === null || v === '' ? null : v));
        setIfProvided('ADDRESS', 'address', 'ADDRESS', v => (v === null || v === '' ? null : v));
        setIfProvided('DESCRIPTION', 'description', 'DESCRIPTION', v => (v === null || v === '' ? null : v));
        setIfProvided('LAST_UPDATE_LOGIN', 'last_update_login', 'LAST_UPDATE_LOGIN', v => (v === null || v === '' ? null : v));

        if (updateFields.length === 0) throw new Error('No fields to update');

        updateFields.push(`LAST_UPDATED_BY = :${paramIndex}`);
        bindParams.push(userId || 'SYSTEM');
        paramIndex++;

        updateFields.push(`LAST_UPDATED_DATE = :${paramIndex}`);
        bindParams.push(new Date());
        paramIndex++;

        // Handle GUID in WHERE clause - support both RAW and hex string formats
        const orgUnitIdBuffer = this.guidToBuffer(orgUnitId);
        const orgUnitIdHex = this.guidToHex(orgUnitId);
        bindParams.push(orgUnitIdBuffer, orgUnitIdHex, structureId);

        const query = `UPDATE ${this.TABLE_NAME}
          SET ${updateFields.join(', ')}
          WHERE (ORG_UNIT_ID = :${paramIndex} OR RAWTOHEX(ORG_UNIT_ID) = :${paramIndex + 1}) 
            AND ORG_STRUCTURE_ID = HEXTORAW(:${paramIndex + 2})`;

        const updateResult = await connection.execute(query, bindParams, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        
        // Check if any rows were updated
        const rowsAffected = updateResult.rowsAffected || updateResult.rowCount || 0;
        if (!rowsAffected) {
          throw new Error(`No org unit found with ID ${orgUnitId} in structure ${structureId}`);
        }

        // Use same connection so SELECT sees uncommitted UPDATE (avoids stale data in response)
        return await this.findById(orgUnitId, structureId, connection);
      });
    } catch (error) {
      if (error.errorNum === 1 || error.message?.includes('ORA-00001')) {
        const constraintError = new Error('An org unit with the same code already exists in this structure.');
        constraintError.statusCode = 409;
        constraintError.code = 'UNIQUE_CONSTRAINT_VIOLATION';
        throw constraintError;
      }

      if (error.errorNum === 2291 || error.message?.includes('ORA-02291')) {
        const constraintError = new Error('Referenced parent org unit does not exist.');
        constraintError.statusCode = 400;
        constraintError.code = 'FOREIGN_KEY_CONSTRAINT';
        throw constraintError;
      }

      // Handle mutating table trigger error (ORA-04091)
      // This is a database trigger issue, not a validation issue
      if (error.errorNum === 4091 || error.message?.includes('ORA-04091') || error.message?.includes('mutating')) {
        // Extract trigger name if available
        const triggerMatch = error.message?.match(/trigger ['"]([^'"]+)['"]/i);
        const triggerName = triggerMatch ? triggerMatch[1] : 'database trigger';
        
        // This error occurs when a database trigger tries to read from the table being updated
        // The application-level validation should have caught any issues, so this is likely a trigger bug
        const constraintError = new Error(
          `Database trigger error: The update operation failed due to a database trigger issue. ` +
          `The parent org unit validation was performed, but the database trigger '${triggerName}' encountered an error. ` +
          `This may indicate a database configuration issue. Please contact the database administrator.`
        );
        constraintError.statusCode = 500;
        constraintError.code = 'DATABASE_TRIGGER_ERROR';
        constraintError.triggerName = triggerName;
        constraintError.originalError = error;
        throw constraintError;
      }

      // Re-throw with more context
      const errorMessage = error.message || 'Unknown error';
      const enhancedError = new Error(`Failed to update org unit: ${errorMessage}`);
      enhancedError.originalError = error;
      throw enhancedError;
    }
  }

  /**
   * Soft delete an org unit
   */
  static async softDelete(orgUnitId, structureId, userId) {
    try {
      await this.executeWithTransaction(async (connection) => {
        const now = new Date();
        const orgUnitIdBuffer = this.guidToBuffer(orgUnitId);
        const orgUnitIdHex = this.guidToHex(orgUnitId);
        
        const query = `UPDATE ${this.TABLE_NAME}
          SET IS_ACTIVE = 'N',
              LAST_UPDATED_BY = :1,
              LAST_UPDATED_DATE = :2
          WHERE (ORG_UNIT_ID = :3 OR RAWTOHEX(ORG_UNIT_ID) = :4) 
            AND ORG_STRUCTURE_ID = HEXTORAW(:5)`;

        const updateResult = await connection.execute(
          query, 
          [userId || 'SYSTEM', now, orgUnitIdBuffer, orgUnitIdHex, structureId], 
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const rowsAffected = updateResult.rowsAffected || updateResult.rowCount || 0;
        if (!rowsAffected) throw new Error(`No org unit found with ID: ${orgUnitId} in structure ${structureId}`);
      });

      return true;
    } catch (error) {
      throw new Error(`Failed to delete org unit: ${error.message}`);
    }
  }

  /**
   * Hard delete an org unit
   */
  static async hardDelete(orgUnitId, structureId) {
    try {
      await this.executeWithTransaction(async (connection) => {
        const orgUnitIdBuffer = this.guidToBuffer(orgUnitId);
        const orgUnitIdHex = this.guidToHex(orgUnitId);
        
        const query = `DELETE FROM ${this.TABLE_NAME}
          WHERE (ORG_UNIT_ID = :1 OR RAWTOHEX(ORG_UNIT_ID) = :2) 
            AND ORG_STRUCTURE_ID = HEXTORAW(:3)`;

        const deleteResult = await connection.execute(
          query, 
          [orgUnitIdBuffer, orgUnitIdHex, structureId], 
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const rowsAffected = deleteResult.rowsAffected || deleteResult.rowCount || 0;
        if (!rowsAffected) throw new Error(`No org unit found with ID: ${orgUnitId} in structure ${structureId}`);
      });

      return { success: true };
    } catch (error) {
      if (error.errorNum === 2292 || error.message?.includes('ORA-02292')) {
        const constraintError = new Error('Cannot delete org unit: This org unit is referenced by other records.');
        constraintError.statusCode = 409;
        constraintError.code = 'FOREIGN_KEY_CONSTRAINT';
        constraintError.suggestion =
          'Use soft delete (?soft=true) to deactivate this org unit instead of permanently deleting it.';
        throw constraintError;
      }

      throw new Error(`Failed to delete org unit: ${error.message}`);
    }
  }

  /**
   * Build tree structure from flat org units array
   * ✅ Uses parent_unit.id if present, else fallback to parent_org_unit_id
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

      // Prefer parent_unit.id (new response format)
      const parentId =
        unit.parent_unit?.id ??
        unit.parent_org_unit_id ??
        unit.PARENT_ORG_UNIT_ID ??
        null;

      if (parentId && unitMap.has(parentId)) {
        unitMap.get(parentId).children.push(unitMap.get(unitId));
      } else {
        roots.push(unitMap.get(unitId));
      }
    });

    return roots;
  }

  /**
   * Build tree structure with minimal data from flat org units array
   */
  static buildMinimalTree(orgUnits) {
    const unitMap = new Map();
    const roots = [];

    // Normalize GUIDs to uppercase hex strings for consistent comparison
    const normalizeId = (id) => {
      if (!id) return null;
      if (Buffer.isBuffer(id)) {
        return id.toString('hex').toUpperCase();
      }
      return String(id).toUpperCase().trim();
    };

    orgUnits.forEach(unit => {
      const minimal = this.toMinimalData(unit);
      if (minimal) {
        const unitId = normalizeId(minimal.org_unit_id);
        if (unitId) {
          unitMap.set(unitId, { ...minimal, org_unit_id: unitId, children: [] });
        }
      }
    });

    orgUnits.forEach(unit => {
      const minimal = this.toMinimalData(unit);
      if (!minimal) return;

      const unitId = normalizeId(minimal.org_unit_id);
      const parentId = normalizeId(minimal.parent_org_unit_id);

      if (!unitId) return;

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
