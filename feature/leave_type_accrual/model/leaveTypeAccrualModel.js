// feature/abs_leave_type_accrual/model/leaveTypeAccrualModel.js
import db from '../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError } from '../../../utils/errors/index.js';
import { ensureHex32, hexToRawBuffer } from '../../../utils/guidUtils.js';

/**
 * Leave Type Accrual Mapping Model
 * Table: ABS.ABS_LEAVE_TYPE_ACCRUAL
 *
 * IMPORTANT (based on your DB triggers):
 * - TRG_LTA_SYNC_PLAN_GUID populates GUID fields (do NOT set them in API)
 * - TRG_WHO_ABS_LEAVE_TYPE_ACCRUAL populates WHO/audit columns (do NOT set them in API)
 *
 * API should only manage:
 * - LEAVE_TYPE_ACCRUAL_ID (from sequence)
 * - TENANT_ID, LEAVE_TYPE_ID, ACCRUAL_PLAN_ID
 * - EFFECTIVE_START_DATE, EFFECTIVE_END_DATE
 */
class LeaveTypeAccrualModel {
  static TABLE_NAME = 'ABS.ABS_LEAVE_TYPE_ACCRUAL';

  /* =========================
   * Helpers
   * ========================= */

  static convertKeysToSnakeCase(obj) {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date) return obj;
    if (obj instanceof Buffer) return obj.toString('hex').toUpperCase();
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map((x) => this.convertKeysToSnakeCase(x));

    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      const nk = String(k).toLowerCase();
      out[nk] = this.convertKeysToSnakeCase(v);
    }
    return out;
  }

  static async executeQuery(sql, binds = [], options = {}) {
    const result = await db.executeQuery(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      ...options
    });

    if (result?.rows) result.rows = this.convertKeysToSnakeCase(result.rows);
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
      try {
        if (connection) await connection.rollback();
      } catch (e) {
        // swallow rollback errors, keep original error
        console.error('Rollback error:', e);
      }
      throw error;
    } finally {
      try {
        if (connection) await connection.close();
      } catch (e) {
        console.error('Close connection error:', e);
      }
    }
  }

  static toInt(v, fieldName) {
    if (v === undefined || v === null || v === '') return null;
    const n = parseInt(v, 10);
    if (Number.isNaN(n)) {
      throw new DatabaseError(`${fieldName} must be a valid number`);
    }
    return n;
  }

  static toDate(v, fieldName) {
    if (v === undefined || v === null || v === '') return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      throw new DatabaseError(`${fieldName} must be a valid date`);
    }
    return d;
  }

  static extractOraCode(error) {
    const msg = String(error?.message || '');
    const m = msg.match(/ORA-\d{5}/);
    return m ? m[0] : null;
  }

  static wrapDbError(userMessage, error) {
    // If your DatabaseError has getUserFriendlyMessage, use it; otherwise keep safe text
    try {
      const friendly = DatabaseError.getUserFriendlyMessage?.(error);
      return new DatabaseError(friendly || userMessage, error);
    } catch {
      return new DatabaseError(userMessage, error);
    }
  }

  /* =========================
   * Queries
   * ========================= */

  static baseSelectSql() {
    // Select GUID as hex for API responses
    return `SELECT
      a.LEAVE_TYPE_ACCRUAL_ID,
      RAWTOHEX(a.LEAVE_TYPE_ACCRUAL_GUID) AS LEAVE_TYPE_ACCRUAL_GUID,
      a.TENANT_ID,
      a.LEAVE_TYPE_ID,
      a.ACCRUAL_PLAN_ID,
      a.EFFECTIVE_START_DATE,
      a.EFFECTIVE_END_DATE,
      a.CREATION_DATE,
      a.CREATED_BY,
      a.LAST_UPDATE_DATE,
      a.LAST_UPDATED_BY
    FROM ${this.TABLE_NAME} a`;
  }

  /* =========================
   * CRUD
   * ========================= */

  /**
   * List mappings with optional filters + pagination (limit/offset or page/pageSize already computed in router)
   * filters: { TENANT_ID?, LEAVE_TYPE_ID?, ACCRUAL_PLAN_ID?, pagination: {page, pageSize} }
   */
  static async findAll(filters = {}) {
    try {
      const conditions = [];
      const binds = [];
      let i = 1;

      let countSql = `SELECT COUNT(*) AS total FROM ${this.TABLE_NAME} a`;
      let dataSql = this.baseSelectSql();

      if (filters.TENANT_ID !== undefined && filters.TENANT_ID !== null) {
        conditions.push(`a.TENANT_ID = :${i}`);
        binds.push(this.toInt(filters.TENANT_ID, 'TENANT_ID'));
        i++;
      }
      if (filters.LEAVE_TYPE_ID !== undefined && filters.LEAVE_TYPE_ID !== null) {
        conditions.push(`a.LEAVE_TYPE_ID = :${i}`);
        binds.push(this.toInt(filters.LEAVE_TYPE_ID, 'LEAVE_TYPE_ID'));
        i++;
      }
      if (filters.ACCRUAL_PLAN_ID !== undefined && filters.ACCRUAL_PLAN_ID !== null) {
        conditions.push(`a.ACCRUAL_PLAN_ID = :${i}`);
        binds.push(this.toInt(filters.ACCRUAL_PLAN_ID, 'ACCRUAL_PLAN_ID'));
        i++;
      }

      if (conditions.length) {
        const where = ` WHERE ${conditions.join(' AND ')}`;
        countSql += where;
        dataSql += where;
      }

      // total
      const countRes = await this.executeQuery(countSql, binds);
      const total = countRes?.rows?.[0]?.total ?? 0;

      // pagination
      const page = filters.pagination?.page ?? 1;
      const pageSize = filters.pagination?.pageSize ?? 10;
      const offset = (page - 1) * pageSize;

      dataSql += ` ORDER BY a.LEAVE_TYPE_ACCRUAL_ID DESC`;
      dataSql += ` OFFSET :${i} ROWS FETCH NEXT :${i + 1} ROWS ONLY`;
      const dataBinds = [...binds, offset, pageSize];

      const dataRes = await this.executeQuery(dataSql, dataBinds);

      return { mappings: dataRes?.rows ?? [], total };
    } catch (error) {
      throw this.wrapDbError('Failed to fetch leave type accrual mappings', error);
    }
  }

  /**
   * Get one by ID
   */
  static async findById(id) {
    try {
      const sql = `${this.baseSelectSql()}
        WHERE a.LEAVE_TYPE_ACCRUAL_ID = :1`;

      const res = await this.executeQuery(sql, [this.toInt(id, 'LEAVE_TYPE_ACCRUAL_ID')]);
      return res?.rows?.[0] ?? null;
    } catch (error) {
      throw this.wrapDbError('Failed to fetch leave type accrual mapping', error);
    }
  }

  /**
   * Get one by GUID
   */
  static async findByGuid(guidHex32) {
    try {
      const hexGuid = ensureHex32(guidHex32, 'guid');
      const guidBuffer = hexToRawBuffer(hexGuid);

      const sql = `${this.baseSelectSql()}
        WHERE a.LEAVE_TYPE_ACCRUAL_GUID = :1`;

      const res = await this.executeQuery(sql, [guidBuffer]);
      return res?.rows?.[0] ?? null;
    } catch (error) {
      if (error.message?.includes('must be a 32-character hex GUID')) {
        throw error;
      }
      throw this.wrapDbError('Failed to fetch leave type accrual mapping', error);
    }
  }

  /**
   * Create
   * NOTE: Do NOT set GUID/audit fields. Triggers handle them.
   */
  static async create(data, userId = 'SYSTEM') {
    try {
      return await this.executeWithTransaction(async (connection) => {
        // ID from sequence (fallback MAX+1)
        let mappingId;
        try {
          const seqSql = `SELECT ABS.ABS_LEAVE_TYPE_ACCRUAL_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`;
          const seqRes = await connection.execute(seqSql, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
          mappingId = seqRes.rows?.[0]?.NEXT_ID;
        } catch (e) {
          const maxSql = `SELECT NVL(MAX(LEAVE_TYPE_ACCRUAL_ID), 0) + 1 AS NEXT_ID FROM ${this.TABLE_NAME}`;
          const maxRes = await connection.execute(maxSql, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
          mappingId = maxRes.rows?.[0]?.NEXT_ID;
        }

        const tenantId = this.toInt(data.TENANT_ID, 'TENANT_ID');
        const leaveTypeId = this.toInt(data.LEAVE_TYPE_ID, 'LEAVE_TYPE_ID');
        const accrualPlanId = this.toInt(data.ACCRUAL_PLAN_ID, 'ACCRUAL_PLAN_ID');
        const effStart = this.toDate(data.EFFECTIVE_START_DATE, 'EFFECTIVE_START_DATE');
        const effEnd = data.EFFECTIVE_END_DATE === null ? null : this.toDate(data.EFFECTIVE_END_DATE, 'EFFECTIVE_END_DATE');

        // Keep INSERT minimal to avoid trigger conflicts
        const insertSql = `INSERT INTO ${this.TABLE_NAME} (
          LEAVE_TYPE_ACCRUAL_ID,
          TENANT_ID,
          LEAVE_TYPE_ID,
          ACCRUAL_PLAN_ID,
          EFFECTIVE_START_DATE,
          EFFECTIVE_END_DATE
        ) VALUES (
          :1, :2, :3, :4, :5, :6
        )`;

        const binds = [mappingId, tenantId, leaveTypeId, accrualPlanId, effStart, effEnd];

        await connection.execute(insertSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });

        // Return created row
        const selectSql = `${this.baseSelectSql()}
          WHERE a.LEAVE_TYPE_ACCRUAL_ID = :1`;

        const selRes = await connection.execute(selectSql, [mappingId], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const row = selRes.rows?.[0];
        if (!row) throw new DatabaseError('Failed to retrieve created leave type accrual mapping');

        return this.convertKeysToSnakeCase(row);
      });
    } catch (error) {
      // User-defined error from trigger (20001) - Accrual Plan ID doesn't exist
      if (error?.errorNum === 20001 || String(error?.message || '').includes('ORA-20001') || 
          String(error?.message || '').includes('Accrual Plan ID') && String(error?.message || '').includes('does not exist')) {
        const userMessage = 'Accrual Plan ID does not exist. Please check ACCRUAL_PLAN_ID and ensure it exists in the accrual plans table.';
        const fkError = new DatabaseError(userMessage, error, userMessage);
        fkError.code = 'FOREIGN_KEY_CONSTRAINT';
        fkError.errorNum = error?.errorNum || 20001;
        throw fkError;
      }

      // Unique constraint
      if (error?.errorNum === 1 || String(error?.message || '').includes('ORA-00001')) {
        const e = new DatabaseError('Leave type accrual mapping already exists', error);
        e.code = 'UNIQUE_CONSTRAINT_VIOLATION';
        throw e;
      }

      // Trigger invalid (your 4098 case)
      if (error?.errorNum === 4098 || String(error?.message || '').includes('ORA-04098')) {
        const e = new DatabaseError('Database trigger is invalid on ABS_LEAVE_TYPE_ACCRUAL (ORA-04098). Recompile/fix triggers.', error);
        e.code = 'DATABASE_TRIGGER_INVALID';
        throw e;
      }

      // Foreign key constraint (2291)
      if (error?.errorNum === 2291 || String(error?.message || '').includes('ORA-02291')) {
        let userMessage = 'The referenced record does not exist. ';
        const errorMsg = String(error?.message || '').toUpperCase();
        if (errorMsg.includes('LEAVE_TYPE_ID') || errorMsg.includes('LEAVE_TYPE')) {
          userMessage += 'Leave Type ID does not exist. Please check LEAVE_TYPE_ID.';
        } else if (errorMsg.includes('ACCRUAL_PLAN_ID') || errorMsg.includes('ACCRUAL_PLAN')) {
          userMessage += 'Accrual Plan ID does not exist. Please check ACCRUAL_PLAN_ID.';
        } else {
          userMessage += 'Please check LEAVE_TYPE_ID and ACCRUAL_PLAN_ID exist in their respective tables.';
        }
        const fkError = new DatabaseError(userMessage, error, userMessage);
        fkError.code = 'FOREIGN_KEY_CONSTRAINT';
        fkError.errorNum = error?.errorNum || 2291;
        throw fkError;
      }

      // No data found (1403) - usually from trigger looking up non-existent ACCRUAL_PLAN_ID
      if (error?.errorNum === 1403 || String(error?.message || '').includes('ORA-01403')) {
        const userMessage = 'Accrual Plan ID does not exist. Please check ACCRUAL_PLAN_ID and ensure it exists in the accrual plans table.';
        const fkError = new DatabaseError(userMessage, error, userMessage);
        fkError.code = 'FOREIGN_KEY_CONSTRAINT';
        fkError.errorNum = error?.errorNum || 1403;
        throw fkError;
      }

      throw this.wrapDbError('Failed to create leave type accrual mapping', error);
    }
  }

  /**
   * Update
   * NOTE: Do NOT update GUID/audit fields. Triggers handle audit.
   */
  static async update(id, data, userId = 'SYSTEM') {
    try {
      return await this.executeWithTransaction(async (connection) => {
        const updateFields = [];
        const binds = [];
        let i = 1;

        const mappingId = this.toInt(id, 'LEAVE_TYPE_ACCRUAL_ID');

        if (data.LEAVE_TYPE_ID !== undefined) {
          updateFields.push(`LEAVE_TYPE_ID = :${i}`);
          binds.push(data.LEAVE_TYPE_ID === null ? null : this.toInt(data.LEAVE_TYPE_ID, 'LEAVE_TYPE_ID'));
          i++;
        }

        if (data.ACCRUAL_PLAN_ID !== undefined) {
          updateFields.push(`ACCRUAL_PLAN_ID = :${i}`);
          binds.push(data.ACCRUAL_PLAN_ID === null ? null : this.toInt(data.ACCRUAL_PLAN_ID, 'ACCRUAL_PLAN_ID'));
          i++;
          // No GUID sync here — TRG_LTA_SYNC_PLAN_GUID will do it
        }

        if (data.EFFECTIVE_START_DATE !== undefined) {
          updateFields.push(`EFFECTIVE_START_DATE = :${i}`);
          binds.push(data.EFFECTIVE_START_DATE ? this.toDate(data.EFFECTIVE_START_DATE, 'EFFECTIVE_START_DATE') : null);
          i++;
        }

        if (data.EFFECTIVE_END_DATE !== undefined) {
          updateFields.push(`EFFECTIVE_END_DATE = :${i}`);
          binds.push(data.EFFECTIVE_END_DATE === null ? null : this.toDate(data.EFFECTIVE_END_DATE, 'EFFECTIVE_END_DATE'));
          i++;
        }

        if (updateFields.length === 0) {
          // Nothing to update; return current row
          const selSql = `${this.baseSelectSql()} WHERE a.LEAVE_TYPE_ACCRUAL_ID = :1`;
          const selRes = await connection.execute(selSql, [mappingId], { outFormat: oracledb.OUT_FORMAT_OBJECT });
          const row = selRes.rows?.[0];
          if (!row) throw new DatabaseError('Leave type accrual mapping not found');
          return this.convertKeysToSnakeCase(row);
        }

        // WHERE bind
        binds.push(mappingId);

        const updSql = `UPDATE ${this.TABLE_NAME}
          SET ${updateFields.join(', ')}
          WHERE LEAVE_TYPE_ACCRUAL_ID = :${i}`;

        const updRes = await connection.execute(updSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        if ((updRes.rowsAffected ?? 0) === 0) {
          throw new DatabaseError('Leave type accrual mapping not found');
        }

        // Return updated row
        const selSql = `${this.baseSelectSql()} WHERE a.LEAVE_TYPE_ACCRUAL_ID = :1`;
        const selRes = await connection.execute(selSql, [mappingId], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const row = selRes.rows?.[0];
        if (!row) throw new DatabaseError('Failed to retrieve updated leave type accrual mapping');

        return this.convertKeysToSnakeCase(row);
      });
    } catch (error) {
      if (error?.errorNum === 4098 || String(error?.message || '').includes('ORA-04098')) {
        const e = new DatabaseError('Database trigger is invalid on ABS_LEAVE_TYPE_ACCRUAL (ORA-04098). Recompile/fix triggers.', error);
        e.code = 'DATABASE_TRIGGER_INVALID';
        throw e;
      }
      // Foreign key constraint (2291)
      if (error?.errorNum === 2291 || String(error?.message || '').includes('ORA-02291')) {
        let userMessage = 'The referenced record does not exist. ';
        const errorMsg = String(error?.message || '').toUpperCase();
        if (errorMsg.includes('LEAVE_TYPE_ID') || errorMsg.includes('LEAVE_TYPE')) {
          userMessage += 'Leave Type ID does not exist. Please check LEAVE_TYPE_ID.';
        } else if (errorMsg.includes('ACCRUAL_PLAN_ID') || errorMsg.includes('ACCRUAL_PLAN')) {
          userMessage += 'Accrual Plan ID does not exist. Please check ACCRUAL_PLAN_ID.';
        } else {
          userMessage += 'Please check LEAVE_TYPE_ID and ACCRUAL_PLAN_ID exist in their respective tables.';
        }
        const fkError = new DatabaseError(userMessage, error, userMessage);
        fkError.code = 'FOREIGN_KEY_CONSTRAINT';
        fkError.errorNum = error?.errorNum || 2291;
        throw fkError;
      }

      // No data found (1403) - usually from trigger looking up non-existent ACCRUAL_PLAN_ID
      if (error?.errorNum === 1403 || String(error?.message || '').includes('ORA-01403')) {
        const userMessage = 'Accrual Plan ID does not exist. Please check ACCRUAL_PLAN_ID and ensure it exists in the accrual plans table.';
        const fkError = new DatabaseError(userMessage, error, userMessage);
        fkError.code = 'FOREIGN_KEY_CONSTRAINT';
        fkError.errorNum = error?.errorNum || 1403;
        throw fkError;
      }

      throw this.wrapDbError('Failed to update leave type accrual mapping', error);
    }
  }

  /**
   * Update by GUID
   */
  static async updateByGuid(guidHex32, data, userId = 'SYSTEM') {
    try {
      return await this.executeWithTransaction(async (connection) => {
        const hexGuid = ensureHex32(guidHex32, 'guid');
        const guidBuffer = hexToRawBuffer(hexGuid);

        // Check if record exists first
        const checkSql = `SELECT LEAVE_TYPE_ACCRUAL_ID FROM ${this.TABLE_NAME} WHERE LEAVE_TYPE_ACCRUAL_GUID = :1`;
        const checkRes = await connection.execute(checkSql, [guidBuffer], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        if (!checkRes.rows || checkRes.rows.length === 0) {
          return null;
        }
        const mappingId = checkRes.rows[0].LEAVE_TYPE_ACCRUAL_ID;

        const updateFields = [];
        const bindParams = [];
        let paramIndex = 1;

        if (data.TENANT_ID !== undefined) {
          updateFields.push(`TENANT_ID = :${paramIndex}`);
          bindParams.push(this.toInt(data.TENANT_ID, 'TENANT_ID'));
          paramIndex++;
        }

        if (data.LEAVE_TYPE_ID !== undefined) {
          updateFields.push(`LEAVE_TYPE_ID = :${paramIndex}`);
          bindParams.push(this.toInt(data.LEAVE_TYPE_ID, 'LEAVE_TYPE_ID'));
          paramIndex++;
        }

        if (data.ACCRUAL_PLAN_ID !== undefined) {
          updateFields.push(`ACCRUAL_PLAN_ID = :${paramIndex}`);
          bindParams.push(this.toInt(data.ACCRUAL_PLAN_ID, 'ACCRUAL_PLAN_ID'));
          paramIndex++;
        }

        if (data.EFFECTIVE_START_DATE !== undefined) {
          updateFields.push(`EFFECTIVE_START_DATE = :${paramIndex}`);
          bindParams.push(this.toDate(data.EFFECTIVE_START_DATE, 'EFFECTIVE_START_DATE'));
          paramIndex++;
        }

        if (data.EFFECTIVE_END_DATE !== undefined) {
          updateFields.push(`EFFECTIVE_END_DATE = :${paramIndex}`);
          bindParams.push(data.EFFECTIVE_END_DATE === null ? null : this.toDate(data.EFFECTIVE_END_DATE, 'EFFECTIVE_END_DATE'));
          paramIndex++;
        }

        // Check if no fields to update (before adding audit fields)
        if (updateFields.length === 0) {
          // No fields to update, fetch existing record
          const selectSql = `${this.baseSelectSql()} WHERE a.LEAVE_TYPE_ACCRUAL_GUID = :1`;
          const selRes = await connection.execute(selectSql, [guidBuffer], { outFormat: oracledb.OUT_FORMAT_OBJECT });
          const row = selRes.rows?.[0];
          if (!row) {
            // Record doesn't exist, return null to indicate not found
            return null;
          }
          return this.convertKeysToSnakeCase(row);
        }

        // Add audit fields
        updateFields.push(`LAST_UPDATE_DATE = :${paramIndex}`);
        bindParams.push(new Date());
        paramIndex++;
        updateFields.push(`LAST_UPDATED_BY = :${paramIndex}`);
        bindParams.push(userId);
        paramIndex++;

        const updateSql = `UPDATE ${this.TABLE_NAME} SET ${updateFields.join(', ')} WHERE LEAVE_TYPE_ACCRUAL_GUID = :${paramIndex}`;
        bindParams.push(guidBuffer);

        const updRes = await connection.execute(updateSql, bindParams, { outFormat: oracledb.OUT_FORMAT_OBJECT });

        if ((updRes.rowsAffected ?? 0) === 0) {
          return null;
        }

        // Return updated row
        const selSql = `${this.baseSelectSql()} WHERE a.LEAVE_TYPE_ACCRUAL_GUID = :1`;
        const selRes = await connection.execute(selSql, [guidBuffer], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const row = selRes.rows?.[0];
        if (!row) throw new DatabaseError('Failed to retrieve updated leave type accrual mapping');

        return this.convertKeysToSnakeCase(row);
      });
    } catch (error) {
      // User-defined error from trigger (20001) - Accrual Plan ID doesn't exist
      if (error?.errorNum === 20001 || String(error?.message || '').includes('ORA-20001') || 
          String(error?.message || '').includes('Accrual Plan ID') && String(error?.message || '').includes('does not exist')) {
        const userMessage = 'Accrual Plan ID does not exist. Please check ACCRUAL_PLAN_ID and ensure it exists in the accrual plans table.';
        const fkError = new DatabaseError(userMessage, error, userMessage);
        fkError.code = 'FOREIGN_KEY_CONSTRAINT';
        fkError.errorNum = error?.errorNum || 20001;
        throw fkError;
      }

      if (error?.errorNum === 4098 || String(error?.message || '').includes('ORA-04098')) {
        const e = new DatabaseError('Database trigger is invalid on ABS_LEAVE_TYPE_ACCRUAL (ORA-04098). Recompile/fix triggers.', error);
        e.code = 'DATABASE_TRIGGER_INVALID';
        throw e;
      }
      // Foreign key constraint (2291)
      if (error?.errorNum === 2291 || String(error?.message || '').includes('ORA-02291')) {
        let userMessage = 'The referenced record does not exist. ';
        const errorMsg = String(error?.message || '').toUpperCase();
        if (errorMsg.includes('LEAVE_TYPE_ID') || errorMsg.includes('LEAVE_TYPE')) {
          userMessage += 'Leave Type ID does not exist. Please check LEAVE_TYPE_ID.';
        } else if (errorMsg.includes('ACCRUAL_PLAN_ID') || errorMsg.includes('ACCRUAL_PLAN')) {
          userMessage += 'Accrual Plan ID does not exist. Please check ACCRUAL_PLAN_ID.';
        } else {
          userMessage += 'Please check LEAVE_TYPE_ID and ACCRUAL_PLAN_ID exist in their respective tables.';
        }
        const fkError = new DatabaseError(userMessage, error, userMessage);
        fkError.code = 'FOREIGN_KEY_CONSTRAINT';
        fkError.errorNum = error?.errorNum || 2291;
        throw fkError;
      }

      // No data found (1403) - usually from trigger looking up non-existent ACCRUAL_PLAN_ID
      if (error?.errorNum === 1403 || String(error?.message || '').includes('ORA-01403')) {
        const userMessage = 'Accrual Plan ID does not exist. Please check ACCRUAL_PLAN_ID and ensure it exists in the accrual plans table.';
        const fkError = new DatabaseError(userMessage, error, userMessage);
        fkError.code = 'FOREIGN_KEY_CONSTRAINT';
        fkError.errorNum = error?.errorNum || 1403;
        throw fkError;
      }

      throw this.wrapDbError('Failed to update leave type accrual mapping', error);
    }
  }

  /**
   * Delete
   */
  static async delete(id) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        const sql = `DELETE FROM ${this.TABLE_NAME} WHERE LEAVE_TYPE_ACCRUAL_ID = :1`;
        const res = await connection.execute(sql, [this.toInt(id, 'LEAVE_TYPE_ACCRUAL_ID')], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        return (res.rowsAffected ?? 0) > 0;
      });
    } catch (error) {
      throw this.wrapDbError('Failed to delete leave type accrual mapping', error);
    }
  }

  /**
   * Delete by GUID
   */
  static async deleteByGuid(guidHex32) {
    try {
      const hexGuid = ensureHex32(guidHex32, 'guid');
      const guidBuffer = hexToRawBuffer(hexGuid);

      return await this.executeWithTransaction(async (connection) => {
        const sql = `DELETE FROM ${this.TABLE_NAME} WHERE LEAVE_TYPE_ACCRUAL_GUID = :1`;
        const res = await connection.execute(sql, [guidBuffer], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        return (res.rowsAffected ?? 0) > 0;
      });
    } catch (error) {
      if (error.message?.includes('must be a 32-character hex GUID')) {
        throw error;
      }
      throw this.wrapDbError('Failed to delete leave type accrual mapping', error);
    }
  }
}

export default LeaveTypeAccrualModel;
