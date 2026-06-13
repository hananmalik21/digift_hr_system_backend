import db from '../../../../../config/db.js';
import oracledb from 'oracledb';
import {
  applyLookupTenantFilter,
  bindLookupTenantId,
  isVisibleToScopeFilter,
  normalizeTenantId
} from '../../../../../utils/lookupEnterpriseUtils.js';

/**
 * ABS Lookup Model
 * Handles all database operations for ABS.ABS_LOOKUPS table.
 * TENANT_ID NULL = global; non-null = tenant-specific.
 */
class AbsLookupModel {
  static TABLE_NAME = 'ABS.ABS_LOOKUPS';
  static CHILD_TABLE_NAME = 'ABS.ABS_LOOKUP_VALUES';

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

  static async assertNoCrossScopeLookupCodeConflict(connection, { tenantId, lookupCode, excludeLookupId = null }) {
    const code = lookupCode != null ? String(lookupCode).trim() : '';
    if (!code) return;

    const bindParams = [code];
    let excludeClause = '';
    if (excludeLookupId) {
      excludeClause = ' AND t.LOOKUP_ID <> :2';
      bindParams.push(excludeLookupId);
    }

    if (tenantId != null) {
      const query = `SELECT 1
        FROM ${this.TABLE_NAME} t
        WHERE t.TENANT_ID IS NULL
          AND UPPER(TRIM(t.LOOKUP_CODE)) = UPPER(TRIM(:1))
          ${excludeClause}
        FETCH FIRST 1 ROWS ONLY`;
      const result = await connection.execute(query, bindParams, {
        outFormat: oracledb.OUT_FORMAT_OBJECT
      });
      if (result.rows?.length) {
        const conflictError = new Error(
          `Lookup code '${code}' already exists as a global lookup and cannot be duplicated for a tenant.`
        );
        conflictError.code = 'CONFLICT';
        conflictError.statusCode = 409;
        throw conflictError;
      }
      return;
    }

    const query = `SELECT 1
      FROM ${this.TABLE_NAME} t
      WHERE t.TENANT_ID IS NOT NULL
        AND UPPER(TRIM(t.LOOKUP_CODE)) = UPPER(TRIM(:1))
        ${excludeClause}
      FETCH FIRST 1 ROWS ONLY`;
    const result = await connection.execute(query, bindParams, {
      outFormat: oracledb.OUT_FORMAT_OBJECT
    });
    if (result.rows?.length) {
      const conflictError = new Error(
        `Lookup code '${code}' already exists for a tenant and cannot be created as global.`
      );
      conflictError.code = 'CONFLICT';
      conflictError.statusCode = 409;
      throw conflictError;
    }
  }

