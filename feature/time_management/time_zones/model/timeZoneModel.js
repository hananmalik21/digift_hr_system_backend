import db from '../../../../config/db.js';
import oracledb from 'oracledb';

/**
 * Time Zone Model
 * Handles read-only database operations for ENT.TIME_ZONES table.
 * Table has at least TZ_NAME; filter by name (TZ_NAME) and pagination supported.
 */
class TimeZoneModel {
  static TABLE_NAME = 'ENT.TIME_ZONES';

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
      converted[newKey] =
        typeof value === 'object' && value !== null && !(value instanceof Date) && !(value instanceof Buffer)
          ? this.convertKeysToSnakeCase(value)
          : value;
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

  /**
   * Find all time zones with optional filter by name and pagination.
   * @param {Object} filters - { name, pagination: { page, pageSize } }
   * @returns {Promise<{ rows: Array, total?: number }>}
   */
  static async findAll(filters = {}) {
    const conditions = [];
    const bindParams = [];
    let paramIndex = 1;

    if (filters.name != null && String(filters.name).trim() !== '') {
      conditions.push(`UPPER(TZ_NAME) LIKE UPPER(:${paramIndex})`);
      bindParams.push(`%${String(filters.name).trim()}%`);
      paramIndex++;
    }

    const whereClause = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    const countQuery = `SELECT COUNT(*) AS total FROM ${this.TABLE_NAME}${whereClause}`;
    const dataQuery = `SELECT * FROM ${this.TABLE_NAME}${whereClause} ORDER BY TZ_NAME`;

    const countBindParams = [...bindParams];
    const dataBindParams = [...bindParams];

    const pagination = filters.pagination;
    let totalCount = 0;

    if (pagination?.page != null && pagination?.pageSize != null) {
      const offset = (pagination.page - 1) * pagination.pageSize;
      dataBindParams.push(offset, pagination.pageSize);
      const offsetParam = paramIndex;
      const fetchParam = paramIndex + 1;
      const paginatedQuery = `${dataQuery} OFFSET :${offsetParam} ROWS FETCH NEXT :${fetchParam} ROWS ONLY`;

      const [dataResult, countResult] = await Promise.all([
        this.executeQuery(paginatedQuery, dataBindParams),
        this.executeQuery(countQuery, countBindParams)
      ]);
      totalCount = countResult.rows?.[0]?.total ?? 0;
      return { rows: dataResult.rows || [], total: totalCount };
    }

    const result = await this.executeQuery(dataQuery, dataBindParams);
    return { rows: result.rows || [], total: result.rows?.length ?? 0 };
  }
}

export default TimeZoneModel;
