// workScheduleModel.js — canonical TM schema
// - Tables: TM.TM_WORK_SCHEDULES / TM.TM_WORK_SCHEDULE_LINES / joins TM.TM_WORK_PATTERNS + TM.TM_SHIFTS
// - DAY_TYPE comes from TM.TM_WORK_PATTERN_DAYS (schedule lines have no DAY_TYPE; SHIFT_ID is NOT NULL)
// - TIME_ZONE is required on create; validated via V$TIMEZONE_NAMES
// - Prevents ORA-12860 by disabling Parallel DML; concurrent updates use SELECT ... FOR UPDATE

import db from '../../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError, ValidationError, NotFoundError } from '../../../../utils/errors/index.js';
import { toAuditActorId } from '../../../../utils/requestUtils.js';
import { normalizeDayType } from '../constants.js';

class WorkScheduleModel {
  static TABLE_NAME = 'TM.TM_WORK_SCHEDULES';
  static LINES_TABLE_NAME = 'TM.TM_WORK_SCHEDULE_LINES';
  static PATTERNS_TABLE_NAME = 'TM.TM_WORK_PATTERNS';
  static PATTERN_DAYS_TABLE_NAME = 'TM.TM_WORK_PATTERN_DAYS';
  static SHIFTS_TABLE_NAME = 'TM.TM_SHIFTS';

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
    return normalizeDayType(v);
  }

  /**
   * Validate timezone region against Oracle V$TIMEZONE_NAMES.
   * @param {string|null|undefined} value
   * @param {{ allowNull?: boolean }} [opts]
   */
  static async assertValidTimeZone(value, { allowNull = false } = {}) {
    if (value == null || value === '') {
      if (allowNull) return null;
      throw new ValidationError('time_zone is required', [
        { field: 'time_zone', message: 'time_zone is required' }
      ]);
    }
    const tz = String(value).trim();
    if (!tz) {
      if (allowNull) return null;
      throw new ValidationError('time_zone is required', [
        { field: 'time_zone', message: 'time_zone is required' }
      ]);
    }
    if (tz.length > 100) {
      throw new ValidationError('time_zone must be at most 100 characters', [
        { field: 'time_zone', message: 'time_zone must be at most 100 characters' }
      ]);
    }

    const result = await db.executeQuery(
      `SELECT 1 AS OK FROM v$timezone_names WHERE tzname = :tz FETCH FIRST 1 ROW ONLY`,
      [tz],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if (!result.rows?.length) {
      throw new ValidationError('time_zone must be a valid Oracle timezone region', [
        { field: 'time_zone', message: `Unknown timezone region: ${tz}` }
      ]);
    }
    return tz;
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
   * Insert WORK-day schedule lines.
   * TM.TM_WORK_SCHEDULE_LINES has no DAY_TYPE and SHIFT_ID is NOT NULL —
   * REST/OFF days are owned by TM.TM_WORK_PATTERN_DAYS and are skipped here.
   */
  static async insertWeeklyLines(connection, workScheduleId, weeklyLines, actor, now, tenantId) {
    if (!weeklyLines || !Array.isArray(weeklyLines) || weeklyLines.length === 0) return;
    if (tenantId == null) throw new ValidationError('tenant_id is required for schedule lines');

    const linesInsertSql = `INSERT INTO ${this.LINES_TABLE_NAME} (
      TENANT_ID,
      WORK_SCHEDULE_ID,
      DAY_OF_WEEK,
      SHIFT_ID,
      CREATION_DATE,
      CREATED_BY,
      LAST_UPDATE_DATE,
      LAST_UPDATED_BY
    ) VALUES (:1,:2,:3,:4,:5,:6,:7,:8)`;

    const linesData = [];
    for (const line of weeklyLines) {
      const dayOfWeek = Number(line.DAY_OF_WEEK ?? line.day_of_week);
      const dayType = this.normalizeDayType(line.DAY_TYPE ?? line.day_type);
      const shiftIdRaw = line.SHIFT_ID ?? line.shift_id;
      // Pattern owns REST/OFF; only persist WORK days with a shift.
      if (dayType === 'REST' || dayType === 'OFF') continue;
      if (shiftIdRaw == null || shiftIdRaw === '') {
        throw new ValidationError(`shift_id is required for WORK day_of_week ${dayOfWeek}`);
      }
      linesData.push([
        Number(tenantId),
        workScheduleId,
        dayOfWeek,
        Number(shiftIdRaw),
        now,
        actor,
        now,
        actor
      ]);
    }

    if (!linesData.length) return;

    const linesRes = await connection.executeMany(linesInsertSql, linesData, {
      bindDefs: [
        { type: oracledb.NUMBER },                 // tenant_id
        { type: oracledb.NUMBER },                 // work_schedule_id
        { type: oracledb.NUMBER },                 // day_of_week
        { type: oracledb.NUMBER },                 // shift_id
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
            `SELECT TM.TM_WORK_SCHEDULES_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`,
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
        const createdBy = toAuditActorId(userId);

        const effectiveStartDate = data.EFFECTIVE_START_DATE instanceof Date
          ? data.EFFECTIVE_START_DATE
          : new Date(data.EFFECTIVE_START_DATE);

        const effectiveEndDate = data.EFFECTIVE_END_DATE
          ? (data.EFFECTIVE_END_DATE instanceof Date ? data.EFFECTIVE_END_DATE : new Date(data.EFFECTIVE_END_DATE))
          : null;

        const timeZone = await this.assertValidTimeZone(data.TIME_ZONE);

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
          TIME_ZONE,
          CREATION_DATE,
          CREATED_BY,
          LAST_UPDATE_DATE,
          LAST_UPDATED_BY
        ) VALUES (
          :workScheduleId, :tenantId, :scheduleCode, :scheduleNameEn, :scheduleNameAr,
          :workPatternId, :effectiveStartDate, :effectiveEndDate, :assignmentMode, :status,
          :timeZone,
          :creationDate, :createdBy, :lastUpdateDate, :lastUpdatedBy
        ) RETURNING WORK_SCHEDULE_ID INTO :returnWorkScheduleId`;

        const headerBinds = {
          workScheduleId: { val: workScheduleId, dir: oracledb.BIND_IN },
          tenantId: { val: data.TENANT_ID, dir: oracledb.BIND_IN },
          scheduleCode: { val: data.SCHEDULE_CODE, dir: oracledb.BIND_IN },
          scheduleNameEn: { val: data.SCHEDULE_NAME_EN, dir: oracledb.BIND_IN },
          scheduleNameAr: { val: data.SCHEDULE_NAME_AR || data.SCHEDULE_NAME_EN, dir: oracledb.BIND_IN },
          workPatternId: { val: data.WORK_PATTERN_ID, dir: oracledb.BIND_IN },
          effectiveStartDate: { val: effectiveStartDate, dir: oracledb.BIND_IN, type: oracledb.DATE },
          effectiveEndDate: { val: effectiveEndDate, dir: oracledb.BIND_IN, type: oracledb.DATE },
          assignmentMode: { val: data.ASSIGNMENT_MODE, dir: oracledb.BIND_IN },
          status: { val: data.STATUS || 'ACTIVE', dir: oracledb.BIND_IN },
          timeZone: { val: timeZone, dir: oracledb.BIND_IN },
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

        await this.insertWeeklyLines(connection, returnedId, data.WEEKLY_LINES, createdBy, now, data.TENANT_ID);

        return await this.findByIdWithConnection(connection, returnedId, data.TENANT_ID);
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
      const includeLines = filters.includeLines !== false;
      let dataSql = `SELECT
        ws.WORK_SCHEDULE_ID, ws.TENANT_ID, ws.SCHEDULE_CODE, ws.SCHEDULE_NAME_EN, ws.SCHEDULE_NAME_AR,
        ws.WORK_PATTERN_ID, wp.PATTERN_NAME_EN, wp.PATTERN_NAME_AR,
        ws.EFFECTIVE_START_DATE, ws.EFFECTIVE_END_DATE, ws.ASSIGNMENT_MODE, ws.STATUS,
        ws.TIME_ZONE,
        ws.CREATION_DATE, ws.CREATED_BY, ws.LAST_UPDATE_DATE, ws.LAST_UPDATED_BY`;

      const pagination = filters.pagination;
      if (pagination?.page && pagination?.pageSize) {
        dataSql += `, COUNT(*) OVER() AS total`;
      }
      dataSql += `
      FROM ${this.TABLE_NAME} ws
      LEFT JOIN ${this.PATTERNS_TABLE_NAME} wp ON ws.WORK_PATTERN_ID = wp.WORK_PATTERN_ID AND ws.TENANT_ID = wp.TENANT_ID`;

      if (!filters.tenantId) throw new ValidationError('tenant_id is required');

      const conditions = [];
      const binds = [];
      let p = 1;

      conditions.push(`ws.TENANT_ID = :${p}`);
      binds.push(filters.tenantId);
      p++;

      if (filters.status) {
        conditions.push(`ws.STATUS = :${p}`);
        binds.push(filters.status);
        p++;
      }

      if (filters.search) {
        const v = `%${filters.search}%`;
        conditions.push(`(
          UPPER(ws.SCHEDULE_CODE) LIKE UPPER(:${p}) OR
          UPPER(ws.SCHEDULE_NAME_EN) LIKE UPPER(:${p + 1})
        )`);
        binds.push(v, v);
        p += 2;
      }

      if (filters.effectiveOn) {
        const effectiveDate = filters.effectiveOn instanceof Date ? filters.effectiveOn : new Date(filters.effectiveOn);
        conditions.push(`ws.EFFECTIVE_START_DATE <= :${p} AND (ws.EFFECTIVE_END_DATE IS NULL OR ws.EFFECTIVE_END_DATE >= :${p})`);
        binds.push(effectiveDate);
        p++;
      }

      const where = ` WHERE ${conditions.join(' AND ')}`;
      dataSql += where;

      const sortColumnMap = {
        schedule_code: 'ws.SCHEDULE_CODE',
        schedule_name_en: 'ws.SCHEDULE_NAME_EN',
        effective_start_date: 'ws.EFFECTIVE_START_DATE',
        status: 'ws.STATUS',
        created_at: 'ws.CREATION_DATE'
      };
      const sortCol = sortColumnMap[filters.sortBy] || 'ws.SCHEDULE_CODE';
      const sortOrder = (filters.sortOrder && String(filters.sortOrder).toUpperCase() === 'DESC') ? 'DESC' : 'ASC';
      dataSql += ` ORDER BY ${sortCol} ${sortOrder}`;

      let total = 0;
      const dataBinds = [...binds];
      if (pagination?.page && pagination?.pageSize) {
        const offset = (pagination.page - 1) * pagination.pageSize;
        dataSql += ` OFFSET :${p} ROWS FETCH NEXT :${p + 1} ROWS ONLY`;
        dataBinds.push(offset, pagination.pageSize);
      }

      if (includeLines && pagination?.page && pagination?.pageSize) {
        // Single-query path: fetch schedules + lines in one round-trip (faster)
        const offset = (pagination.page - 1) * pagination.pageSize;
        const sortCol = sortColumnMap[filters.sortBy] || 'ws.SCHEDULE_CODE';
        const sortOrder = (filters.sortOrder && String(filters.sortOrder).toUpperCase() === 'DESC') ? 'DESC' : 'ASC';
        const combinedBinds = [...binds, offset, pagination.pageSize];
        const combinedSql = `
          WITH PAGED AS (
            SELECT
              ws.WORK_SCHEDULE_ID, ws.TENANT_ID, ws.SCHEDULE_CODE, ws.SCHEDULE_NAME_EN, ws.SCHEDULE_NAME_AR,
              ws.WORK_PATTERN_ID, wp.PATTERN_NAME_EN, wp.PATTERN_NAME_AR,
              ws.EFFECTIVE_START_DATE, ws.EFFECTIVE_END_DATE, ws.ASSIGNMENT_MODE, ws.STATUS,
              ws.TIME_ZONE, ws.CREATION_DATE, ws.CREATED_BY, ws.LAST_UPDATE_DATE, ws.LAST_UPDATED_BY,
              COUNT(*) OVER() AS total
            FROM ${this.TABLE_NAME} ws
            LEFT JOIN ${this.PATTERNS_TABLE_NAME} wp ON ws.WORK_PATTERN_ID = wp.WORK_PATTERN_ID AND ws.TENANT_ID = wp.TENANT_ID
            ${where}
            ORDER BY ${sortCol} ${sortOrder}
            OFFSET :${binds.length + 1} ROWS FETCH NEXT :${binds.length + 2} ROWS ONLY
          )
          SELECT
            p.*,
            wpd.DAY_OF_WEEK AS WSL_DAY_OF_WEEK,
            wpd.DAY_TYPE AS WSL_DAY_TYPE,
            wsl.SHIFT_ID AS WSL_SHIFT_ID,
            s.SHIFT_CODE AS S_SHIFT_CODE, s.SHIFT_NAME_EN AS S_SHIFT_NAME_EN, s.SHIFT_NAME_AR AS S_SHIFT_NAME_AR,
            s.START_MINUTES AS S_START_MINUTES, s.END_MINUTES AS S_END_MINUTES,
            s.DURATION_HOURS AS S_DURATION_HOURS, s.BREAK_HOURS AS S_BREAK_HOURS,
            (s.DURATION_HOURS - NVL(s.BREAK_HOURS, 0)) AS S_PAID_HOURS,
            s.SHIFT_TYPE AS S_SHIFT_TYPE, s.COLOR_HEX AS S_COLOR_HEX, s.STATUS AS S_SHIFT_STATUS
          FROM PAGED p
          LEFT JOIN ${this.PATTERN_DAYS_TABLE_NAME} wpd
            ON wpd.WORK_PATTERN_ID = p.WORK_PATTERN_ID AND wpd.TENANT_ID = p.TENANT_ID
          LEFT JOIN ${this.LINES_TABLE_NAME} wsl
            ON wsl.WORK_SCHEDULE_ID = p.WORK_SCHEDULE_ID AND wsl.DAY_OF_WEEK = wpd.DAY_OF_WEEK
          LEFT JOIN ${this.SHIFTS_TABLE_NAME} s ON wsl.SHIFT_ID = s.SHIFT_ID
          ORDER BY p.WORK_SCHEDULE_ID, wpd.DAY_OF_WEEK`;
        const combinedRes = await db.executeQuery(combinedSql, combinedBinds);
        const rows = combinedRes.rows || [];
        const scheduleMap = {};
        for (const r of rows) {
          const sid = r.WORK_SCHEDULE_ID;
          if (!scheduleMap[sid]) {
            const h = {
              WORK_SCHEDULE_ID: r.WORK_SCHEDULE_ID, TENANT_ID: r.TENANT_ID, SCHEDULE_CODE: r.SCHEDULE_CODE,
              SCHEDULE_NAME_EN: r.SCHEDULE_NAME_EN, SCHEDULE_NAME_AR: r.SCHEDULE_NAME_AR,
              WORK_PATTERN_ID: r.WORK_PATTERN_ID, PATTERN_NAME_EN: r.PATTERN_NAME_EN, PATTERN_NAME_AR: r.PATTERN_NAME_AR,
              EFFECTIVE_START_DATE: r.EFFECTIVE_START_DATE, EFFECTIVE_END_DATE: r.EFFECTIVE_END_DATE,
              ASSIGNMENT_MODE: r.ASSIGNMENT_MODE, STATUS: r.STATUS, TIME_ZONE: r.TIME_ZONE,
              CREATION_DATE: r.CREATION_DATE, CREATED_BY: r.CREATED_BY, LAST_UPDATE_DATE: r.LAST_UPDATE_DATE, LAST_UPDATED_BY: r.LAST_UPDATED_BY,
              total: r.total
            };
            scheduleMap[sid] = { ...h, weekly_lines: [] };
          }
          if (r.WSL_DAY_OF_WEEK != null) {
            const dayType = this.normalizeDayType(r.WSL_DAY_TYPE);
            scheduleMap[sid].weekly_lines.push({
              work_schedule_id: sid,
              day_of_week: r.WSL_DAY_OF_WEEK,
              day_type: dayType,
              shift: (dayType === 'REST' || dayType === 'OFF') ? null : {
                shift_id: r.WSL_SHIFT_ID ?? null,
                shift_code: r.S_SHIFT_CODE ?? null,
                shift_name_en: r.S_SHIFT_NAME_EN ?? null,
                shift_name_ar: r.S_SHIFT_NAME_AR ?? null,
                start_minutes: r.S_START_MINUTES ?? null,
                end_minutes: r.S_END_MINUTES ?? null,
                duration_hours: r.S_DURATION_HOURS ?? null,
                break_hours: r.S_BREAK_HOURS ?? null,
                paid_hours: r.S_PAID_HOURS ?? null,
                shift_type: r.S_SHIFT_TYPE ?? null,
                color_hex: r.S_COLOR_HEX ?? null,
                status: r.S_SHIFT_STATUS ?? null
              }
            });
          }
        }
        const schedulesRaw = Object.values(scheduleMap);
        total = schedulesRaw.length > 0 ? Number(schedulesRaw[0].total) || 0 : 0;
        if (schedulesRaw.length === 0) {
          const countRes = await db.executeQuery(`SELECT COUNT(*) AS total FROM ${this.TABLE_NAME} ws${where}`, binds);
          total = countRes.rows?.[0]?.TOTAL ?? countRes.rows?.[0]?.total ?? 0;
        }
        const schedules = this.convertKeysToSnakeCase(schedulesRaw);
        schedules.forEach(s => { delete s.total; });
        return { workSchedules: schedules, total };
      }

      const res = await db.executeQuery(dataSql, dataBinds);
      const schedules = this.convertKeysToSnakeCase(res.rows || []);

      if (pagination?.page && pagination?.pageSize) {
        if (schedules.length > 0) {
          total = Number(schedules[0].total) || 0;
          schedules.forEach(s => delete s.total);
        } else {
          const countSql = `SELECT COUNT(*) AS total FROM ${this.TABLE_NAME} ws${where}`;
          const countRes = await db.executeQuery(countSql, binds);
          total = countRes.rows?.[0]?.TOTAL ?? countRes.rows?.[0]?.total ?? 0;
        }
      }

      if (includeLines && schedules.length > 0) {
        const ids = schedules.map(x => x.work_schedule_id);
        const linesMap = await this.getLinesForSchedules(ids);
        schedules.forEach(x => { x.weekly_lines = linesMap[x.work_schedule_id] || []; });
      } else {
        schedules.forEach(x => { x.weekly_lines = x.weekly_lines || []; });
      }

      return pagination?.page && pagination?.pageSize
        ? { workSchedules: schedules, total }
        : { workSchedules: schedules, total: schedules.length };
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
      ws.WORK_SCHEDULE_ID,
      wpd.DAY_OF_WEEK,
      wpd.DAY_TYPE,
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
    FROM ${this.TABLE_NAME} ws
    LEFT JOIN ${this.PATTERN_DAYS_TABLE_NAME} wpd
      ON wpd.WORK_PATTERN_ID = ws.WORK_PATTERN_ID AND wpd.TENANT_ID = ws.TENANT_ID
    LEFT JOIN ${this.LINES_TABLE_NAME} wsl
      ON wsl.WORK_SCHEDULE_ID = ws.WORK_SCHEDULE_ID AND wsl.DAY_OF_WEEK = wpd.DAY_OF_WEEK
    LEFT JOIN ${this.SHIFTS_TABLE_NAME} s ON wsl.SHIFT_ID = s.SHIFT_ID
    WHERE ws.WORK_SCHEDULE_ID IN (${placeholders})
    ORDER BY ws.WORK_SCHEDULE_ID, wpd.DAY_OF_WEEK`;

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
        shift: (dayType === 'REST' || dayType === 'OFF')
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

  /**
   * Fetch full work schedule (header + weekly_lines) using existing connection.
   * Use from create/update to avoid an extra round-trip.
   */
  static async findByIdWithConnection(connection, workScheduleId, tenantId) {
    const headerSql = `SELECT
        ws.WORK_SCHEDULE_ID, ws.TENANT_ID, ws.SCHEDULE_CODE, ws.SCHEDULE_NAME_EN, ws.SCHEDULE_NAME_AR,
        ws.WORK_PATTERN_ID, wp.PATTERN_NAME_EN, wp.PATTERN_NAME_AR,
        ws.EFFECTIVE_START_DATE, ws.EFFECTIVE_END_DATE, ws.ASSIGNMENT_MODE, ws.STATUS,
        ws.TIME_ZONE,
        ws.CREATION_DATE, ws.CREATED_BY, ws.LAST_UPDATE_DATE, ws.LAST_UPDATED_BY
      FROM ${this.TABLE_NAME} ws
      LEFT JOIN ${this.PATTERNS_TABLE_NAME} wp ON ws.WORK_PATTERN_ID = wp.WORK_PATTERN_ID AND ws.TENANT_ID = wp.TENANT_ID
      WHERE ws.WORK_SCHEDULE_ID = :1 AND ws.TENANT_ID = :2`;

    const linesSql = `SELECT
        wpd.DAY_OF_WEEK,
        wpd.DAY_TYPE,
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
      FROM ${this.TABLE_NAME} ws
      LEFT JOIN ${this.PATTERN_DAYS_TABLE_NAME} wpd
        ON wpd.WORK_PATTERN_ID = ws.WORK_PATTERN_ID AND wpd.TENANT_ID = ws.TENANT_ID
      LEFT JOIN ${this.LINES_TABLE_NAME} wsl
        ON wsl.WORK_SCHEDULE_ID = ws.WORK_SCHEDULE_ID AND wsl.DAY_OF_WEEK = wpd.DAY_OF_WEEK
      LEFT JOIN ${this.SHIFTS_TABLE_NAME} s ON wsl.SHIFT_ID = s.SHIFT_ID
      WHERE ws.WORK_SCHEDULE_ID = :1
      ORDER BY wpd.DAY_OF_WEEK`;

    const [headerRes, linesRes] = await Promise.all([
      connection.execute(headerSql, [workScheduleId, tenantId], { outFormat: oracledb.OUT_FORMAT_OBJECT }),
      connection.execute(linesSql, [workScheduleId], { outFormat: oracledb.OUT_FORMAT_OBJECT })
    ]);

    if (!headerRes.rows?.length) return null;

    const schedule = this.convertKeysToSnakeCase(headerRes.rows[0]);
    schedule.weekly_lines = (linesRes.rows || []).map(r => {
      const converted = this.convertKeysToSnakeCase(r);
      const dayType = this.normalizeDayType(converted.day_type);
      return {
        work_schedule_id: workScheduleId,
        day_of_week: converted.day_of_week,
        day_type: dayType,
        shift: (dayType === 'REST' || dayType === 'OFF')
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
    return schedule;
  }

  /* =========================
   * Find By Id
   * ========================= */

  static async findById(workScheduleId, tenantId) {
    try {
      if (!tenantId) throw new ValidationError('tenant_id is required');

      const headerSql = `SELECT
        ws.WORK_SCHEDULE_ID, ws.TENANT_ID, ws.SCHEDULE_CODE, ws.SCHEDULE_NAME_EN, ws.SCHEDULE_NAME_AR,
        ws.WORK_PATTERN_ID, wp.PATTERN_NAME_EN, wp.PATTERN_NAME_AR,
        ws.EFFECTIVE_START_DATE, ws.EFFECTIVE_END_DATE, ws.ASSIGNMENT_MODE, ws.STATUS,
        ws.TIME_ZONE,
        ws.CREATION_DATE, ws.CREATED_BY, ws.LAST_UPDATE_DATE, ws.LAST_UPDATED_BY
      FROM ${this.TABLE_NAME} ws
      LEFT JOIN ${this.PATTERNS_TABLE_NAME} wp ON ws.WORK_PATTERN_ID = wp.WORK_PATTERN_ID AND ws.TENANT_ID = wp.TENANT_ID
      WHERE ws.WORK_SCHEDULE_ID = :1 AND ws.TENANT_ID = :2`;

      const linesSql = `SELECT
        wpd.DAY_OF_WEEK,
        wpd.DAY_TYPE,
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
      FROM ${this.TABLE_NAME} ws
      LEFT JOIN ${this.PATTERN_DAYS_TABLE_NAME} wpd
        ON wpd.WORK_PATTERN_ID = ws.WORK_PATTERN_ID AND wpd.TENANT_ID = ws.TENANT_ID
      LEFT JOIN ${this.LINES_TABLE_NAME} wsl
        ON wsl.WORK_SCHEDULE_ID = ws.WORK_SCHEDULE_ID AND wsl.DAY_OF_WEEK = wpd.DAY_OF_WEEK
      LEFT JOIN ${this.SHIFTS_TABLE_NAME} s ON wsl.SHIFT_ID = s.SHIFT_ID
      WHERE ws.WORK_SCHEDULE_ID = :1
      ORDER BY wpd.DAY_OF_WEEK`;

      const [headerRes, linesRes] = await Promise.all([
        db.executeQuery(headerSql, [workScheduleId, tenantId]),
        db.executeQuery(linesSql, [workScheduleId])
      ]);

      if (!headerRes.rows?.length) return null;

      const schedule = this.convertKeysToSnakeCase(headerRes.rows[0]);

      schedule.weekly_lines = (linesRes.rows || []).map(r => {
        const converted = this.convertKeysToSnakeCase(r);
        const dayType = this.normalizeDayType(converted.day_type);

        return {
          work_schedule_id: workScheduleId,
          day_of_week: converted.day_of_week,
          day_type: dayType,
          shift: (dayType === 'REST' || dayType === 'OFF')
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
        const actor = toAuditActorId(userId);

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

        // TIME_ZONE: omit = preserve; explicit null = clear; empty string rejected by validation.
        if (data.TIME_ZONE !== undefined) {
          const tz =
            data.TIME_ZONE === null
              ? null
              : await this.assertValidTimeZone(data.TIME_ZONE);
          updateFields.push(`TIME_ZONE = :${p}`);
          bindParams.push(tz);
          p++;
        }

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

        // Replace weekly lines if provided (WORK days only; REST/OFF from pattern)
        if (data.WEEKLY_LINES !== undefined && Array.isArray(data.WEEKLY_LINES)) {
          await connection.execute(
            `DELETE FROM ${this.LINES_TABLE_NAME}
             WHERE WORK_SCHEDULE_ID = :1`,
            [workScheduleId],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );

          await this.insertWeeklyLines(connection, workScheduleId, data.WEEKLY_LINES, actor, now, tenantId);
        }

        if (updateFields.length === 0 && (data.WEEKLY_LINES === undefined || !Array.isArray(data.WEEKLY_LINES))) {
          throw new ValidationError('No fields to update');
        }

        return await this.findByIdWithConnection(connection, workScheduleId, tenantId);
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
        const actor = toAuditActorId(userId);

        await connection.execute(
          `DELETE FROM ${this.LINES_TABLE_NAME}
           WHERE WORK_SCHEDULE_ID = :1`,
          [workScheduleId],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        await this.insertWeeklyLines(connection, workScheduleId, weeklyLines, actor, now, tenantId);

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

  /**
   * Soft delete (set STATUS = INACTIVE). Returns the updated schedule in one round-trip.
   */
  static async softDelete(workScheduleId, tenantId, userId) {
    try {
      if (!tenantId) throw new ValidationError('tenant_id is required');

      return await this.executeWithTransaction(async (connection) => {
        await this.disableParallelDml(connection);

        const r = await connection.execute(
          `UPDATE ${this.TABLE_NAME}
           SET STATUS = 'INACTIVE',
               LAST_UPDATED_BY = :1,
               LAST_UPDATE_DATE = :2
           WHERE WORK_SCHEDULE_ID = :3 AND TENANT_ID = :4`,
          [toAuditActorId(userId), new Date(), workScheduleId, tenantId],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const rows = r.rowsAffected || r.rowCount || 0;
        if (rows === 0) {
          throw new NotFoundError(`No work schedule found with ID: ${workScheduleId} for tenant: ${tenantId}`);
        }

        return await this.findByIdWithConnection(connection, workScheduleId, tenantId);
      });
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