  static async codeExistsInScope(lookupCode, tenantId, excludeLookupId = null, connection = null) {
    let query = `SELECT COUNT(*) AS count
      FROM ${this.TABLE_NAME}
      WHERE UPPER(LOOKUP_CODE) = UPPER(:1)`;
    const bindParams = [lookupCode];
    let paramIndex = 2;

    if (tenantId != null) {
      query += ` AND TENANT_ID = :${paramIndex}`;
      bindParams.push(tenantId);
      paramIndex++;
    } else {
      query += ' AND TENANT_ID IS NULL';
    }

    if (excludeLookupId) {
      query += ` AND LOOKUP_ID <> :${paramIndex}`;
      bindParams.push(excludeLookupId);
    }

    let result;
    if (connection) {
      result = await connection.execute(query, bindParams, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    } else {
      result = await this.executeQuery(query, bindParams);
    }

    const row = result.rows?.[0];
    const count = row?.COUNT ?? row?.count ?? 0;
    return count > 0;
  }

  static async findAll(tenantId) {
    try {
      let query = `SELECT
        LOOKUP_ID,
        LOOKUP_CODE,
        LOOKUP_NAME,
        TENANT_ID,
        STATUS,
        CREATED_BY,
        CREATED_DATE,
        LAST_UPDATED_BY,
        LAST_UPDATE_DATE
      FROM ${this.TABLE_NAME} t`;

      const conditions = [];
      const bindParams = [];
      let paramIndex = 1;
      applyLookupTenantFilter(conditions, bindParams, paramIndex, tenantId, 't');

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      query += ' ORDER BY CASE WHEN t.TENANT_ID IS NULL THEN 0 ELSE 1 END, t.LOOKUP_CODE';

      const result = await this.executeQuery(query, bindParams);
      return result.rows || [];
    } catch (error) {
      console.error('Error in findAll:', error);
      throw new Error(`Failed to fetch lookups: ${error.message}`);
    }
  }

  static async findById(lookupId, tenantId) {
    try {
      const conditions = ['t.LOOKUP_ID = :1'];
      const bindParams = [lookupId];
      applyLookupTenantFilter(conditions, bindParams, 2, tenantId, 't');

      const query = `SELECT
        LOOKUP_ID,
        LOOKUP_CODE,
        LOOKUP_NAME,
        TENANT_ID,
        STATUS,
        CREATED_BY,
        CREATED_DATE,
        LAST_UPDATED_BY,
        LAST_UPDATE_DATE
      FROM ${this.TABLE_NAME} t
      WHERE ${conditions.join(' AND ')}`;

      const result = await this.executeQuery(query, bindParams);
      return result.rows?.[0] ?? null;
    } catch (error) {
      console.error('Error in findById:', error);
      throw new Error(`Failed to fetch lookup: ${error.message}`);
    }
  }

  static async create(data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        const tenantId =
          data.TENANT_ID !== undefined ? normalizeTenantId(data.TENANT_ID) : null;
        const lookupCode = data.LOOKUP_CODE?.toUpperCase?.() ?? data.LOOKUP_CODE;

        await this.assertNoCrossScopeLookupCodeConflict(connection, { tenantId, lookupCode });

        const exists = await this.codeExistsInScope(lookupCode, tenantId, null, connection);
        if (exists) {
          const conflictError = new Error(`Lookup code '${lookupCode}' already exists for this scope`);
          conflictError.code = 'CONFLICT';
          conflictError.statusCode = 409;
          throw conflictError;
        }

        const seqQuery = `SELECT ABS.ABS_LOOKUPS_SEQ.NEXTVAL AS next_id FROM DUAL`;
        const seqResult = await connection.execute(seqQuery, [], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        const lookupId = seqResult.rows[0].NEXT_ID;
        const status = data.STATUS || 'ACTIVE';
        const now = new Date();

        await connection.execute(
          `INSERT INTO ${this.TABLE_NAME} (
            LOOKUP_ID, LOOKUP_CODE, LOOKUP_NAME, TENANT_ID, STATUS,
            CREATED_BY, CREATED_DATE, LAST_UPDATED_BY, LAST_UPDATE_DATE
          ) VALUES (:1, :2, :3, :4, :5, :6, :7, :8, :9)`,
          [
            lookupId,
            lookupCode,
            data.LOOKUP_NAME,
            bindLookupTenantId(tenantId),
            status,
            userId || 'SYSTEM',
            now,
            userId || 'SYSTEM',
            now
          ],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const selectResult = await connection.execute(
          `SELECT LOOKUP_ID, LOOKUP_CODE, LOOKUP_NAME, TENANT_ID, STATUS,
            CREATED_BY, CREATED_DATE, LAST_UPDATED_BY, LAST_UPDATE_DATE
          FROM ${this.TABLE_NAME} WHERE LOOKUP_ID = :1`,
          [lookupId],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        return this.convertKeysToSnakeCase(selectResult.rows[0]);
      });
    } catch (error) {
      console.error('Error in create:', error);
      if (error.code === 'CONFLICT' || error.code === 'VALIDATION_ERROR') {
        throw error;
      }
      throw new Error(`Failed to create lookup: ${error.message}`);
    }
  }

  static async update(lookupId, tenantId, data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        const existingResult = await connection.execute(
          `SELECT LOOKUP_ID, TENANT_ID, LOOKUP_CODE, LOOKUP_NAME, STATUS,
            CREATED_BY, CREATED_DATE, LAST_UPDATED_BY, LAST_UPDATE_DATE
          FROM ${this.TABLE_NAME} WHERE LOOKUP_ID = :1`,
          [lookupId],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (!existingResult.rows?.length) {
          const notFoundError = new Error('Lookup not found');
          notFoundError.code = 'NOT_FOUND';
          notFoundError.statusCode = 404;
          throw notFoundError;
        }
        const existing = existingResult.rows[0];

        if (!isVisibleToScopeFilter(existing.TENANT_ID, tenantId)) {
          const notFoundError = new Error('Lookup not found');
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
        if (data.LOOKUP_NAME !== undefined) {
          if (!data.LOOKUP_NAME || data.LOOKUP_NAME.trim() === '') {
            const validationError = new Error('LOOKUP_NAME cannot be empty');
            validationError.code = 'VALIDATION_ERROR';
            validationError.statusCode = 400;
            throw validationError;
          }
          updateFields.push(`LOOKUP_NAME = :${paramIndex}`);
          bindParams.push(data.LOOKUP_NAME);
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
        await this.assertNoCrossScopeLookupCodeConflict(connection, {
          tenantId: effectiveTenantId,
          lookupCode: existing.LOOKUP_CODE,
          excludeLookupId: lookupId
        });

        updateFields.push(`LAST_UPDATED_BY = :${paramIndex}`);
        bindParams.push(userId || 'SYSTEM');
        paramIndex++;
        updateFields.push(`LAST_UPDATE_DATE = :${paramIndex}`);
        bindParams.push(new Date());
        paramIndex++;

        bindParams.push(lookupId);
        await connection.execute(
          `UPDATE ${this.TABLE_NAME} SET ${updateFields.join(', ')} WHERE LOOKUP_ID = :${paramIndex}`,
          bindParams,
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const selectResult = await connection.execute(
          `SELECT LOOKUP_ID, LOOKUP_CODE, LOOKUP_NAME, TENANT_ID, STATUS,
            CREATED_BY, CREATED_DATE, LAST_UPDATED_BY, LAST_UPDATE_DATE
          FROM ${this.TABLE_NAME} WHERE LOOKUP_ID = :1`,
          [lookupId],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        return this.convertKeysToSnakeCase(selectResult.rows[0]);
      });
    } catch (error) {
      console.error('Error in update:', error);
      if (error.code === 'NOT_FOUND' || error.code === 'VALIDATION_ERROR' || error.code === 'CONFLICT') {
        throw error;
      }
      throw new Error(`Failed to update lookup: ${error.message}`);
    }
  }

  static async getChildRecordCount(lookupId, tenantId) {
    try {
      const conditions = ['v.LOOKUP_ID = :1'];
      const bindParams = [lookupId];
      applyLookupTenantFilter(conditions, bindParams, 2, tenantId, 'v');
      const query = `SELECT COUNT(*) AS count FROM ${this.CHILD_TABLE_NAME} v WHERE ${conditions.join(' AND ')}`;
      const result = await this.executeQuery(query, bindParams);
      return result.rows?.[0]?.count ?? 0;
    } catch (error) {
      console.error('Error in getChildRecordCount:', error);
      throw new Error(`Failed to check child records: ${error.message}`);
    }
  }

  static async delete(lookupId, tenantId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        const existing = await this.findById(lookupId, tenantId);
        if (!existing) {
          const notFoundError = new Error('Lookup not found');
          notFoundError.code = 'NOT_FOUND';
          notFoundError.statusCode = 404;
          throw notFoundError;
        }

        const childCount = await this.getChildRecordCount(lookupId, tenantId);
        if (childCount > 0) {
          const validationError = new Error(
            `Cannot delete lookup: ${childCount} record(s) exist in ABS_LOOKUP_VALUES. Please delete child records first.`
          );
          validationError.code = 'VALIDATION_ERROR';
          validationError.statusCode = 400;
          validationError.childCount = childCount;
          throw validationError;
        }

        const deleteResult = await connection.execute(
          `DELETE FROM ${this.TABLE_NAME} WHERE LOOKUP_ID = :1`,
          [lookupId],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if ((deleteResult.rowsAffected || deleteResult.rowCount || 0) === 0) {
          const notFoundError = new Error('Lookup not found');
          notFoundError.code = 'NOT_FOUND';
          notFoundError.statusCode = 404;
          throw notFoundError;
        }

        return true;
      });
    } catch (error) {
      console.error('Error in delete:', error);
      if (error.code === 'NOT_FOUND' || error.code === 'VALIDATION_ERROR') {
        throw error;
      }
      throw new Error(`Failed to delete lookup: ${error.message}`);
    }
  }
}

export default AbsLookupModel;
