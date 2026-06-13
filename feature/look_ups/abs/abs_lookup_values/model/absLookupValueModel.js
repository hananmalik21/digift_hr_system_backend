import db from '../../../../../config/db.js';
import oracledb from 'oracledb';
import {
  applyLookupTenantFilter,
  bindLookupTenantId,
  isVisibleToScopeFilter,
  normalizeTenantId
} from '../../../../../utils/lookupEnterpriseUtils.js';

/**
 * ABS Lookup Value Model
 * Handles all database operations for ABS.ABS_LOOKUP_VALUES table.
 * TENANT_ID NULL = global; non-null = tenant-specific.
 */
class AbsLookupValueModel {
  static TABLE_NAME = 'ABS.ABS_LOOKUP_VALUES';
  static PARENT_TABLE_NAME = 'ABS.ABS_LOOKUPS';

  static convertKeysToSnakeCase(obj) {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date) return obj;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => this.convertKeysToSnakeCase(item));

    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
      const newKey = key.toLowerCase();
      if (value === null || value === undefined) {
        converted[newKey] = value;
      } else if (value instanceof Date) {
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

  static async verifyLookupVisible(lookupId, tenantId, connection = null) {
    const conditions = ['p.LOOKUP_ID = :1'];
    const bindParams = [lookupId];
    applyLookupTenantFilter(conditions, bindParams, 2, tenantId, 'p');

    const query = `SELECT 1
      FROM ${this.PARENT_TABLE_NAME} p
      WHERE ${conditions.join(' AND ')}
      FETCH FIRST 1 ROWS ONLY`;

    let result;
    if (connection) {
      result = await connection.execute(query, bindParams, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    } else {
      result = await this.executeQuery(query, bindParams);
    }
    return Boolean(result.rows?.length);
  }

  static async assertNoCrossScopeValueCodeConflict(
    connection,
    { tenantId, lookupId, lookupValueCode, excludeValueId = null }
  ) {
    const code = lookupValueCode != null ? String(lookupValueCode).trim() : '';
    if (!code) return;

    const bindParams = [lookupId, code];
    let excludeClause = '';
    if (excludeValueId) {
      excludeClause = ' AND v.LOOKUP_VALUE_ID <> :3';
      bindParams.push(excludeValueId);
    }

    if (tenantId != null) {
      const query = `SELECT 1
        FROM ${this.TABLE_NAME} v
        WHERE v.TENANT_ID IS NULL
          AND v.LOOKUP_ID = :1
          AND UPPER(TRIM(v.LOOKUP_VALUE_CODE)) = UPPER(TRIM(:2))
          ${excludeClause}
        FETCH FIRST 1 ROWS ONLY`;
      const result = await connection.execute(query, bindParams, {
        outFormat: oracledb.OUT_FORMAT_OBJECT
      });
      if (result.rows?.length) {
        const conflictError = new Error(
          `Lookup value code '${code}' already exists as global for this lookup and cannot be duplicated for a tenant.`
        );
        conflictError.code = 'CONFLICT';
        conflictError.statusCode = 409;
        throw conflictError;
      }
      return;
    }

    const query = `SELECT 1
      FROM ${this.TABLE_NAME} v
      WHERE v.TENANT_ID IS NOT NULL
        AND v.LOOKUP_ID = :1
        AND UPPER(TRIM(v.LOOKUP_VALUE_CODE)) = UPPER(TRIM(:2))
        ${excludeClause}
      FETCH FIRST 1 ROWS ONLY`;
    const result = await connection.execute(query, bindParams, {
      outFormat: oracledb.OUT_FORMAT_OBJECT
    });
    if (result.rows?.length) {
      const conflictError = new Error(
        `Lookup value code '${code}' already exists for a tenant and cannot be created as global.`
      );
      conflictError.code = 'CONFLICT';
      conflictError.statusCode = 409;
      throw conflictError;
    }
  }

  static async findAll(lookupId, tenantId) {
    try {
      const visible = await this.verifyLookupVisible(lookupId, tenantId);
      if (!visible) {
        const notFoundError = new Error('Lookup not found or not visible for this tenant scope');
        notFoundError.code = 'NOT_FOUND';
        notFoundError.statusCode = 404;
        throw notFoundError;
      }

      const conditions = ['v.LOOKUP_ID = :1'];
      const bindParams = [lookupId];
      applyLookupTenantFilter(conditions, bindParams, 2, tenantId, 'v');

      const query = `SELECT
        LOOKUP_VALUE_ID,
        LOOKUP_ID,
        LOOKUP_VALUE_CODE,
        LOOKUP_VALUE_NAME,
        DISPLAY_ORDER,
        STATUS,
        TENANT_ID,
        CREATED_BY,
        CREATED_DATE
      FROM ${this.TABLE_NAME} v
      WHERE ${conditions.join(' AND ')}
      ORDER BY CASE WHEN v.TENANT_ID IS NULL THEN 0 ELSE 1 END, v.DISPLAY_ORDER, v.LOOKUP_VALUE_CODE`;

      const result = await this.executeQuery(query, bindParams);
      return result.rows || [];
    } catch (error) {
      console.error('Error in findAll:', error);
      if (error.code === 'NOT_FOUND') throw error;
      throw new Error(`Failed to fetch lookup values: ${error.message}`);
    }
  }

  static async findById(lookupId, valueId, tenantId) {
    try {
      const visible = await this.verifyLookupVisible(lookupId, tenantId);
      if (!visible) {
        const notFoundError = new Error('Lookup not found or not visible for this tenant scope');
        notFoundError.code = 'NOT_FOUND';
        notFoundError.statusCode = 404;
        throw notFoundError;
      }

      const conditions = [
        'v.LOOKUP_VALUE_ID = :1',
        'v.LOOKUP_ID = :2'
      ];
      const bindParams = [valueId, lookupId];
      applyLookupTenantFilter(conditions, bindParams, 3, tenantId, 'v');

      const query = `SELECT
        LOOKUP_VALUE_ID,
        LOOKUP_ID,
        LOOKUP_VALUE_CODE,
        LOOKUP_VALUE_NAME,
        DISPLAY_ORDER,
        STATUS,
        TENANT_ID,
        CREATED_BY,
        CREATED_DATE
      FROM ${this.TABLE_NAME} v
      WHERE ${conditions.join(' AND ')}`;

      const result = await this.executeQuery(query, bindParams);
      return result.rows?.[0] ?? null;
    } catch (error) {
      console.error('Error in findById:', error);
      if (error.code === 'NOT_FOUND') throw error;
      throw new Error(`Failed to fetch lookup value: ${error.message}`);
    }
  }

  static async getNextDisplayOrder(lookupId, tenantId, connection) {
    let query = `SELECT NVL(MAX(DISPLAY_ORDER), 0) + 1 AS next_order
      FROM ${this.TABLE_NAME}
      WHERE LOOKUP_ID = :1`;
    const bindParams = [lookupId];
    if (tenantId != null) {
      query += ' AND TENANT_ID = :2';
      bindParams.push(tenantId);
    } else {
      query += ' AND TENANT_ID IS NULL';
    }

    const result = await connection.execute(query, bindParams, {
      outFormat: oracledb.OUT_FORMAT_OBJECT
    });
    const row = result.rows?.[0];
    return row?.NEXT_ORDER ?? row?.next_order ?? 1;
  }

  static async codeExistsInScope(lookupId, lookupValueCode, tenantId, excludeValueId = null, connection = null) {
    let query = `SELECT COUNT(*) AS count
      FROM ${this.TABLE_NAME}
      WHERE LOOKUP_ID = :1 AND UPPER(LOOKUP_VALUE_CODE) = UPPER(:2)`;
    const bindParams = [lookupId, lookupValueCode];
    let paramIndex = 3;

    if (tenantId != null) {
      query += ` AND TENANT_ID = :${paramIndex}`;
      bindParams.push(tenantId);
      paramIndex++;
    } else {
      query += ' AND TENANT_ID IS NULL';
    }

    if (excludeValueId) {
      query += ` AND LOOKUP_VALUE_ID <> :${paramIndex}`;
      bindParams.push(excludeValueId);
    }

    let result;
    if (connection) {
      result = await connection.execute(query, bindParams, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    } else {
      result = await this.executeQuery(query, bindParams);
    }

    const row = result.rows?.[0];
    return (row?.COUNT ?? row?.count ?? 0) > 0;
  }

  static async displayOrderExists(lookupId, displayOrder, tenantId, excludeValueId = null, connection = null) {
    let query = `SELECT COUNT(*) AS count
      FROM ${this.TABLE_NAME}
      WHERE LOOKUP_ID = :1 AND DISPLAY_ORDER = :2`;
    const bindParams = [lookupId, displayOrder];
    let paramIndex = 3;

    if (tenantId != null) {
      query += ` AND TENANT_ID = :${paramIndex}`;
      bindParams.push(tenantId);
      paramIndex++;
    } else {
      query += ' AND TENANT_ID IS NULL';
    }

    if (excludeValueId) {
      query += ` AND LOOKUP_VALUE_ID <> :${paramIndex}`;
      bindParams.push(excludeValueId);
    }

    let result;
    if (connection) {
      result = await connection.execute(query, bindParams, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    } else {
      result = await this.executeQuery(query, bindParams);
    }

    const row = result.rows?.[0];
    return (row?.COUNT ?? row?.count ?? 0) > 0;
  }

  static async create(lookupId, tenantId, data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        const visible = await this.verifyLookupVisible(lookupId, tenantId, connection);
        if (!visible) {
          const notFoundError = new Error('Lookup not found or not visible for this tenant scope');
          notFoundError.code = 'NOT_FOUND';
          notFoundError.statusCode = 404;
          throw notFoundError;
        }

        const rowTenantId =
          data.TENANT_ID !== undefined
            ? normalizeTenantId(data.TENANT_ID)
            : tenantId !== undefined
              ? tenantId
              : null;
        const lookupValueCode = data.LOOKUP_VALUE_CODE?.toUpperCase?.() ?? data.LOOKUP_VALUE_CODE;

        await this.assertNoCrossScopeValueCodeConflict(connection, {
          tenantId: rowTenantId,
          lookupId,
          lookupValueCode
        });

        if (await this.codeExistsInScope(lookupId, lookupValueCode, rowTenantId, null, connection)) {
          const conflictError = new Error(
            `Lookup value code '${lookupValueCode}' already exists for this lookup in this scope`
          );
          conflictError.code = 'CONFLICT';
          conflictError.statusCode = 409;
          throw conflictError;
        }

        let displayOrder = data.DISPLAY_ORDER;
        if (displayOrder === undefined || displayOrder === null) {
          displayOrder = await this.getNextDisplayOrder(lookupId, rowTenantId, connection);
        } else if (
          await this.displayOrderExists(lookupId, displayOrder, rowTenantId, null, connection)
        ) {
          const conflictError = new Error(`Display order ${displayOrder} already exists for this lookup in this scope`);
          conflictError.code = 'CONFLICT';
          conflictError.statusCode = 409;
          throw conflictError;
        }

        const status = data.STATUS || 'ACTIVE';
        let valueId;

        try {
          const seqResult = await connection.execute(
            `SELECT ABS.ABS_LOOKUP_VALUES_SEQ.NEXTVAL AS next_id FROM DUAL`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          valueId = seqResult.rows[0].NEXT_ID ?? seqResult.rows[0].next_id;
        } catch {
          const maxResult = await connection.execute(
            `SELECT NVL(MAX(LOOKUP_VALUE_ID), 0) + 1 AS next_id FROM ${this.TABLE_NAME}`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          valueId = maxResult.rows[0].NEXT_ID ?? maxResult.rows[0].next_id ?? 1;
        }

        const now = new Date();
        await connection.execute(
          `INSERT INTO ${this.TABLE_NAME} (
            LOOKUP_VALUE_ID, LOOKUP_ID, LOOKUP_VALUE_CODE, LOOKUP_VALUE_NAME,
            DISPLAY_ORDER, STATUS, TENANT_ID, CREATED_BY, CREATED_DATE
          ) VALUES (:1, :2, :3, :4, :5, :6, :7, :8, :9)`,
          [
            valueId,
            lookupId,
            lookupValueCode,
            data.LOOKUP_VALUE_NAME,
            displayOrder,
            status,
            bindLookupTenantId(rowTenantId),
            userId || 'SYSTEM',
            now
          ],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const selectResult = await connection.execute(
          `SELECT LOOKUP_VALUE_ID, LOOKUP_ID, LOOKUP_VALUE_CODE, LOOKUP_VALUE_NAME,
            DISPLAY_ORDER, STATUS, TENANT_ID, CREATED_BY, CREATED_DATE
          FROM ${this.TABLE_NAME} WHERE LOOKUP_VALUE_ID = :1`,
          [valueId],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        return this.convertKeysToSnakeCase(selectResult.rows[0]);
      });
    } catch (error) {
      console.error('Error in create:', error);
      if (error.code === 'CONFLICT' || error.code === 'NOT_FOUND') throw error;
      throw new Error(`Failed to create lookup value: ${error.message}`);
    }
  }

  static async update(lookupId, valueId, tenantId, data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        const existingResult = await connection.execute(
          `SELECT LOOKUP_VALUE_ID, LOOKUP_ID, LOOKUP_VALUE_CODE, LOOKUP_VALUE_NAME,
            DISPLAY_ORDER, STATUS, TENANT_ID, CREATED_BY, CREATED_DATE
          FROM ${this.TABLE_NAME}
          WHERE LOOKUP_VALUE_ID = :1 AND LOOKUP_ID = :2`,
          [valueId, lookupId],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (!existingResult.rows?.length) {
          const notFoundError = new Error('Lookup value not found');
          notFoundError.code = 'NOT_FOUND';
          notFoundError.statusCode = 404;
          throw notFoundError;
        }
        const existing = existingResult.rows[0];

        if (!isVisibleToScopeFilter(existing.TENANT_ID, tenantId)) {
          const notFoundError = new Error('Lookup value not found');
          notFoundError.code = 'NOT_FOUND';
          notFoundError.statusCode = 404;
          throw notFoundError;
        }

        const updateFields = [];
        const bindParams = [];
        let paramIndex = 1;

        if (data.TENANT_ID !== undefined) {
          updateFields.push(`TENANT_ID = :${paramIndex}`);
          bindParams.push(bindLookupTenantId(data.TENANT_ID));
          paramIndex++;
        }
        if (data.LOOKUP_VALUE_NAME !== undefined) {
          if (!data.LOOKUP_VALUE_NAME || data.LOOKUP_VALUE_NAME.trim() === '') {
            const validationError = new Error('LOOKUP_VALUE_NAME cannot be empty');
            validationError.code = 'VALIDATION_ERROR';
            validationError.statusCode = 400;
            throw validationError;
          }
          updateFields.push(`LOOKUP_VALUE_NAME = :${paramIndex}`);
          bindParams.push(data.LOOKUP_VALUE_NAME);
          paramIndex++;
        }
        if (data.DISPLAY_ORDER !== undefined) {
          if (data.DISPLAY_ORDER === null || isNaN(data.DISPLAY_ORDER) || data.DISPLAY_ORDER < 1) {
            const validationError = new Error('DISPLAY_ORDER must be a valid positive number');
            validationError.code = 'VALIDATION_ERROR';
            validationError.statusCode = 400;
            throw validationError;
          }
          const effectiveTenantId =
            data.TENANT_ID !== undefined ? data.TENANT_ID : existing.TENANT_ID;
          if (
            await this.displayOrderExists(
              lookupId,
              data.DISPLAY_ORDER,
              effectiveTenantId,
              valueId,
              connection
            )
          ) {
            const conflictError = new Error(
              `Display order ${data.DISPLAY_ORDER} already exists for this lookup in this scope`
            );
            conflictError.code = 'CONFLICT';
            conflictError.statusCode = 409;
            throw conflictError;
          }
          updateFields.push(`DISPLAY_ORDER = :${paramIndex}`);
          bindParams.push(data.DISPLAY_ORDER);
          paramIndex++;
        }
        if (data.STATUS !== undefined) {
          updateFields.push(`STATUS = :${paramIndex}`);
          bindParams.push(data.STATUS);
          paramIndex++;
        }

        if (updateFields.length === 0) {
          return this.convertKeysToSnakeCase(existing);
        }

        const effectiveTenantId =
          data.TENANT_ID !== undefined ? data.TENANT_ID : existing.TENANT_ID;
        await this.assertNoCrossScopeValueCodeConflict(connection, {
          tenantId: effectiveTenantId,
          lookupId,
          lookupValueCode: existing.LOOKUP_VALUE_CODE,
          excludeValueId: valueId
        });

        bindParams.push(valueId);
        bindParams.push(lookupId);
        await connection.execute(
          `UPDATE ${this.TABLE_NAME}
            SET ${updateFields.join(', ')}
            WHERE LOOKUP_VALUE_ID = :${paramIndex} AND LOOKUP_ID = :${paramIndex + 1}`,
          bindParams,
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const selectResult = await connection.execute(
          `SELECT LOOKUP_VALUE_ID, LOOKUP_ID, LOOKUP_VALUE_CODE, LOOKUP_VALUE_NAME,
            DISPLAY_ORDER, STATUS, TENANT_ID, CREATED_BY, CREATED_DATE
          FROM ${this.TABLE_NAME}
          WHERE LOOKUP_VALUE_ID = :1 AND LOOKUP_ID = :2`,
          [valueId, lookupId],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        return this.convertKeysToSnakeCase(selectResult.rows[0]);
      });
    } catch (error) {
      console.error('Error in update:', error);
      if (error.code === 'NOT_FOUND' || error.code === 'VALIDATION_ERROR' || error.code === 'CONFLICT') {
        throw error;
      }
      throw new Error(`Failed to update lookup value: ${error.message}`);
    }
  }

  static async delete(lookupId, valueId, tenantId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        const existing = await this.findById(lookupId, valueId, tenantId);
        if (!existing) {
          const notFoundError = new Error('Lookup value not found');
          notFoundError.code = 'NOT_FOUND';
          notFoundError.statusCode = 404;
          throw notFoundError;
        }

        const deleteResult = await connection.execute(
          `DELETE FROM ${this.TABLE_NAME}
            WHERE LOOKUP_VALUE_ID = :1 AND LOOKUP_ID = :2`,
          [valueId, lookupId],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if ((deleteResult.rowsAffected || deleteResult.rowCount || 0) === 0) {
          const notFoundError = new Error('Lookup value not found');
          notFoundError.code = 'NOT_FOUND';
          notFoundError.statusCode = 404;
          throw notFoundError;
        }

        return true;
      });
    } catch (error) {
      console.error('Error in delete:', error);
      if (error.code === 'NOT_FOUND') throw error;
      throw new Error(`Failed to delete lookup value: ${error.message}`);
    }
  }
}

export default AbsLookupValueModel;
