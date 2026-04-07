import db from '../../../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError } from '../../../../../utils/errors/index.js';
import { ensureHex32, hexToRawBuffer, generateSysGuid } from '../../../../../utils/guidUtils.js';

/**
 * Comp Lookup Value Model
 * Handles all database operations for COMP.COMP_LOOKUP_VALUES table.
 */
class CompLookupValueModel {
  static TABLE_NAME = 'COMP.COMP_LOOKUP_VALUES';

  static ROW_OBJECT = { outFormat: oracledb.OUT_FORMAT_OBJECT };

  /** Matched in errors that must propagate to the client as 400 (not wrapped as DatabaseError). */
  static UNSUPPORTED_COMPONENT_CHART_MSG_SUBSTR = 'not supported for component usage counts';

  /**
   * Maps COMP.COMP_LOOKUP_TYPES.TYPE_CODE (uppercase) to COMP.COMPONENTS_VIEW column
   * for “how many components use this lookup value_code” chart data.
   * Only whitelisted keys are interpolated into SQL (safe).
   */
  static COMPONENT_CHART_TYPE_TO_VIEW_COL = Object.freeze({
    CATEGORY: 'COMP_CATEGORY_CODE',
    COMP_CATEGORY: 'COMP_CATEGORY_CODE',
    COMPONENT_CATEGORY: 'COMP_CATEGORY_CODE',
    COMPONENT_TYPE: 'COMPONENT_TYPE_CODE',
    COMPONENT_TYPE_CODE: 'COMPONENT_TYPE_CODE',
    CALCULATION_METHOD: 'CALCULATION_METHOD_CODE',
    CALCULATION_METHOD_CODE: 'CALCULATION_METHOD_CODE',
    COMP_CALC_METHOD: 'CALCULATION_METHOD_CODE',
    STATUS: 'STATUS',
    COMPONENT_STATUS: 'STATUS',
    CURRENCY: 'CURRENCY_CODE',
    CURRENCY_CODE: 'CURRENCY_CODE',
    BASE_AMOUNT_SOURCE: 'BASE_AMOUNT_SOURCE'
  });

  /** @returns {string[]} TYPE_CODE values accepted for component usage charts */
  static listSupportedComponentChartLookupTypeCodes() {
    return Object.keys(CompLookupValueModel.COMPONENT_CHART_TYPE_TO_VIEW_COL).sort();
  }

  /**
   * @param {string} typeCodeUpper - trimmed lookup type code, uppercase
   * @returns {string|null} COMPONENTS_VIEW column name
   */
  static getComponentViewColumnForLookupTypeCode(typeCodeUpper) {
    return CompLookupValueModel.COMPONENT_CHART_TYPE_TO_VIEW_COL[typeCodeUpper] ?? null;
  }

  /** User-facing message when lookup_type_code has no component chart mapping */
  static unsupportedComponentChartTypeMessage(typeCodeTrim) {
    const supported = CompLookupValueModel.listSupportedComponentChartLookupTypeCodes().join(', ');
    return `lookup_type_code "${typeCodeTrim}" is not supported for component usage counts. Supported type codes: ${supported}`;
  }

  /** Appends optional ACTIVE_FLAG filter and standard ORDER BY for graph-count queries. */
  static finalizeGraphCountsSql(baseSql, binds, activeFlag) {
    let sql = baseSql;
    if (activeFlag !== undefined) {
      sql += ` AND a.ACTIVE_FLAG = :active_flag`;
      binds.active_flag = activeFlag;
    }
    return `${sql} ORDER BY a.DISPLAY_SEQUENCE, a.VALUE_CODE`;
  }

  /**
   * @param {object} filters - expects tenantId or tenant_id
   * @throws {Error} tenant_id is required / invalid
   * @returns {number}
   */
  static parseRequiredTenantIdNum(filters) {
    const tenantId = filters.tenantId ?? filters.tenant_id;
    if (tenantId === undefined || tenantId === null || tenantId === '') {
      throw new Error('tenant_id is required');
    }
    const tenantIdNum = Number(tenantId);
    if (!Number.isFinite(tenantIdNum) || tenantIdNum < 1) {
      throw new Error('tenant_id must be a valid positive number');
    }
    return tenantIdNum;
  }

