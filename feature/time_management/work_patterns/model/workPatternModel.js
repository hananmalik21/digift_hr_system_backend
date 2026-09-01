// workPatternModel.js
import db from '../../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError, ValidationError, NotFoundError } from '../../../../utils/errors/index.js';
import { toAuditActorId } from '@digifyhr/common';

/**
 * Work Pattern Model
 * Handles all database operations for TM.TM_WORK_PATTERNS and TM.TM_WORK_PATTERN_DAYS tables
 */
class WorkPatternModel {
  static TABLE_NAME = 'TM.TM_WORK_PATTERNS';
  static DAYS_TABLE_NAME = 'TM.TM_WORK_PATTERN_DAYS';

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
   * Transaction wrapper
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
        } catch (rollbackErr) {
          console.error('Error during rollback:', rollbackErr);
        }
      }
      throw error;
    } finally {
      if (connection?.close) {
        try {
          await connection.close();
        } catch (err) {
          console.error('Error closing connection:', err);
        }
      }
    }
  }

  /**
   * Deadlock detector (ORA-00060 / ORA-12860 or “deadlock” text)
   */
  static isDeadlockError(err) {
    const msg = String(err?.message || '').toUpperCase();
    const num = err?.errorNum;
    return (
      num === 60 ||
      num === 12860 ||
      msg.includes('ORA-00060') ||
      msg.includes('ORA-12860') ||
      msg.includes('DEADLOCK')
    );
  }

  /**
   * Create a new work pattern with 7 days in a single transaction
   * @param {Object} data - UPPER_CASE keys expected (TENANT_ID, PATTERN_CODE, ... , DAYS[])
   * @param {string} userId
   */
  static async create(data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        // WORK_PATTERN_ID (sequence -> fallback max+1)
        let workPatternId;
        try {
          const seqResult = await connection.execute(
            `SELECT TM.TM_WORK_PATTERNS_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          workPatternId = seqResult.rows[0].NEXT_ID;
        } catch {
          const maxResult = await connection.execute(
            `SELECT NVL(MAX(WORK_PATTERN_ID), 0) + 1 AS NEXT_ID FROM ${this.TABLE_NAME}`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          workPatternId = maxResult.rows[0].NEXT_ID;
        }

        const now = new Date();
        const createdBy = toAuditActorId(userId);

        // Insert header
        const insertHeaderSql = `INSERT INTO ${this.TABLE_NAME} (
          WORK_PATTERN_ID,
          TENANT_ID,
          PATTERN_CODE,
          PATTERN_NAME_EN,
          PATTERN_NAME_AR,
          PATTERN_TYPE,
          TOTAL_HOURS_PER_WEEK,
          STATUS,
          CREATION_DATE,
          CREATED_BY,
          LAST_UPDATE_DATE,
          LAST_UPDATED_BY
        ) VALUES (
          :workPatternId, :tenantId, :patternCode, :patternNameEn, :patternNameAr,
          :patternType, :totalHoursPerWeek, :status,
          :creationDate, :createdBy, :lastUpdateDate, :lastUpdatedBy
        ) RETURNING WORK_PATTERN_ID INTO :returnWorkPatternId`;

        const headerBinds = {
          workPatternId: { val: workPatternId, dir: oracledb.BIND_IN },
          tenantId: { val: data.TENANT_ID, dir: oracledb.BIND_IN },
          patternCode: { val: data.PATTERN_CODE, dir: oracledb.BIND_IN },
          patternNameEn: { val: data.PATTERN_NAME_EN, dir: oracledb.BIND_IN },
          patternNameAr: { val: data.PATTERN_NAME_AR || data.PATTERN_NAME_EN, dir: oracledb.BIND_IN },
          patternType: { val: data.PATTERN_TYPE, dir: oracledb.BIND_IN },
          totalHoursPerWeek: { val: data.TOTAL_HOURS_PER_WEEK, dir: oracledb.BIND_IN },
          status: { val: data.STATUS || 'ACTIVE', dir: oracledb.BIND_IN },
          creationDate: { val: now, dir: oracledb.BIND_IN, type: oracledb.DATE },
          createdBy: { val: createdBy, dir: oracledb.BIND_IN },
          lastUpdateDate: { val: now, dir: oracledb.BIND_IN, type: oracledb.DATE },
          lastUpdatedBy: { val: createdBy, dir: oracledb.BIND_IN },
          returnWorkPatternId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
        };

        const headerRes = await connection.execute(insertHeaderSql, headerBinds, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        const returnedId = Array.isArray(headerRes.outBinds.returnWorkPatternId)
          ? headerRes.outBinds.returnWorkPatternId[0]
          : headerRes.outBinds.returnWorkPatternId;

        // Insert days (create is fine with insertMany because new pattern)
        const daysInsertSql = `INSERT INTO ${this.DAYS_TABLE_NAME} (
          TENANT_ID,
          WORK_PATTERN_ID,
          DAY_OF_WEEK,
          DAY_TYPE,
          CREATION_DATE,
          CREATED_BY,
          LAST_UPDATE_DATE,
          LAST_UPDATED_BY
        ) VALUES (:1,:2,:3,:4,:5,:6,:7,:8)`;

        const daysData = (data.DAYS || []).map(d => ([
          Number(data.TENANT_ID),
          Number(returnedId),
          Number(d.DAY_OF_WEEK),
          String(d.DAY_TYPE).toUpperCase(),
          now,
          createdBy,
          now,
          createdBy
        ]));

        if (daysData.length) {
          const daysRes = await connection.executeMany(daysInsertSql, daysData, {
            bindDefs: [
              { type: oracledb.NUMBER },
              { type: oracledb.NUMBER },
              { type: oracledb.NUMBER },
              { type: oracledb.STRING, maxSize: 10 },
              { type: oracledb.DATE },
              { type: oracledb.STRING, maxSize: 50 },
              { type: oracledb.DATE },
              { type: oracledb.STRING, maxSize: 50 }
            ],
            batchErrors: true
          });

          if (daysRes.batchErrors?.length) {
            const msg = daysRes.batchErrors
              .map(e => `Row ${e.offset ?? e.index}: ${e.message}`)
              .join(' | ');
            throw new DatabaseError(`Failed to insert work pattern days: ${msg}`, daysRes.batchErrors[0]);
          }
        }

        // Return full pattern in same transaction (avoids extra findById round-trip)
        const headerSel = await connection.execute(
          `SELECT WORK_PATTERN_ID, TENANT_ID, PATTERN_CODE, PATTERN_NAME_EN, PATTERN_NAME_AR,
                  PATTERN_TYPE, TOTAL_HOURS_PER_WEEK, STATUS,
                  CREATION_DATE, CREATED_BY, LAST_UPDATE_DATE, LAST_UPDATED_BY
           FROM ${this.TABLE_NAME}
           WHERE WORK_PATTERN_ID = :1 AND TENANT_ID = :2`,
          [returnedId, data.TENANT_ID],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (!headerSel.rows?.length) {
          return { WORK_PATTERN_ID: returnedId, TENANT_ID: data.TENANT_ID };
        }
        const wp = this.convertKeysToSnakeCase(headerSel.rows[0]);
        const daysMap = await this.getDaysForPatternsWithConnection(connection, [returnedId], data.TENANT_ID);
        wp.days = daysMap[returnedId] || [];
        return wp;
      });
    } catch (error) {
      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof DatabaseError) {
        throw error;
      }
      if (error?.errorNum !== undefined || String(error?.message || '').includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      throw new DatabaseError('Failed to create work pattern', error);
    }
  }

  /**
   * Fetch days for patterns (uses connection when provided, for use inside transaction)
   */
  static async getDaysForPatterns(workPatternIds, tenantId, connection = null) {
    if (!workPatternIds?.length) return {};

    const placeholders = workPatternIds.map((_, i) => `:${i + 1}`).join(',');
    const sql = `SELECT WORK_PATTERN_ID, DAY_OF_WEEK, DAY_TYPE
                 FROM ${this.DAYS_TABLE_NAME}
                 WHERE WORK_PATTERN_ID IN (${placeholders})
                   AND TENANT_ID = :${workPatternIds.length + 1}
                 ORDER BY WORK_PATTERN_ID, DAY_OF_WEEK`;

    const binds = [...workPatternIds, tenantId];
    const result = connection
      ? await connection.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT })
      : await db.executeQuery(sql, binds);

    const map = {};
    (result.rows || []).forEach(r => {
      const pid = r.WORK_PATTERN_ID || r.work_pattern_id;
      if (!pid) return;
      if (!map[pid]) map[pid] = [];
      map[pid].push({
        day_of_week: r.DAY_OF_WEEK || r.day_of_week,
        day_type: r.DAY_TYPE || r.day_type
      });
    });

    return map;
  }

  /** Alias for use inside transaction (pass connection as 3rd arg) */
  static async getDaysForPatternsWithConnection(connection, workPatternIds, tenantId) {
    return this.getDaysForPatterns(workPatternIds, tenantId, connection);
  }

  /**
   * Find all patterns (pagination/search). Uses COUNT(*) OVER() for single-query pagination when possible.
   */
  static async findAll(filters = {}) {
    try {
      if (!filters.tenantId) throw new ValidationError('tenant_id is required');

      const conditions = [];
      const binds = [];
      let p = 1;

      conditions.push(`TENANT_ID = :${p}`);
      binds.push(filters.tenantId);
      p++;

      if (filters.status) {
        conditions.push(`STATUS = :${p}`);
        binds.push(filters.status);
        p++;
      }

      if (filters.search) {
        const v = `%${filters.search}%`;
        conditions.push(`(
          UPPER(PATTERN_CODE) LIKE UPPER(:${p}) OR
          UPPER(PATTERN_NAME_EN) LIKE UPPER(:${p + 1})
        )`);
        binds.push(v, v);
        p += 2;
      }

      const where = ` WHERE ${conditions.join(' AND ')}`;
      const pagination = filters.pagination;
      let total = 0;
      let dataSql = `SELECT
        WORK_PATTERN_ID, TENANT_ID, PATTERN_CODE, PATTERN_NAME_EN, PATTERN_NAME_AR,
        PATTERN_TYPE, TOTAL_HOURS_PER_WEEK, STATUS,
        CREATION_DATE, CREATED_BY, LAST_UPDATE_DATE, LAST_UPDATED_BY`;

      const dataBinds = [...binds];
      if (pagination?.page && pagination?.pageSize) {
        dataSql += `, COUNT(*) OVER() AS total`;
      }
      dataSql += ` FROM ${this.TABLE_NAME}`;
      dataSql += where;
      dataSql += ` ORDER BY PATTERN_CODE`;

      if (pagination?.page && pagination?.pageSize) {
        const offset = (pagination.page - 1) * pagination.pageSize;
        dataSql += ` OFFSET :${p} ROWS FETCH NEXT :${p + 1} ROWS ONLY`;
        dataBinds.push(offset, pagination.pageSize);
      }

      const res = await db.executeQuery(dataSql, dataBinds);
      const patterns = this.convertKeysToSnakeCase(res.rows || []);

      if (pagination?.page && pagination?.pageSize && patterns.length > 0) {
        total = Number(patterns[0].total) || 0;
        patterns.forEach(row => delete row.total);
      }

      if (patterns.length > 0) {
        const ids = patterns.map(x => x.work_pattern_id);
        const daysMap = await this.getDaysForPatterns(ids, filters.tenantId);
        patterns.forEach(x => { x.days = daysMap[x.work_pattern_id] || []; });
      }

      return pagination?.page && pagination?.pageSize
        ? { workPatterns: patterns, total }
        : { workPatterns: patterns, total: patterns.length };
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new DatabaseError(`Failed to fetch work patterns: ${error.message}`, error);
    }
  }

  /**
   * Find by id
   */
  static async findById(workPatternId, tenantId) {
    try {
      if (!tenantId) throw new ValidationError('tenant_id is required');

      const sql = `SELECT
        WORK_PATTERN_ID, TENANT_ID, PATTERN_CODE, PATTERN_NAME_EN, PATTERN_NAME_AR,
        PATTERN_TYPE, TOTAL_HOURS_PER_WEEK, STATUS,
        CREATION_DATE, CREATED_BY, LAST_UPDATE_DATE, LAST_UPDATED_BY
      FROM ${this.TABLE_NAME}
      WHERE WORK_PATTERN_ID = :1 AND TENANT_ID = :2`;

      const res = await db.executeQuery(sql, [workPatternId, tenantId]);
      if (!res.rows?.length) return null;

      const wp = this.convertKeysToSnakeCase(res.rows[0]);
      const daysMap = await this.getDaysForPatterns([workPatternId], tenantId);
      wp.days = daysMap[workPatternId] || [];
      return wp;
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      if (error?.errorNum !== undefined || String(error?.message || '').includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      throw new DatabaseError('Failed to fetch work pattern', error);
    }
  }

  /**
   * ✅ UPDATE (deadlock-safe)
   * - Locks header row first
   * - Uses MERGE for days (NO DELETE)
   * - Updates header fields
   * - Returns full record
   */
  static async update(workPatternId, tenantId, data, userId, retryCount = 0) {
    const MAX_RETRIES = 5;
    const BASE_DELAY_MS = 150;

    try {
      if (!tenantId) throw new ValidationError('tenant_id is required');

      return await this.executeWithTransaction(async (connection) => {
        // 0) Lock header row (consistent lock order)
        const lockSql = `SELECT 1
                         FROM ${this.TABLE_NAME}
                         WHERE WORK_PATTERN_ID = :1 AND TENANT_ID = :2
                         FOR UPDATE`;
        const lockRes = await connection.execute(lockSql, [workPatternId, tenantId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        if (!lockRes.rows?.length) {
          throw new NotFoundError('Work pattern not found');
        }

        const now = new Date();
        const actor = toAuditActorId(userId);

        // 1) Upsert days using MERGE (no delete => avoids deadlocks)
        if (data.DAYS !== undefined && Array.isArray(data.DAYS)) {
          const mergeSql = `
            MERGE INTO ${this.DAYS_TABLE_NAME} d
            USING (
              SELECT :tenant_id TENANT_ID,
                     :work_pattern_id WORK_PATTERN_ID,
                     :day_of_week DAY_OF_WEEK,
                     :day_type DAY_TYPE
              FROM dual
            ) s
            ON (
              d.TENANT_ID = s.TENANT_ID AND
              d.WORK_PATTERN_ID = s.WORK_PATTERN_ID AND
              d.DAY_OF_WEEK = s.DAY_OF_WEEK
            )
            WHEN MATCHED THEN UPDATE SET
              d.DAY_TYPE = s.DAY_TYPE,
              d.LAST_UPDATE_DATE = :now_dt,
              d.LAST_UPDATED_BY = :user_id
            WHEN NOT MATCHED THEN INSERT (
              TENANT_ID, WORK_PATTERN_ID, DAY_OF_WEEK, DAY_TYPE,
              CREATION_DATE, CREATED_BY, LAST_UPDATE_DATE, LAST_UPDATED_BY
            ) VALUES (
              :tenant_id, :work_pattern_id, :day_of_week, :day_type,
              :now_dt, :user_id, :now_dt, :user_id
            )
          `;

          const binds = data.DAYS.map(day => ({
            tenant_id: tenantId,
            work_pattern_id: workPatternId,
            day_of_week: Number(day.DAY_OF_WEEK ?? day.day_of_week),
            day_type: String(day.DAY_TYPE ?? day.day_type).toUpperCase(), // REST/WORK
            now_dt: now,
            user_id: actor
          }));

          const mergeRes = await connection.executeMany(mergeSql, binds, {
            autoCommit: false,
            batchErrors: true,
            bindDefs: {
              tenant_id: { type: oracledb.NUMBER },
              work_pattern_id: { type: oracledb.NUMBER },
              day_of_week: { type: oracledb.NUMBER },
              day_type: { type: oracledb.STRING, maxSize: 10 },
              now_dt: { type: oracledb.DATE },
              user_id: { type: oracledb.STRING, maxSize: 50 }
            }
          });

          if (mergeRes.batchErrors?.length) {
            const msg = mergeRes.batchErrors
              .map(e => `Row ${e.offset ?? e.index}: ${e.message}`)
              .join(' | ');
            throw new DatabaseError(`Failed to upsert work pattern days: ${msg}`, mergeRes.batchErrors[0]);
          }

          // Optional: if you want to strictly enforce only 7 rows exist
          await connection.execute(
            `DELETE FROM ${this.DAYS_TABLE_NAME}
             WHERE TENANT_ID = :1 AND WORK_PATTERN_ID = :2 AND DAY_OF_WEEK NOT IN (1,2,3,4,5,6,7)`,
            [tenantId, workPatternId],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
        }

        // 2) Header update
        const updateFields = [];
        const bindParams = [];
        let p = 1;

        if (data.PATTERN_NAME_EN !== undefined) {
          updateFields.push(`PATTERN_NAME_EN = :${p}`);
          bindParams.push(data.PATTERN_NAME_EN);
          p++;
        }
        if (data.PATTERN_NAME_AR !== undefined) {
          updateFields.push(`PATTERN_NAME_AR = :${p}`);
          bindParams.push(data.PATTERN_NAME_AR);
          p++;
        }
        if (data.PATTERN_TYPE !== undefined) {
          updateFields.push(`PATTERN_TYPE = :${p}`);
          bindParams.push(data.PATTERN_TYPE);
          p++;
        }
        if (data.TOTAL_HOURS_PER_WEEK !== undefined) {
          updateFields.push(`TOTAL_HOURS_PER_WEEK = :${p}`);
          bindParams.push(data.TOTAL_HOURS_PER_WEEK);
          p++;
        }
        if (data.STATUS !== undefined) {
          updateFields.push(`STATUS = :${p}`);
          bindParams.push(data.STATUS);
          p++;
        }

        if (updateFields.length === 0 && (!data.DAYS || !Array.isArray(data.DAYS))) {
          throw new ValidationError('No fields to update');
        }

        if (updateFields.length > 0) {
          updateFields.push(`LAST_UPDATED_BY = :${p}`);
          bindParams.push(actor);
          p++;

          updateFields.push(`LAST_UPDATE_DATE = :${p}`);
          bindParams.push(now);
          p++;

          bindParams.push(workPatternId);
          bindParams.push(tenantId);

          const headerSql = `UPDATE ${this.TABLE_NAME}
                             SET ${updateFields.join(', ')}
                             WHERE WORK_PATTERN_ID = :${p} AND TENANT_ID = :${p + 1}`;

          await connection.execute(headerSql, bindParams, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        }

        // 3) Return updated record
        const selectRes = await connection.execute(
          `SELECT
            WORK_PATTERN_ID, TENANT_ID, PATTERN_CODE, PATTERN_NAME_EN, PATTERN_NAME_AR,
            PATTERN_TYPE, TOTAL_HOURS_PER_WEEK, STATUS,
            CREATION_DATE, CREATED_BY, LAST_UPDATE_DATE, LAST_UPDATED_BY
           FROM ${this.TABLE_NAME}
           WHERE WORK_PATTERN_ID = :1 AND TENANT_ID = :2`,
          [workPatternId, tenantId],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (!selectRes.rows?.length) {
          throw new NotFoundError('Work pattern not found');
        }

        const workPattern = this.convertKeysToSnakeCase(selectRes.rows[0]);

        const daysRes = await connection.execute(
          `SELECT DAY_OF_WEEK, DAY_TYPE
           FROM ${this.DAYS_TABLE_NAME}
           WHERE WORK_PATTERN_ID = :1 AND TENANT_ID = :2
           ORDER BY DAY_OF_WEEK`,
          [workPatternId, tenantId],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        workPattern.days = (daysRes.rows || []).map(r => ({
          day_of_week: r.DAY_OF_WEEK,
          day_type: r.DAY_TYPE
        }));

        return workPattern;
      });
    } catch (error) {
      // Deadlock retry
      if (this.isDeadlockError(error) && retryCount < MAX_RETRIES) {
        const wait = BASE_DELAY_MS * Math.pow(2, retryCount);
        await new Promise(r => setTimeout(r, wait));
        return this.update(workPatternId, tenantId, data, userId, retryCount + 1);
      }

      if (error instanceof ValidationError || error instanceof NotFoundError) throw error;

      if (error?.errorNum !== undefined || String(error?.message || '').includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }

      if (error instanceof DatabaseError) throw error;

      throw new DatabaseError('Failed to update work pattern', error);
    }
  }

  /**
   * Soft delete (STATUS=INACTIVE)
   */
  static async softDelete(workPatternId, tenantId, userId) {
    try {
      if (!tenantId) throw new ValidationError('tenant_id is required');

      await this.executeWithTransaction(async (connection) => {
        const r = await connection.execute(
          `UPDATE ${this.TABLE_NAME}
           SET STATUS = 'INACTIVE',
               LAST_UPDATED_BY = :1,
               LAST_UPDATE_DATE = :2
           WHERE WORK_PATTERN_ID = :3 AND TENANT_ID = :4`,
          [toAuditActorId(userId), new Date(), workPatternId, tenantId],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const rows = r.rowsAffected || r.rowCount || 0;
        if (rows === 0) {
          throw new NotFoundError(`No work pattern found with ID: ${workPatternId} for tenant: ${tenantId}`);
        }
      });

      return true;
    } catch (error) {
      if (error instanceof ValidationError || error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to delete work pattern: ${error.message}`, error);
    }
  }

  /**
   * Hard delete - deletes child records first, then parent (handles foreign key constraints)
   */
