// workScheduleModel.js (UPDATED: Rest Day support)
// - Adds DAY_TYPE (WORK|REST) support in TM_WORK_SCHEDULE_LINES
// - For REST day: SHIFT_ID must be NULL
// - Still prevents ORA-12860 by disabling Parallel DML per transaction
// - Still serializes concurrent updates with SELECT ... FOR UPDATE
// - Preserves ORA code in DatabaseError messages

import db from '../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError, ValidationError, NotFoundError } from '../../../utils/errors/index.js';

class WorkScheduleModel {
  static TABLE_NAME = 'ENT.TM_WORK_SCHEDULES';
  static LINES_TABLE_NAME = 'ENT.TM_WORK_SCHEDULE_LINES';

  /* =========================
   * Utilities
   * ========================= */

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

  static extractOraCode(error) {
    const msg = String(error?.message || '');
    const m = msg.match(/ORA-\d{5}/);
    return m ? m[0] : null;
  }

  static normalizeDayType(v) {
    const x = String(v ?? 'WORK').trim().toUpperCase();
    if (x === 'REST' || x === 'RESTDAY' || x === 'REST_DAY') return 'REST';
    return 'WORK';
  }

  static async disableParallelDml(connection) {
    try { await connection.execute(`ALTER SESSION DISABLE PARALLEL DML`); } catch (_) {}
    try { await connection.execute(`ALTER SESSION SET parallel_degree_policy = MANUAL`); } catch (_) {}
  }

  static async executeWithTransaction(callback) {
    let connection;
    try {
      connection = await db.getConnection();
      const result = await callback(connection);
      await connection.commit();
      return result;
    } catch (error) {
      if (connection?.rollback) {
        try { await connection.rollback(); } catch (rollbackErr) {
          console.error('Error during rollback:', rollbackErr);
        }
      }
      throw error;
    } finally {
      if (connection?.close) {
        try { await connection.close(); } catch (err) {
          console.error('Error closing connection:', err);
        }
      }
    }
  }

  /**
   * Insert lines helper (supports DAY_TYPE + REST shift_id null)
   * Expects UPPER_CASE keys but tolerates snake_case for safety.
   */
  static async insertWeeklyLines(connection, workScheduleId, weeklyLines, actor, now) {
    if (!weeklyLines || !Array.isArray(weeklyLines) || weeklyLines.length === 0) return;

    // NOTE: requires DB column DAY_TYPE and SHIFT_ID nullable
    const linesInsertSql = `INSERT INTO ${this.LINES_TABLE_NAME} (
      WORK_SCHEDULE_ID,
      DAY_OF_WEEK,
      DAY_TYPE,
      SHIFT_ID,
      CREATION_DATE,
      CREATED_BY,
      LAST_UPDATE_DATE,
      LAST_UPDATED_BY
    ) VALUES (:1,:2,:3,:4,:5,:6,:7,:8)`;

    const linesData = weeklyLines.map(line => {
      const dayOfWeek = line.DAY_OF_WEEK ?? line.day_of_week;
      const dayType = this.normalizeDayType(line.DAY_TYPE ?? line.day_type);
      const shiftIdRaw = line.SHIFT_ID ?? line.shift_id;

      // REST -> shift_id must be null
      const shiftId = dayType === 'REST' ? null : shiftIdRaw;

      return [
        workScheduleId,
        dayOfWeek,
        dayType,
        shiftId,
        now,
        actor,
        now,
        actor
      ];
    });

    const linesRes = await connection.executeMany(linesInsertSql, linesData, {
      bindDefs: [
        { type: oracledb.NUMBER },                 // work_schedule_id
        { type: oracledb.NUMBER },                 // day_of_week
        { type: oracledb.STRING, maxSize: 10 },    // day_type
        { type: oracledb.NUMBER },                 // shift_id (nullable)
        { type: oracledb.DATE },                   // creation_date
        { type: oracledb.STRING, maxSize: 50 },    // created_by
        { type: oracledb.DATE },                   // last_update_date
        { type: oracledb.STRING, maxSize: 50 }     // last_updated_by
      ],
      batchErrors: true
    });

    if (linesRes.batchErrors?.length) {
      const msg = linesRes.batchErrors
        .map(e => `Row ${e.offset ?? e.index}: ${e.message}`)
        .join(' | ');
      throw new DatabaseError(`Failed to insert work schedule lines: ${msg}`, linesRes.batchErrors[0]);
    }
  }