  /** Normalizes API boolean / Y / 1 to Oracle ACTIVE_FLAG. */
  static coerceActiveFlagYn(value) {
    if (value === undefined) return undefined;
    return value === true || value === 'Y' || value === 1 || value === 'y' ? 'Y' : 'N';
  }

  static parseGraphFilters(filters = {}) {
    const tenantIdNum = this.parseRequiredTenantIdNum(filters);
    const typeCode = filters.lookupTypeCode ?? filters.lookup_type_code;
    if (typeCode === undefined || typeCode === null || String(typeCode).trim() === '') {
      throw new Error('lookup_type_code is required');
    }
    const typeCodeTrim = String(typeCode).trim();

    let activeFlag = undefined;
    if (filters.activeFlag !== undefined) {
      activeFlag = this.coerceActiveFlagYn(filters.activeFlag);
    }

    return { tenantIdNum, typeCodeTrim, typeCodeUpper: typeCodeTrim.toUpperCase(), activeFlag };
  }

  /** Shared catch path for graph-count SQL (preserves unsupported-type client errors). */
  static rethrowGraphCountsError(error) {
    if (
      error instanceof Error &&
      error.message.includes(CompLookupValueModel.UNSUPPORTED_COMPONENT_CHART_MSG_SUBSTR)
    ) {
      throw error;
    }
    if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
      throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
    }
    if (error instanceof DatabaseError) throw error;
    throw new DatabaseError('Failed to fetch lookup value graph counts', error);
  }

  static convertKeysToSnakeCase(obj) {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date) return obj;
    if (obj instanceof Buffer) {
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
        converted[newKey] = value.toString('hex').toUpperCase();
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
      ...this.ROW_OBJECT,
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

  static async getNextDisplaySequence(connection, lookupTypeId) {
    const query = `SELECT NVL(MAX(DISPLAY_SEQUENCE), 0) + 1 AS NEXT_SEQ FROM ${this.TABLE_NAME} WHERE LOOKUP_TYPE_ID = :1`;
    const result = await connection.execute(query, [lookupTypeId], this.ROW_OBJECT);
    return result.rows[0]?.NEXT_SEQ ?? 1;
  }

  static async findAll(filters = {}) {
    try {
      const tenantIdNum = this.parseRequiredTenantIdNum(filters);

      const useTypeCodeJoin = filters.lookupTypeCode != null && String(filters.lookupTypeCode).trim() !== '';
      const fromClause = useTypeCodeJoin
        ? `FROM ${this.TABLE_NAME} a INNER JOIN COMP.COMP_LOOKUP_TYPES t ON a.LOOKUP_TYPE_ID = t.LOOKUP_TYPE_ID`
        : `FROM ${this.TABLE_NAME} a`;

      let countQuery = `SELECT COUNT(*) AS total ${fromClause}`;
      let dataQuery = `SELECT
        RAWTOHEX(a.LOOKUP_VALUE_GUID) AS LOOKUP_VALUE_GUID,
        a.LOOKUP_VALUE_ID,
        a.TENANT_ID,
        a.LOOKUP_TYPE_ID,
        a.VALUE_CODE,
        a.VALUE_NAME,
        a.DISPLAY_SEQUENCE,
        a.ACTIVE_FLAG,
        a.CREATED_BY,
        a.CREATION_DATE,
        a.LAST_UPDATED_BY,
        a.LAST_UPDATE_DATE
      ${fromClause}`;

      const conditions = [];
      const bindParams = [];
      let paramIndex = 1;

      conditions.push(`(a.TENANT_ID = :${paramIndex} OR a.TENANT_ID IS NULL)`);
      bindParams.push(tenantIdNum);
      paramIndex++;

      if (filters.lookupTypeCode != null && String(filters.lookupTypeCode).trim() !== '') {
        conditions.push(`UPPER(t.TYPE_CODE) = UPPER(:${paramIndex})`);
        bindParams.push(String(filters.lookupTypeCode).trim());
        paramIndex++;
      }
      if (filters.lookupTypeId !== undefined) {
        conditions.push(`a.LOOKUP_TYPE_ID = :${paramIndex}`);
        bindParams.push(filters.lookupTypeId);
        paramIndex++;
      }
      if (filters.activeFlag !== undefined) {
        const v = this.coerceActiveFlagYn(filters.activeFlag);
        conditions.push(`a.ACTIVE_FLAG = :${paramIndex}`);
        bindParams.push(v);
        paramIndex++;
      }
      if (filters.search) {
        const searchValue = `%${filters.search}%`;
        conditions.push(`(
          UPPER(a.VALUE_CODE) LIKE UPPER(:${paramIndex}) OR
          UPPER(a.VALUE_NAME) LIKE UPPER(:${paramIndex + 1})
        )`);
        bindParams.push(searchValue, searchValue);
        paramIndex += 2;
      }

      if (conditions.length > 0) {
        const whereClause = ` WHERE ${conditions.join(' AND ')}`;
        countQuery += whereClause;
        dataQuery += whereClause;
      }

      const pagination = filters.pagination || {};
      const page = pagination.page || 1;
      const pageSize = pagination.pageSize || 10;
      const offset = (page - 1) * pageSize;

      const countResult = await this.executeQuery(countQuery, bindParams);
      const total = countResult.rows[0]?.total || 0;

      dataQuery += ` ORDER BY a.LOOKUP_TYPE_ID, a.DISPLAY_SEQUENCE, a.VALUE_CODE`;
      dataQuery += ` OFFSET :${paramIndex} ROWS FETCH NEXT :${paramIndex + 1} ROWS ONLY`;
      bindParams.push(offset, pageSize);

      const dataResult = await this.executeQuery(dataQuery, bindParams);
      return {
        lookupValues: dataResult.rows || [],
        total
      };
    } catch (error) {
      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(
          DatabaseError.getUserFriendlyMessage(error),
          error
        );
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to fetch lookup values', error);
    }
  }

  /**
   * Chart data: each lookup value for a COMP lookup type with count of components in
   * COMP.COMPONENTS_VIEW where TENANT_ID matches and the view column for that type matches VALUE_CODE.
   * @param {{ tenantId: number, lookupTypeCode: string, activeFlag?: boolean }} filters
   * @returns {Promise<Array<{ lookup_value_id, value_code, value_name, display_sequence, usage_count }>>}
   */
  static async findGraphCountsByLookupTypeCode(filters = {}) {
    try {
      const { tenantIdNum, typeCodeTrim, typeCodeUpper, activeFlag } = this.parseGraphFilters(filters);
      const col = this.getComponentViewColumnForLookupTypeCode(typeCodeUpper);
      if (!col) {
        throw new Error(this.unsupportedComponentChartTypeMessage(typeCodeTrim));
      }

      const baseSql = `
SELECT
  a.LOOKUP_VALUE_ID,
  a.VALUE_CODE,
  a.VALUE_NAME,
  a.DISPLAY_SEQUENCE,
  NVL(usage_cnt.CNT, 0) AS USAGE_COUNT
FROM ${this.TABLE_NAME} a
INNER JOIN COMP.COMP_LOOKUP_TYPES t ON a.LOOKUP_TYPE_ID = t.LOOKUP_TYPE_ID
LEFT JOIN (
  SELECT UPPER(TRIM(c.${col})) AS code_key, COUNT(*) AS CNT
  FROM COMP.COMPONENTS_VIEW c
  WHERE c.TENANT_ID = :tenant_id
    AND c.${col} IS NOT NULL
  GROUP BY UPPER(TRIM(c.${col}))
) usage_cnt ON usage_cnt.code_key = UPPER(TRIM(a.VALUE_CODE))
WHERE (a.TENANT_ID = :tenant_id OR a.TENANT_ID IS NULL)
  AND UPPER(t.TYPE_CODE) = UPPER(:lookup_type_code)`;

      const binds = {
        tenant_id: tenantIdNum,
        lookup_type_code: typeCodeTrim
      };
      const query = this.finalizeGraphCountsSql(baseSql, binds, activeFlag);

      const result = await this.executeQuery(query, binds);
      return result.rows || [];
    } catch (error) {
      this.rethrowGraphCountsError(error);
    }
  }

  /**
   * Chart data: each lookup value for a type (e.g. PLAN_TYPE) with count of rows in
   * COMP.COMP_PLANS_FULL_V where enterprise/tenant matches and PLAN_TYPE_CODE matches VALUE_CODE.
   * @param {{ tenantId: number, lookupTypeCode: string, activeFlag?: boolean }} filters
   * @returns {Promise<Array<{ lookup_value_id, value_code, value_name, display_sequence, plan_type_count }>>}
   */
  static async findGraphCountsPlansByPlanType(filters = {}) {
    try {
      const { tenantIdNum, typeCodeTrim, activeFlag } = this.parseGraphFilters(filters);

      const baseSql = `
SELECT
  a.LOOKUP_VALUE_ID,
  a.VALUE_CODE,
  a.VALUE_NAME,
  a.DISPLAY_SEQUENCE,
  NVL(pt_cnt.CNT, 0) AS PLAN_TYPE_COUNT
FROM ${this.TABLE_NAME} a
INNER JOIN COMP.COMP_LOOKUP_TYPES t ON a.LOOKUP_TYPE_ID = t.LOOKUP_TYPE_ID
LEFT JOIN (
  SELECT UPPER(TRIM(p.PLAN_TYPE_CODE)) AS code_key, COUNT(*) AS CNT
  FROM COMP.COMP_PLANS_FULL_V p
  WHERE p.ENTERPRISE_ID = :tenant_id
    AND p.PLAN_TYPE_CODE IS NOT NULL
  GROUP BY UPPER(TRIM(p.PLAN_TYPE_CODE))
) pt_cnt ON pt_cnt.code_key = UPPER(TRIM(a.VALUE_CODE))
WHERE (a.TENANT_ID = :tenant_id OR a.TENANT_ID IS NULL)
  AND UPPER(t.TYPE_CODE) = UPPER(:lookup_type_code)`;

      const binds = {
        tenant_id: tenantIdNum,
        lookup_type_code: typeCodeTrim
      };
      const query = this.finalizeGraphCountsSql(baseSql, binds, activeFlag);

      const result = await this.executeQuery(query, binds);
      return result.rows || [];
    } catch (error) {
      this.rethrowGraphCountsError(error);
    }
  }

  static async findByGuid(guidHex32) {
    try {
      const hexGuid = ensureHex32(guidHex32, 'guid');
      const guidBuffer = hexToRawBuffer(hexGuid);

      const query = `SELECT
        RAWTOHEX(a.LOOKUP_VALUE_GUID) AS LOOKUP_VALUE_GUID,
        a.LOOKUP_VALUE_ID,
        a.TENANT_ID,
        a.LOOKUP_TYPE_ID,
        a.VALUE_CODE,
        a.VALUE_NAME,
        a.DISPLAY_SEQUENCE,
        a.ACTIVE_FLAG,
        a.CREATED_BY,
        a.CREATION_DATE,
        a.LAST_UPDATED_BY,
        a.LAST_UPDATE_DATE
      FROM ${this.TABLE_NAME} a
      WHERE a.LOOKUP_VALUE_GUID = :1`;

      const result = await this.executeQuery(query, [guidBuffer]);
      if (result.rows && result.rows.length > 0) {
        return result.rows[0];
      }
      return null;
    } catch (error) {
      if (error.message?.includes('must be a 32-character hex GUID')) throw error;
      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(
          DatabaseError.getUserFriendlyMessage(error),
          error
        );
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to fetch lookup value', error);
    }
  }

  static async create(data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        let lookupValueId;
        try {
          const seqQuery = `SELECT COMP.COMP_LOOKUP_VALUES_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`;
          const seqResult = await connection.execute(seqQuery, [], this.ROW_OBJECT);
          lookupValueId = seqResult.rows[0].NEXT_ID;
        } catch (_) {
          const maxQuery = `SELECT NVL(MAX(LOOKUP_VALUE_ID), 0) + 1 AS NEXT_ID FROM ${this.TABLE_NAME}`;
          const maxResult = await connection.execute(maxQuery, [], this.ROW_OBJECT);
          lookupValueId = maxResult.rows[0].NEXT_ID;
        }

        const lookupTypeId = data.LOOKUP_TYPE_ID ?? null;
        const displaySequence = data.DISPLAY_SEQUENCE != null
          ? Number(data.DISPLAY_SEQUENCE)
          : await this.getNextDisplaySequence(connection, lookupTypeId);

        const { buffer: guidBuffer } = await generateSysGuid(connection);
        const now = new Date();

        const tenantId = data.TENANT_ID != null && data.TENANT_ID !== '' ? Number(data.TENANT_ID) : null;

        const query = `INSERT INTO ${this.TABLE_NAME} (
          LOOKUP_VALUE_GUID,
          LOOKUP_VALUE_ID,
          TENANT_ID,
          LOOKUP_TYPE_ID,
          VALUE_CODE,
          VALUE_NAME,
          DISPLAY_SEQUENCE,
          ACTIVE_FLAG,
          CREATED_BY,
          CREATION_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATE_DATE
        ) VALUES (
          :1, :2, :3, :4, :5, :6, :7, :8, :9, :10, :11, :12
        )`;

        const bindParams = [
          guidBuffer,
          lookupValueId,
          tenantId,
          lookupTypeId,
          data.VALUE_CODE ?? null,
          data.VALUE_NAME ?? null,
          displaySequence,
          data.ACTIVE_FLAG !== undefined && data.ACTIVE_FLAG !== null
            ? this.coerceActiveFlagYn(data.ACTIVE_FLAG)
            : 'Y',
          userId || 'SYSTEM',
          now,
          userId || 'SYSTEM',
          now
        ];

        await connection.execute(query, bindParams, this.ROW_OBJECT);

        const selectQuery = `SELECT
          RAWTOHEX(a.LOOKUP_VALUE_GUID) AS LOOKUP_VALUE_GUID,
          a.LOOKUP_VALUE_ID,
          a.TENANT_ID,
          a.LOOKUP_TYPE_ID,
          a.VALUE_CODE,
          a.VALUE_NAME,
          a.DISPLAY_SEQUENCE,
          a.ACTIVE_FLAG,
          a.CREATED_BY,
          a.CREATION_DATE,
          a.LAST_UPDATED_BY,
          a.LAST_UPDATE_DATE
        FROM ${this.TABLE_NAME} a
        WHERE a.LOOKUP_VALUE_ID = :1`;

        const selectResult = await connection.execute(selectQuery, [lookupValueId], this.ROW_OBJECT);

        if (selectResult.rows && selectResult.rows.length > 0) {
          return this.convertKeysToSnakeCase(selectResult.rows[0]);
        }
        throw new DatabaseError('Failed to retrieve created lookup value');
      });
    } catch (error) {
      if (error.errorNum === 1 || error.message?.includes('ORA-00001')) {
        const conflictError = new DatabaseError(
          'Lookup value with this VALUE_CODE already exists for this type',
          error
        );
        conflictError.code = 'UNIQUE_CONSTRAINT_VIOLATION';
        throw conflictError;
      }
      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(
          DatabaseError.getUserFriendlyMessage(error),
          error
        );
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to create lookup value', error);
    }
  }

  static async updateByGuid(guidHex32, data, userId) {
    try {
      const hexGuid = ensureHex32(guidHex32, 'guid');
      const guidBuffer = hexToRawBuffer(hexGuid);

      return await this.executeWithTransaction(async (connection) => {
        const updateFields = [];
        const bindParams = [];
        let paramIndex = 1;

        if (data.LOOKUP_TYPE_ID !== undefined) {
          updateFields.push(`LOOKUP_TYPE_ID = :${paramIndex}`);
          bindParams.push(data.LOOKUP_TYPE_ID);
          paramIndex++;
        }
        if (data.VALUE_CODE !== undefined) {
          updateFields.push(`VALUE_CODE = :${paramIndex}`);
          bindParams.push(data.VALUE_CODE);
          paramIndex++;
        }
        if (data.VALUE_NAME !== undefined) {
          updateFields.push(`VALUE_NAME = :${paramIndex}`);
          bindParams.push(data.VALUE_NAME);
          paramIndex++;
        }
        if (data.DISPLAY_SEQUENCE !== undefined) {
          updateFields.push(`DISPLAY_SEQUENCE = :${paramIndex}`);
          bindParams.push(Number(data.DISPLAY_SEQUENCE));
          paramIndex++;
        }
        if (data.ACTIVE_FLAG !== undefined) {
          const v = this.coerceActiveFlagYn(data.ACTIVE_FLAG);
          updateFields.push(`ACTIVE_FLAG = :${paramIndex}`);
          bindParams.push(v);
          paramIndex++;
        }

        if (updateFields.length === 0) {
          const selectQuery = `SELECT
            RAWTOHEX(a.LOOKUP_VALUE_GUID) AS LOOKUP_VALUE_GUID,
            a.LOOKUP_VALUE_ID,
            a.TENANT_ID,
            a.LOOKUP_TYPE_ID,
            a.VALUE_CODE,
            a.VALUE_NAME,
            a.DISPLAY_SEQUENCE,
            a.ACTIVE_FLAG,
            a.CREATED_BY,
            a.CREATION_DATE,
            a.LAST_UPDATED_BY,
            a.LAST_UPDATE_DATE
          FROM ${this.TABLE_NAME} a
          WHERE a.LOOKUP_VALUE_GUID = :1`;
          const selectResult = await connection.execute(selectQuery, [guidBuffer], this.ROW_OBJECT);
          if (selectResult.rows && selectResult.rows.length > 0) {
            return this.convertKeysToSnakeCase(selectResult.rows[0]);
          }
          throw new DatabaseError('Lookup value not found');
        }

        updateFields.push(`LAST_UPDATED_BY = :${paramIndex}`);
        bindParams.push(userId || 'SYSTEM');
        paramIndex++;
        updateFields.push(`LAST_UPDATE_DATE = :${paramIndex}`);
        bindParams.push(new Date());
        paramIndex++;

        bindParams.push(guidBuffer);
        const updateQuery = `UPDATE ${this.TABLE_NAME}
          SET ${updateFields.join(', ')}
          WHERE LOOKUP_VALUE_GUID = :${paramIndex}`;

        const updateResult = await connection.execute(updateQuery, bindParams, this.ROW_OBJECT);

        if (updateResult.rowsAffected === 0) {
          throw new DatabaseError('Lookup value not found');
        }

        const selectQuery = `SELECT
          RAWTOHEX(a.LOOKUP_VALUE_GUID) AS LOOKUP_VALUE_GUID,
          a.LOOKUP_VALUE_ID,
          a.TENANT_ID,
          a.LOOKUP_TYPE_ID,
          a.VALUE_CODE,
          a.VALUE_NAME,
          a.DISPLAY_SEQUENCE,
          a.ACTIVE_FLAG,
          a.CREATED_BY,
          a.CREATION_DATE,
          a.LAST_UPDATED_BY,
          a.LAST_UPDATE_DATE
        FROM ${this.TABLE_NAME} a
        WHERE a.LOOKUP_VALUE_GUID = :1`;
        const selectResult = await connection.execute(selectQuery, [guidBuffer], this.ROW_OBJECT);
        if (selectResult.rows && selectResult.rows.length > 0) {
          return this.convertKeysToSnakeCase(selectResult.rows[0]);
        }
        throw new DatabaseError('Failed to retrieve updated lookup value');
      });
    } catch (error) {
      if (error.message?.includes('must be a 32-character hex GUID')) throw error;
      if (error.errorNum === 1 || error.message?.includes('ORA-00001')) {
        const conflictError = new DatabaseError(
          'Lookup value with this VALUE_CODE already exists',
          error
        );
        conflictError.code = 'UNIQUE_CONSTRAINT_VIOLATION';
        throw conflictError;
      }
      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(
          DatabaseError.getUserFriendlyMessage(error),
          error
        );
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to update lookup value', error);
    }
  }

  static async deleteByGuid(guidHex32) {
    try {
      const hexGuid = ensureHex32(guidHex32, 'guid');
      const guidBuffer = hexToRawBuffer(hexGuid);

      return await this.executeWithTransaction(async (connection) => {
        const query = `DELETE FROM ${this.TABLE_NAME} WHERE LOOKUP_VALUE_GUID = :1`;
        const result = await connection.execute(query, [guidBuffer], this.ROW_OBJECT);

        if (result.rowsAffected === 0) {
          throw new DatabaseError('Lookup value not found');
        }
        return true;
      });
    } catch (error) {
      if (error.message?.includes('must be a 32-character hex GUID')) throw error;
      if (error.errorNum === 2292 || error.message?.includes('ORA-02292')) {
        const fkError = new DatabaseError(
          'Cannot delete lookup value: it is referenced by other records',
          error
        );
        fkError.code = 'FOREIGN_KEY_CONSTRAINT';
        throw fkError;
      }
      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(
          DatabaseError.getUserFriendlyMessage(error),
          error
        );
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to delete lookup value', error);
    }
  }
}

export default CompLookupValueModel;