/**
 * Hard delete - deadlock-safe
 * - Locks parent row first FOR UPDATE (consistent lock order)
 * - Deletes children then parent
 * - Retries ORA-12860 / ORA-00060 with backoff
 */
static async hardDelete(workPatternId, tenantId, retryCount = 0) {
  const MAX_RETRIES = 6;
  const BASE_DELAY_MS = 200;

  try {
    if (!tenantId) throw new ValidationError('tenant_id is required');

    await this.executeWithTransaction(async (connection) => {
      // ✅ critical: prevent parallel workers (fixes ORA-12801/ORA-12860 sibling locks)
      await connection.execute(`ALTER SESSION DISABLE PARALLEL QUERY`);
      await connection.execute(`ALTER SESSION DISABLE PARALLEL DML`);

      // 0) Lock parent row first (consistent lock order)
      const lockParent = await connection.execute(
        `SELECT 1
         FROM ${this.TABLE_NAME}
         WHERE WORK_PATTERN_ID = :1 AND TENANT_ID = :2
         FOR UPDATE NOWAIT`,
        [workPatternId, tenantId],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (!lockParent.rows?.length) {
        throw new NotFoundError(`No work pattern found with ID: ${workPatternId} for tenant: ${tenantId}`);
      }

      // 1) Lock child rows too (optional but helps consistency)
      await connection.execute(
        `SELECT 1
         FROM ${this.DAYS_TABLE_NAME}
         WHERE WORK_PATTERN_ID = :1 AND TENANT_ID = :2
         FOR UPDATE`,
        [workPatternId, tenantId],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      // 2) Delete children (force serial)
      await connection.execute(
        `DELETE /*+ NO_PARALLEL */ FROM ${this.DAYS_TABLE_NAME}
         WHERE WORK_PATTERN_ID = :1 AND TENANT_ID = :2`,
        [workPatternId, tenantId],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      // 3) Delete parent (force serial)
      const delParent = await connection.execute(
        `DELETE /*+ NO_PARALLEL */ FROM ${this.TABLE_NAME}
         WHERE WORK_PATTERN_ID = :1 AND TENANT_ID = :2`,
        [workPatternId, tenantId],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const rows = delParent.rowsAffected || delParent.rowCount || 0;
      if (rows === 0) {
        throw new NotFoundError(`No work pattern found with ID: ${workPatternId} for tenant: ${tenantId}`);
      }
    });

    return { success: true };
  } catch (error) {
    // ✅ treat ORA-12801 as retryable if it contains ORA-12860 sibling lock
    const msg = String(error?.message || '');
    const isParallelDeadlock =
      (error?.errorNum === 12801 || msg.includes('ORA-12801')) &&
      (msg.includes('ORA-12860') || msg.toUpperCase().includes('SIBLING ROW LOCK'));

    if ((this.isDeadlockError(error) || isParallelDeadlock) && retryCount < MAX_RETRIES) {
      const wait = BASE_DELAY_MS * Math.pow(2, retryCount);
      await new Promise(r => setTimeout(r, wait));
      return this.hardDelete(workPatternId, tenantId, retryCount + 1);
    }

    if (error instanceof ValidationError || error instanceof NotFoundError) throw error;

    if (error?.errorNum !== undefined || String(error?.message || '').includes('ORA-')) {
      throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
    }

    if (error instanceof DatabaseError) throw error;

    throw new DatabaseError('Failed to delete work pattern', error);
  }
}



  /**
   * Extract constraint name from error message
   */
  static extractConstraint(error) {
    if (!error) return null;
    const message = error.message || '';
    const match = message.match(/\(([A-Z_][A-Z0-9_.]+)\)/);
    return match ? match[1] : null;
  }
}

export default WorkPatternModel;