  /* =========================
   * Create
   * ========================= */

  static async create(data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        await this.disableParallelDml(connection);

        // WORK_SCHEDULE_ID (sequence -> fallback max+1)
        let workScheduleId;
        try {
          const seqResult = await connection.execute(
            `SELECT ENT.TM_WORK_SCHEDULES_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          workScheduleId = seqResult.rows[0].NEXT_ID;
        } catch {
          const maxResult = await connection.execute(
            `SELECT NVL(MAX(WORK_SCHEDULE_ID), 0) + 1 AS NEXT_ID FROM ${this.TABLE_NAME}`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          workScheduleId = maxResult.rows[0].NEXT_ID;
        }

        const now = new Date();
        const createdBy = userId || 'SYSTEM';

        const effectiveStartDate = data.EFFECTIVE_START_DATE instanceof Date
          ? data.EFFECTIVE_START_DATE
          : new Date(data.EFFECTIVE_START_DATE);

        const effectiveEndDate = data.EFFECTIVE_END_DATE
          ? (data.EFFECTIVE_END_DATE instanceof Date ? data.EFFECTIVE_END_DATE : new Date(data.EFFECTIVE_END_DATE))
          : null;

        const insertHeaderSql = `INSERT INTO ${this.TABLE_NAME} (
          WORK_SCHEDULE_ID,
          TENANT_ID,
          SCHEDULE_CODE,
          SCHEDULE_NAME_EN,
          SCHEDULE_NAME_AR,
          WORK_PATTERN_ID,
          EFFECTIVE_START_DATE,
          EFFECTIVE_END_DATE,
          ASSIGNMENT_MODE,
          STATUS,
          CREATION_DATE,
          CREATED_BY,
          LAST_UPDATE_DATE,
          LAST_UPDATED_BY
        ) VALUES (
          :workScheduleId, :tenantId, :scheduleCode, :scheduleNameEn, :scheduleNameAr,
          :workPatternId, :effectiveStartDate, :effectiveEndDate, :assignmentMode, :status,
          :creationDate, :createdBy, :lastUpdateDate, :lastUpdatedBy
        ) RETURNING WORK_SCHEDULE_ID INTO :returnWorkScheduleId`;

        const headerBinds = {
          workScheduleId: { val: workScheduleId, dir: oracledb.BIND_IN },
          tenantId: { val: data.TENANT_ID, dir: oracledb.BIND_IN },
          scheduleCode: { val: data.SCHEDULE_CODE, dir: oracledb.BIND_IN },
          scheduleNameEn: { val: data.SCHEDULE_NAME_EN, dir: oracledb.BIND_IN },
          scheduleNameAr: { val: data.SCHEDULE_NAME_AR || null, dir: oracledb.BIND_IN },
          workPatternId: { val: data.WORK_PATTERN_ID, dir: oracledb.BIND_IN },
          effectiveStartDate: { val: effectiveStartDate, dir: oracledb.BIND_IN, type: oracledb.DATE },
          effectiveEndDate: { val: effectiveEndDate, dir: oracledb.BIND_IN, type: oracledb.DATE },
          assignmentMode: { val: data.ASSIGNMENT_MODE, dir: oracledb.BIND_IN },
          status: { val: data.STATUS || 'ACTIVE', dir: oracledb.BIND_IN },
          creationDate: { val: now, dir: oracledb.BIND_IN, type: oracledb.DATE },
          createdBy: { val: createdBy, dir: oracledb.BIND_IN },
          lastUpdateDate: { val: now, dir: oracledb.BIND_IN, type: oracledb.DATE },
          lastUpdatedBy: { val: createdBy, dir: oracledb.BIND_IN },
          returnWorkScheduleId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
        };

        const headerRes = await connection.execute(insertHeaderSql, headerBinds, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        const returnedId = Array.isArray(headerRes.outBinds.returnWorkScheduleId)
          ? headerRes.outBinds.returnWorkScheduleId[0]
          : headerRes.outBinds.returnWorkScheduleId;

        // Insert weekly lines (DAY_TYPE supported)
        await this.insertWeeklyLines(connection, returnedId, data.WEEKLY_LINES, createdBy, now);

        return {
          WORK_SCHEDULE_ID: returnedId,
          TENANT_ID: data.TENANT_ID
        };
      });
    } catch (error) {
      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof DatabaseError) throw error;

      if (error?.errorNum !== undefined || String(error?.message || '').includes('ORA-')) {
        const ora = this.extractOraCode(error);
        throw new DatabaseError(ora ? `${ora}: ${error.message}` : (error.message || 'Oracle database error'), error);
      }

      throw new DatabaseError('Failed to create work schedule', error);
    }
  }

  /* =========================
   * Find All
   * ========================= */

  static async findAll(filters = {}) {
    try {
      let countSql = `SELECT COUNT(*) AS total FROM ${this.TABLE_NAME}`;
      let dataSql = `SELECT
        WORK_SCHEDULE_ID, TENANT_ID, SCHEDULE_CODE, SCHEDULE_NAME_EN, SCHEDULE_NAME_AR,
        WORK_PATTERN_ID, EFFECTIVE_START_DATE, EFFECTIVE_END_DATE, ASSIGNMENT_MODE, STATUS,
        CREATION_DATE, CREATED_BY, LAST_UPDATE_DATE, LAST_UPDATED_BY
      FROM ${this.TABLE_NAME}`;

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
          UPPER(SCHEDULE_CODE) LIKE UPPER(:${p}) OR
          UPPER(SCHEDULE_NAME_EN) LIKE UPPER(:${p + 1})
        )`);
        binds.push(v, v);
        p += 2;
      }

      if (filters.effectiveOn) {
        const effectiveDate = filters.effectiveOn instanceof Date ? filters.effectiveOn : new Date(filters.effectiveOn);
        conditions.push(`EFFECTIVE_START_DATE <= :${p} AND (EFFECTIVE_END_DATE IS NULL OR EFFECTIVE_END_DATE >= :${p})`);
        binds.push(effectiveDate);
        p++;
      }

      const where = ` WHERE ${conditions.join(' AND ')}`;
      countSql += where;
      dataSql += where;
      dataSql += ` ORDER BY SCHEDULE_CODE`;

      const pagination = filters.pagination;
      let total = 0;

      const dataBinds = [...binds];
      if (pagination?.page && pagination?.pageSize) {
        const c = await db.executeQuery(countSql, [...binds]);
        total = c.rows?.[0]?.TOTAL || 0;

        const offset = (pagination.page - 1) * pagination.pageSize;
        dataSql += ` OFFSET :${p} ROWS FETCH NEXT :${p + 1} ROWS ONLY`;
        dataBinds.push(offset, pagination.pageSize);
      }

      const res = await db.executeQuery(dataSql, dataBinds);
      const schedules = this.convertKeysToSnakeCase(res.rows || []);

      // Fetch weekly_lines for all schedules
      if (schedules.length) {
        const ids = schedules.map(x => x.work_schedule_id);
        const linesMap = await this.getLinesForSchedules(ids);
        schedules.forEach(x => { x.weekly_lines = linesMap[x.work_schedule_id] || []; });
      }

      return pagination?.page ? { workSchedules: schedules, total } : { workSchedules: schedules, total: schedules.length };
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new DatabaseError(`Failed to fetch work schedules: ${error.message}`, error);
    }
  }

  /* =========================
   * Lines for many schedules
   * ========================= */

  static async getLinesForSchedules(workScheduleIds) {
    if (!workScheduleIds?.length) return {};

    const placeholders = workScheduleIds.map((_, i) => `:${i + 1}`).join(',');
    const sql = `SELECT
      wsl.WORK_SCHEDULE_ID,
      wsl.DAY_OF_WEEK,
      wsl.DAY_TYPE,
      wsl.SHIFT_ID,
      s.SHIFT_CODE,
      s.SHIFT_NAME_EN,
      s.SHIFT_NAME_AR,
      s.START_MINUTES,
      s.END_MINUTES,
      s.DURATION_HOURS,
      s.BREAK_HOURS,
      (s.DURATION_HOURS - NVL(s.BREAK_HOURS, 0)) AS PAID_HOURS,
      s.SHIFT_TYPE,
      s.COLOR_HEX,
      s.STATUS AS SHIFT_STATUS
    FROM ${this.LINES_TABLE_NAME} wsl
    LEFT JOIN ENT.TM_SHIFTS s ON wsl.SHIFT_ID = s.SHIFT_ID
    WHERE wsl.WORK_SCHEDULE_ID IN (${placeholders})
    ORDER BY wsl.WORK_SCHEDULE_ID, wsl.DAY_OF_WEEK`;

    const result = await db.executeQuery(sql, [...workScheduleIds]);

    const map = {};
    (result.rows || []).forEach(r => {
      const sid = r.WORK_SCHEDULE_ID || r.work_schedule_id;
      if (!sid) return;
      if (!map[sid]) map[sid] = [];

      const converted = this.convertKeysToSnakeCase(r);
      const dayType = this.normalizeDayType(converted.day_type);

      map[sid].push({
        work_schedule_id: converted.work_schedule_id,
        day_of_week: converted.day_of_week,
        day_type: dayType,
        shift: dayType === 'REST'
          ? null
          : {
              shift_id: converted.shift_id ?? null,
              shift_code: converted.shift_code ?? null,
              shift_name_en: converted.shift_name_en ?? null,
              shift_name_ar: converted.shift_name_ar ?? null,
              start_minutes: converted.start_minutes ?? null,
              end_minutes: converted.end_minutes ?? null,
              duration_hours: converted.duration_hours ?? null,
              break_hours: converted.break_hours ?? null,
              paid_hours: converted.paid_hours ?? null,
              shift_type: converted.shift_type ?? null,
              color_hex: converted.color_hex ?? null,
              status: converted.shift_status ?? null
            }
      });
    });

    return map;
  }

  /* =========================
   * Find By Id
   * ========================= */

  static async findById(workScheduleId, tenantId) {
    try {
      if (!tenantId) throw new ValidationError('tenant_id is required');

      const sql = `SELECT
        ws.WORK_SCHEDULE_ID, ws.TENANT_ID, ws.SCHEDULE_CODE, ws.SCHEDULE_NAME_EN, ws.SCHEDULE_NAME_AR,
        ws.WORK_PATTERN_ID, ws.EFFECTIVE_START_DATE, ws.EFFECTIVE_END_DATE, ws.ASSIGNMENT_MODE, ws.STATUS,
        ws.CREATION_DATE, ws.CREATED_BY, ws.LAST_UPDATE_DATE, ws.LAST_UPDATED_BY
      FROM ${this.TABLE_NAME} ws
      WHERE ws.WORK_SCHEDULE_ID = :1 AND ws.TENANT_ID = :2`;

      const res = await db.executeQuery(sql, [workScheduleId, tenantId]);
      if (!res.rows?.length) return null;

      const schedule = this.convertKeysToSnakeCase(res.rows[0]);

      const linesSql = `SELECT
        wsl.DAY_OF_WEEK,
        wsl.DAY_TYPE,
        wsl.SHIFT_ID,
        s.SHIFT_CODE,
        s.SHIFT_NAME_EN,
        s.SHIFT_NAME_AR,
        s.START_MINUTES,
        s.END_MINUTES,
        s.DURATION_HOURS,
        s.BREAK_HOURS,
        (s.DURATION_HOURS - NVL(s.BREAK_HOURS, 0)) AS PAID_HOURS,
        s.SHIFT_TYPE,
        s.COLOR_HEX,
        s.STATUS AS SHIFT_STATUS
      FROM ${this.LINES_TABLE_NAME} wsl
      LEFT JOIN ENT.TM_SHIFTS s ON wsl.SHIFT_ID = s.SHIFT_ID
      WHERE wsl.WORK_SCHEDULE_ID = :1
      ORDER BY wsl.DAY_OF_WEEK`;

      const linesRes = await db.executeQuery(linesSql, [workScheduleId]);

      schedule.weekly_lines = (linesRes.rows || []).map(r => {
        const converted = this.convertKeysToSnakeCase(r);
        const dayType = this.normalizeDayType(converted.day_type);

        return {
          work_schedule_id: workScheduleId,
          day_of_week: converted.day_of_week,
          day_type: dayType,
          shift: dayType === 'REST'
            ? null
            : {
                shift_id: converted.shift_id ?? null,
                shift_code: converted.shift_code ?? null,
                shift_name_en: converted.shift_name_en ?? null,
                shift_name_ar: converted.shift_name_ar ?? null,
                start_minutes: converted.start_minutes ?? null,
                end_minutes: converted.end_minutes ?? null,
                duration_hours: converted.duration_hours ?? null,
                break_hours: converted.break_hours ?? null,
                paid_hours: converted.paid_hours ?? null,
                shift_type: converted.shift_type ?? null,
                color_hex: converted.color_hex ?? null,
                status: converted.shift_status ?? null
              }
        };
      });

      if (!schedule.weekly_lines) schedule.weekly_lines = [];
      return schedule;
    } catch (error) {
      if (error instanceof ValidationError) throw error;

      if (error?.errorNum !== undefined || String(error?.message || '').includes('ORA-')) {
        const ora = this.extractOraCode(error);
        throw new DatabaseError(ora ? `${ora}: ${error.message}` : (error.message || 'Oracle database error'), error);
      }

      throw new DatabaseError('Failed to fetch work schedule', error);
    }
  }

  /* =========================
   * Update (Header + optional lines replacement)
   * ========================= */

  static async update(workScheduleId, tenantId, data, userId) {
    try {
      if (!tenantId) throw new ValidationError('tenant_id is required');

      return await this.executeWithTransaction(async (connection) => {
        await this.disableParallelDml(connection);

        // Lock header row
        const lockRes = await connection.execute(
          `SELECT 1 FROM ${this.TABLE_NAME}
           WHERE WORK_SCHEDULE_ID = :1 AND TENANT_ID = :2
           FOR UPDATE`,
          [workScheduleId, tenantId],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (!lockRes.rows?.length) throw new NotFoundError('Work schedule not found');

        const now = new Date();
        const actor = userId || 'SYSTEM';

        const updateFields = [];
        const bindParams = [];
        let p = 1;

        if (data.SCHEDULE_NAME_EN !== undefined) { updateFields.push(`SCHEDULE_NAME_EN = :${p}`); bindParams.push(data.SCHEDULE_NAME_EN); p++; }
        if (data.SCHEDULE_NAME_AR !== undefined) { updateFields.push(`SCHEDULE_NAME_AR = :${p}`); bindParams.push(data.SCHEDULE_NAME_AR); p++; }
        if (data.WORK_PATTERN_ID !== undefined) { updateFields.push(`WORK_PATTERN_ID = :${p}`); bindParams.push(data.WORK_PATTERN_ID); p++; }

        if (data.EFFECTIVE_START_DATE !== undefined) {
          updateFields.push(`EFFECTIVE_START_DATE = :${p}`);
          bindParams.push(data.EFFECTIVE_START_DATE instanceof Date ? data.EFFECTIVE_START_DATE : new Date(data.EFFECTIVE_START_DATE));
          p++;
        }

        if (data.EFFECTIVE_END_DATE !== undefined) {
          updateFields.push(`EFFECTIVE_END_DATE = :${p}`);
          bindParams.push(
            data.EFFECTIVE_END_DATE === null
              ? null
              : (data.EFFECTIVE_END_DATE instanceof Date ? data.EFFECTIVE_END_DATE : new Date(data.EFFECTIVE_END_DATE))
          );
          p++;
        }

        if (data.ASSIGNMENT_MODE !== undefined) { updateFields.push(`ASSIGNMENT_MODE = :${p}`); bindParams.push(data.ASSIGNMENT_MODE); p++; }
        if (data.STATUS !== undefined) { updateFields.push(`STATUS = :${p}`); bindParams.push(data.STATUS); p++; }

        if (updateFields.length > 0) {
          updateFields.push(`LAST_UPDATED_BY = :${p}`); bindParams.push(actor); p++;
          updateFields.push(`LAST_UPDATE_DATE = :${p}`); bindParams.push(now); p++;

          bindParams.push(workScheduleId);
          bindParams.push(tenantId);

          const updateSql = `UPDATE ${this.TABLE_NAME}
                             SET ${updateFields.join(', ')}
                             WHERE WORK_SCHEDULE_ID = :${p} AND TENANT_ID = :${p + 1}`;

          await connection.execute(updateSql, bindParams, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        }

        // Replace weekly lines if provided (DAY_TYPE supported)
        if (data.WEEKLY_LINES !== undefined && Array.isArray(data.WEEKLY_LINES)) {
          await connection.execute(
            `DELETE FROM ${this.LINES_TABLE_NAME}
             WHERE WORK_SCHEDULE_ID = :1`,
            [workScheduleId],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );

          await this.insertWeeklyLines(connection, workScheduleId, data.WEEKLY_LINES, actor, now);
        }

        if (updateFields.length === 0 && (data.WEEKLY_LINES === undefined || !Array.isArray(data.WEEKLY_LINES))) {
          throw new ValidationError('No fields to update');
        }

        const selectRes = await connection.execute(
          `SELECT
            WORK_SCHEDULE_ID, TENANT_ID, SCHEDULE_CODE, SCHEDULE_NAME_EN, SCHEDULE_NAME_AR,
            WORK_PATTERN_ID, EFFECTIVE_START_DATE, EFFECTIVE_END_DATE, ASSIGNMENT_MODE, STATUS,
            CREATION_DATE, CREATED_BY, LAST_UPDATE_DATE, LAST_UPDATED_BY
           FROM ${this.TABLE_NAME}
           WHERE WORK_SCHEDULE_ID = :1 AND TENANT_ID = :2`,
          [workScheduleId, tenantId],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (!selectRes.rows?.length) throw new NotFoundError('Work schedule not found');

        return this.convertKeysToSnakeCase(selectRes.rows[0]);
      });
    } catch (error) {
      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof DatabaseError) throw error;

      if (error?.errorNum !== undefined || String(error?.message || '').includes('ORA-')) {
        const ora = this.extractOraCode(error);
        throw new DatabaseError(ora ? `${ora}: ${error.message}` : (error.message || 'Oracle database error'), error);
      }

      throw new DatabaseError('Failed to update work schedule', error);
    }
  }

  /* =========================
   * Update Lines Only (Replace)
   * ========================= */

  static async updateLines(workScheduleId, tenantId, weeklyLines, userId) {
    try {
      if (!tenantId) throw new ValidationError('tenant_id is required');

      return await this.executeWithTransaction(async (connection) => {
        await this.disableParallelDml(connection);

        const lockRes = await connection.execute(
          `SELECT 1 FROM ${this.TABLE_NAME}
           WHERE WORK_SCHEDULE_ID = :1 AND TENANT_ID = :2
           FOR UPDATE`,
          [workScheduleId, tenantId],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (!lockRes.rows?.length) throw new NotFoundError('Work schedule not found');

        const now = new Date();
        const actor = userId || 'SYSTEM';

        await connection.execute(
          `DELETE FROM ${this.LINES_TABLE_NAME}
           WHERE WORK_SCHEDULE_ID = :1`,
          [workScheduleId],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        await this.insertWeeklyLines(connection, workScheduleId, weeklyLines, actor, now);

        return { success: true };
      });
    } catch (error) {
      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof DatabaseError) throw error;

      if (error?.errorNum !== undefined || String(error?.message || '').includes('ORA-')) {
        const ora = this.extractOraCode(error);
        throw new DatabaseError(ora ? `${ora}: ${error.message}` : (error.message || 'Oracle database error'), error);
      }

      throw new DatabaseError('Failed to update work schedule lines', error);
    }
  }

  /* =========================
   * Soft Delete
   * ========================= */

  static async softDelete(workScheduleId, tenantId, userId) {
    try {
      if (!tenantId) throw new ValidationError('tenant_id is required');

      await this.executeWithTransaction(async (connection) => {
        await this.disableParallelDml(connection);

        const r = await connection.execute(
          `UPDATE ${this.TABLE_NAME}
           SET STATUS = 'INACTIVE',
               LAST_UPDATED_BY = :1,
               LAST_UPDATE_DATE = :2
           WHERE WORK_SCHEDULE_ID = :3 AND TENANT_ID = :4`,
          [userId || 'SYSTEM', new Date(), workScheduleId, tenantId],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const rows = r.rowsAffected || r.rowCount || 0;
        if (rows === 0) {
          throw new NotFoundError(`No work schedule found with ID: ${workScheduleId} for tenant: ${tenantId}`);
        }
      });

      return true;
    } catch (error) {
      if (error instanceof ValidationError || error instanceof NotFoundError) throw error;
      throw new DatabaseError(`Failed to delete work schedule: ${error.message}`, error);
    }
  }

  /* =========================
   * Hard Delete
   * ========================= */

  static async hardDelete(workScheduleId, tenantId) {
    try {
      if (!tenantId) throw new ValidationError('tenant_id is required');

      await this.executeWithTransaction(async (connection) => {
        await this.disableParallelDml(connection);

        const checkRes = await connection.execute(
          `SELECT 1 FROM ${this.TABLE_NAME}
           WHERE WORK_SCHEDULE_ID = :1 AND TENANT_ID = :2
           FOR UPDATE`,
          [workScheduleId, tenantId],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (!checkRes.rows?.length) {
          throw new NotFoundError(`No work schedule found with ID: ${workScheduleId} for tenant: ${tenantId}`);
        }

        await connection.execute(
          `DELETE FROM ${this.LINES_TABLE_NAME}
           WHERE WORK_SCHEDULE_ID = :1`,
          [workScheduleId],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const r = await connection.execute(
          `DELETE FROM ${this.TABLE_NAME}
           WHERE WORK_SCHEDULE_ID = :1 AND TENANT_ID = :2`,
          [workScheduleId, tenantId],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const rows = r.rowsAffected || r.rowCount || 0;
        if (rows === 0) {
          throw new NotFoundError(`No work schedule found with ID: ${workScheduleId} for tenant: ${tenantId}`);
        }
      });

      return { success: true };
    } catch (error) {
      if (error instanceof ValidationError || error instanceof NotFoundError) throw error;

      if (error?.errorNum !== undefined || String(error?.message || '').includes('ORA-')) {
        const ora = this.extractOraCode(error);
        throw new DatabaseError(ora ? `${ora}: ${error.message}` : (error.message || 'Oracle database error'), error);
      }

      throw new DatabaseError('Failed to delete work schedule', error);
    }
  }
}

export default WorkScheduleModel;
