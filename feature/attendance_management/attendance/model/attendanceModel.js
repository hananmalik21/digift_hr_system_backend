import db from '../../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError, ForbiddenError } from '../../../../utils/errors/index.js';
import { ALLOWED_SOURCE_TYPES, DEFAULT_SOURCE_TYPE, ALLOWED_LOG_TYPES } from '../config.js';

/**
 * Attendance Model
 * Calls TM.TM_MARK_ATTENDANCE_PKG.UPSERT_MARK_ATTENDANCE for create/update.
 */
class AttendanceModel {
  static SCHEMA = 'TM';

  /**
   * Convert row keys from UPPER_CASE to snake_case (single level).
   */
  static convertRowToSnakeCase(row) {
    if (row === null || row === undefined) return row;
    const converted = {};
    for (const [key, value] of Object.entries(row)) {
      const newKey = key.toLowerCase();
      if (value instanceof Buffer) {
        converted[newKey] = value.toString('hex').toUpperCase();
      } else {
        converted[newKey] = value;
      }
    }
    return converted;
  }

  static normalizeYn(value, defaultVal = 'N') {
    if (value == null || String(value).trim() === '') return defaultVal;
    return String(value).trim().toUpperCase().slice(0, 1) === 'Y' ? 'Y' : 'N';
  }

  /**
   * Parse value to Date for Oracle DATE. Truncate time if dateOnly.
   */
  static parseDateForOracle(value, dateOnly = false) {
    if (value == null || value === '') return null;
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return null;
      if (dateOnly) {
        const d = new Date(value);
        d.setHours(0, 0, 0, 0);
        return d;
      }
      return value;
    }
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    if (dateOnly) {
      d.setHours(0, 0, 0, 0);
      return d;
    }
    return d;
  }

  /**
   * Load employee_id and enterprise_id from TM.TM_ATTENDANCE_DAYS for a given attendance_day_id.
   * Returns { EMPLOYEE_ID, ENTERPRISE_ID } or null if not found.
   */
  static async getAttendanceDayEmployee(attendanceDayId) {
    let connection;
    try {
      connection = await db.getConnection();
      const result = await connection.execute(
        `SELECT EMPLOYEE_ID, ENTERPRISE_ID
           FROM TM.TM_ATTENDANCE_DAYS
          WHERE ATTENDANCE_DAY_ID = :id`,
        { id: Number(attendanceDayId) },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      return result.rows?.[0] || null;
    } catch (error) {
      throw new DatabaseError('Failed to load attendance day.', error);
    } finally {
      if (connection) await connection.close().catch(() => {});
    }
  }

  /**
   * Ensure employee_id + enterprise_id exists. Throws if not found.
   */
  static async validateEmployeeExists(connection, enterpriseId, employeeId) {
    const query = `
      SELECT 1 FROM EMPL.EMPLOYEES
      WHERE ENTERPRISE_ID = :enterprise_id AND EMPLOYEE_ID = :employee_id
    `;
    const result = await connection.execute(
      query,
      { enterprise_id: enterpriseId, employee_id: employeeId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if (!result.rows || result.rows.length === 0) {
      throw new DatabaseError('Invalid employee/enterprise reference.', null, 'Invalid employee/enterprise reference.');
    }
  }

  /** Optional number from payload or null */
  static optNum(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  /** Optional string from payload or null */
  static optStr(v) {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
  }

  /** Convert OUT bind value to number or hex string (for RAW/Buffer); strings passed through. */
  static outVal(bind) {
    if (!bind || typeof bind !== 'object') return null;
    const v = bind.val;
    if (v === undefined || v === null) return null;
    if (Buffer.isBuffer(v)) return v.toString('hex').toUpperCase();
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') return v.trim() || null;
    return v;
  }

  /**
   * Build binds for TM.TM_MARK_ATTENDANCE_PKG.UPSERT_MARK_ATTENDANCE.
   * Procedure has only IN params and OUT params (no p_attendance_day_id / p_schedule_id).
   * p_audit_user for audit; OUT o_* for generated ids/guids.
   */
  static buildUpsertBinds(payload) {
    const sourceType = this.optStr(payload.source_type) != null
      ? String(payload.source_type).trim().toUpperCase()
      : DEFAULT_SOURCE_TYPE;

    const hasCheckIn = payload.check_in_time != null && payload.check_in_time !== '';
    const hasCheckOut = payload.check_out_time != null && payload.check_out_time !== '';
    const locationName = this.optStr(payload.location || payload.location_name);
    let logType = this.optStr(payload.log_type) != null ? String(payload.log_type).trim().toUpperCase() : null;
    if (!logType && locationName) {
      if (hasCheckIn && hasCheckOut) logType = 'CHECK_IN';
      else if (hasCheckIn) logType = 'CHECK_IN';
      else if (hasCheckOut) logType = 'CHECK_OUT';
    }

    const hasScheduleData = payload.work_schedule_id != null || payload.schedule_date != null || payload.schedule_start_time != null ||
      payload.schedule_end_time != null || payload.scheduled_minutes != null || payload.scheduled_hours != null;
    const segmentNo = this.optNum(payload.segment_no) ?? (hasScheduleData ? 1 : null);

    return {
      binds: {
        p_enterprise_id: payload.enterprise_id,
        p_employee_id: payload.employee_id,
        p_attendance_date: this.parseDateForOracle(payload.attendance_date, true),
        p_attendance_status: this.optStr(payload.attendance_status),
        p_source_type: sourceType,
        p_is_working_day: this.optStr(payload.is_working_day) != null ? this.normalizeYn(payload.is_working_day) : null,
        p_is_active_day: this.optStr(payload.is_active_day) != null ? this.normalizeYn(payload.is_active_day) : null,
        p_work_schedule_id: this.optNum(payload.work_schedule_id),
        p_schedule_date: this.parseDateForOracle(payload.schedule_date ?? payload.attendance_date, true),
        p_schedule_start_time: this.parseDateForOracle(payload.schedule_start_time, false),
        p_schedule_end_time: this.parseDateForOracle(payload.schedule_end_time, false),
        p_scheduled_minutes: this.optNum(payload.scheduled_minutes),
        p_scheduled_hours: this.optNum(payload.scheduled_hours),
        p_grace_in_minutes: this.optNum(payload.grace_in_minutes),
        p_grace_out_minutes: this.optNum(payload.grace_out_minutes),
        p_break_minutes: this.optNum(payload.break_minutes),
        p_segment_no: segmentNo,
        p_schedule_source: this.optStr(payload.schedule_source),
        p_tz_region: this.optStr(payload.tz_region),
        p_is_published: this.optStr(payload.is_published) != null ? this.normalizeYn(payload.is_published) : null,
        p_schedule_is_active: this.optStr(payload.schedule_is_active) != null ? this.normalizeYn(payload.schedule_is_active) : null,
        p_check_in_time: this.parseDateForOracle(payload.check_in_time, false),
        p_check_out_time: this.parseDateForOracle(payload.check_out_time, false),
        p_hours_worked: this.optNum(payload.hours_worked),
        p_overtime_hours: this.optNum(payload.overtime_hours),
        p_ot_config_id: this.optNum(payload.ot_config_id),
        p_ot_rate_type_id: this.optNum(payload.ot_rate_type_id),
        p_log_type: logType,
        p_location_name: locationName,
        p_latitude: this.optNum(payload.latitude),
        p_longitude: this.optNum(payload.longitude),
        p_captured_at: this.parseDateForOracle(payload.captured_at, false),
        p_note_text: this.optStr(payload.note_text),
        p_audit_user: this.optStr(payload.audit_user ?? payload.user) || 'API',
        o_attendance_day_id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
        o_attendance_day_guid: { type: oracledb.BUFFER, dir: oracledb.BIND_OUT, maxSize: 32 },
        o_schedule_id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
        o_schedule_guid: { type: oracledb.BUFFER, dir: oracledb.BIND_OUT, maxSize: 32 },
        o_attendance_actual_id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
        o_attendance_actual_guid: { type: oracledb.BUFFER, dir: oracledb.BIND_OUT, maxSize: 32 },
        o_location_id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
        o_location_guid: { type: oracledb.BUFFER, dir: oracledb.BIND_OUT, maxSize: 32 },
        o_note_id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
        o_note_guid: { type: oracledb.BUFFER, dir: oracledb.BIND_OUT, maxSize: 32 }
      }
    };
  }

  /**
   * Call TM.TM_MARK_ATTENDANCE_PKG.UPSERT_MARK_ATTENDANCE. All IDs are DB-generated (do not pass from client).
   * Returns OUT ids/guids and echoed enterprise_id, employee_id, attendance_date.
   */
  static async upsertMarkAttendance(payload, options = {}) {
    const { includeRefreshed = true } = options;
    let connection;

    try {
      connection = await db.getConnection();
      await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = ${this.SCHEMA}`, [], { autoCommit: false });

      await this.validateEmployeeExists(connection, payload.enterprise_id, payload.employee_id);

      const { binds } = this.buildUpsertBinds(payload);

      const plsqlBlock = `
        BEGIN
          TM.TM_MARK_ATTENDANCE_PKG.UPSERT_MARK_ATTENDANCE(
            p_enterprise_id           => :p_enterprise_id,
            p_employee_id             => :p_employee_id,
            p_attendance_date         => :p_attendance_date,
            p_attendance_status       => :p_attendance_status,
            p_source_type             => :p_source_type,
            p_is_working_day          => :p_is_working_day,
            p_is_active_day           => :p_is_active_day,
            p_work_schedule_id        => :p_work_schedule_id,
            p_schedule_date           => :p_schedule_date,
            p_schedule_start_time     => :p_schedule_start_time,
            p_schedule_end_time       => :p_schedule_end_time,
            p_scheduled_minutes       => :p_scheduled_minutes,
            p_scheduled_hours         => :p_scheduled_hours,
            p_grace_in_minutes         => :p_grace_in_minutes,
            p_grace_out_minutes        => :p_grace_out_minutes,
            p_break_minutes            => :p_break_minutes,
            p_segment_no               => :p_segment_no,
            p_schedule_source         => :p_schedule_source,
            p_tz_region               => :p_tz_region,
            p_is_published            => :p_is_published,
            p_schedule_is_active      => :p_schedule_is_active,
            p_check_in_time           => :p_check_in_time,
            p_check_out_time          => :p_check_out_time,
            p_hours_worked            => :p_hours_worked,
            p_overtime_hours          => :p_overtime_hours,
            p_ot_config_id            => :p_ot_config_id,
            p_ot_rate_type_id         => :p_ot_rate_type_id,
            p_log_type                => :p_log_type,
            p_location_name           => :p_location_name,
            p_latitude                => :p_latitude,
            p_longitude               => :p_longitude,
        p_captured_at             => :p_captured_at,
        p_note_text               => :p_note_text,
        p_audit_user              => :p_audit_user,
        o_attendance_day_id       => :o_attendance_day_id,
            o_attendance_day_guid     => :o_attendance_day_guid,
            o_schedule_id             => :o_schedule_id,
            o_schedule_guid           => :o_schedule_guid,
            o_attendance_actual_id    => :o_attendance_actual_id,
            o_attendance_actual_guid  => :o_attendance_actual_guid,
            o_location_id             => :o_location_id,
            o_location_guid           => :o_location_guid,
            o_note_id                 => :o_note_id,
            o_note_guid               => :o_note_guid
          );
        END;
      `;

      await connection.execute(plsqlBlock, binds, { autoCommit: false });
      await connection.commit();

      const attendanceDayId = this.outVal(binds.o_attendance_day_id);

      const result = {
        attendance_day_id: attendanceDayId,
        attendance_day_guid: this.outVal(binds.o_attendance_day_guid),
        schedule_id: this.outVal(binds.o_schedule_id),
        schedule_guid: this.outVal(binds.o_schedule_guid),
        attendance_actual_id: this.outVal(binds.o_attendance_actual_id),
        attendance_actual_guid: this.outVal(binds.o_attendance_actual_guid),
        location_id: this.outVal(binds.o_location_id),
        location_guid: this.outVal(binds.o_location_guid),
        note_id: this.outVal(binds.o_note_id),
        note_guid: this.outVal(binds.o_note_guid),
        enterprise_id: payload.enterprise_id,
        employee_id: payload.employee_id,
        attendance_date: payload.attendance_date
      };
      if (includeRefreshed && attendanceDayId != null) {
        const refreshed = await this.fetchAttendanceByDayId(connection, attendanceDayId);
        if (refreshed) {
          result.attendance = refreshed;
        }
      }

      return result;
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (_) {}
      }
      if (error instanceof DatabaseError) throw error;
      if (error.errorNum === 2291 || error.message?.includes('ORA-02291')) {
        throw new DatabaseError('Invalid employee/enterprise reference.', error, 'Invalid employee/enterprise reference.');
      }
      if (error.errorNum === 2290 || error.message?.includes('ORA-02290') || error.errorNum === 20090 || error.message?.includes('ORA-20090')) {
        const msg = error.message || '';
        throw new DatabaseError(
          msg.includes('constraint') ? msg : 'The provided data violates a validation rule. Please check your input.',
          error
        );
      }
      if (error.errorNum === 1400 || error.message?.includes('ORA-01400')) {
        const colMatch = (error.message || '').match(/\."([^"]+)"\s*\)/) || (error.message || '').match(/"([^"]+)"\s*\)\s*$/);
        const col = colMatch ? colMatch[1] : null;
        throw new DatabaseError(
          col ? `Required value missing (NULL not allowed for column: ${col}). Commonly schedule_id or log_type when saving location.` : 'Required fields are missing. Please provide all required information.',
          error
        );
      }
      throw new DatabaseError('Failed to save attendance.', error);
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (_) {}
      }
    }
  }

  /**
   * Parse date for Oracle DATE (YYYY-MM-DD); returns Date or null.
   */
  static parseDateOnly(value) {
    if (value == null || value === '') return null;
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /** Strip ORA stack trace and Help URL from error message for user-facing text. */
  static stripOracleMessage(msg) {
    if (typeof msg !== 'string' || !msg) return '';
    let out = msg.split(/\nORA-\d{5}:/)[0].trim();
    return out.replace(/Help:\s*https?:\/\/[^\n]*/gi, '').trim();
  }

  /**
   * Map Oracle errors for ADD_PUNCH to user message. Returns null for generic handling.
   */
  static mapAddPunchError(err) {
    if (!err || typeof err.message !== 'string') return null;
    const msg = (err.message || '').trim();
    const upper = msg.toUpperCase();
    if (err.errorNum >= 20000 && err.errorNum <= 20999) {
      const userMsg = this.stripOracleMessage(msg);
      return userMsg || 'Validation or business rule error from attendance system.';
    }
    if (err.errorNum === 2290 || upper.includes('ORA-02290')) {
      return msg.includes('constraint') ? msg : 'Invalid punch_type or value; check constraint violation.';
    }
    if (err.errorNum === 1403 || upper.includes('ORA-01403')) {
      return 'attendance_day_id not found';
    }
    return null;
  }

  /**
   * Call TM.TM_ATTENDANCE_SYSTEM_PKG.ADD_PUNCH.
   * punch_time: ISO-8601 string with offset (e.g. "2026-02-09T09:00:00+05:00"). Passed as string; Oracle converts
   * via TO_TIMESTAMP_TZ so the same value is stored the same in all environments (no Node/Oracle session TZ dependency).
   * Package handles UTC storage, schedule tz_region, early/late, overtime, status. Do not call recompute from Node.
   */
  static async addPunch(payload) {
    let connection;

    try {
      connection = await db.getConnection();
      await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = ${this.SCHEMA}`, [], { autoCommit: false });

      const attendance_day_id = Number(payload.attendance_day_id);
      const punch_type = String(payload.punch_type || '').trim().toUpperCase();
      let punch_time = typeof payload.punch_time === 'string' ? payload.punch_time.trim() : String(payload.punch_time);
      if (punch_time.endsWith('Z')) punch_time = punch_time.slice(0, -1) + '+00:00';
      // Strip milliseconds (e.g. .000 or .123) — Oracle format mask has no FF placeholder.
      punch_time = punch_time.replace(/\.\d+(?=[+-]\d{2}:\d{2}$)/, '');
      const actor = this.optStr(payload.actor) || 'ADMIN';
      const latitude = payload.latitude ?? null;
      const longitude = payload.longitude ?? null;
      const location_name = payload.location_name ?? null;
      const mark_attendance_by_face = payload.mark_attendance_by_face === true || payload.mark_attendance_by_face === 'Y' ? 'Y' : 'N';
      const face_matched = payload.face_matched === true || payload.face_matched === 'Y' ? 'Y' : 'N';

      const plsqlBlock = `
        DECLARE
          v_punch_ts TIMESTAMP WITH TIME ZONE;
        BEGIN
          v_punch_ts := TO_TIMESTAMP_TZ(:punch_time, 'YYYY-MM-DD"T"HH24:MI:SSTZH:TZM');
          TM.TM_ATTENDANCE_SYSTEM_PKG.ADD_PUNCH(
            p_attendance_day_id       => :attendance_day_id,
            p_punch_type              => :punch_type,
            p_punch_time              => v_punch_ts,
            p_actor                   => :actor,
            p_latitude                => :latitude,
            p_longitude               => :longitude,
            p_location_name           => :location_name,
            p_mark_attendance_by_face => :mark_attendance_by_face,
            p_face_matched            => :face_matched
          );
        END;
      `;

      const binds = {
        attendance_day_id,
        punch_type,
        punch_time,
        actor,
        latitude,
        longitude,
        location_name,
        mark_attendance_by_face,
        face_matched
      };

      await connection.execute(plsqlBlock, binds, { autoCommit: false });
      await connection.commit();

      return { attendance_day_id };
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (_) {}
      }
      if (error instanceof DatabaseError || error instanceof ForbiddenError) throw error;
      if (error.errorNum === 20023 || (error.message || '').includes('ORA-20023')) {
        throw new ForbiddenError('Face not matched. Attendance punch blocked.');
      }
      const userMsg = this.mapAddPunchError(error);
      const message = userMsg || (() => {
        const oraCode = (error.message || '').match(/ORA-\d{5}/)?.[0];
        return oraCode ? `Database error (${oraCode}): ${error.message || 'Unknown'}` : 'Failed to add punch.';
      })();
      throw new DatabaseError(message, error, userMsg || message);
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (_) {}
      }
    }
  }

  /**
   * Call TM.TM_ATTENDANCE_HR_PKG.HR_MANUAL_ADD_BOTH_PUNCHES_UTC via PL/SQL block (function does DML; SELECT would raise ORA-14551).
   * Pass check_in_time and check_out_time as ISO 8601 strings (Z or offset); do not convert in Node; DB handles tz_region.
   */
  static async hrManualAddBothPunchesUtc(payload) {
    let connection;

    try {
      connection = await db.getConnection();
      await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = ${this.SCHEMA}`, [], { autoCommit: false });

      const attendance_day_id = Number(payload.attendance_day_id);
      const check_in_time = typeof payload.check_in_time === 'string' ? payload.check_in_time.trim() : String(payload.check_in_time);
      const check_out_time = typeof payload.check_out_time === 'string' ? payload.check_out_time.trim() : String(payload.check_out_time);
      const actor = this.optStr(payload.actor) || 'HR_ADMIN';
      const location_name_in = payload.location_name_in ?? null;
      const latitude_in = payload.latitude_in != null && payload.latitude_in !== '' ? Number(payload.latitude_in) : null;
      const longitude_in = payload.longitude_in != null && payload.longitude_in !== '' ? Number(payload.longitude_in) : null;
      const location_name_out = payload.location_name_out ?? null;
      const latitude_out = payload.latitude_out != null && payload.latitude_out !== '' ? Number(payload.latitude_out) : null;
      const longitude_out = payload.longitude_out != null && payload.longitude_out !== '' ? Number(payload.longitude_out) : null;
      const reason = payload.reason ?? null;

      const plsqlBlock = `
        BEGIN
          :result := tm.tm_attendance_hr_pkg.hr_manual_add_both_punches_utc(
            :attendance_day_id,
            :check_in_time,
            :check_out_time,
            :actor,
            :location_name_in,
            :latitude_in,
            :longitude_in,
            :location_name_out,
            :latitude_out,
            :longitude_out,
            :reason
          );
        END;
      `;

      const binds = {
        attendance_day_id,
        check_in_time,
        check_out_time,
        actor,
        location_name_in,
        latitude_in,
        longitude_in,
        location_name_out,
        latitude_out,
        longitude_out,
        reason,
        result: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      };

      await connection.execute(plsqlBlock, binds, { autoCommit: true });

      const outResult = binds.result?.val ?? binds.result?.value;
      return { attendance_day_id: outResult != null ? outResult : attendance_day_id };
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (_) {}
      }
      if (error instanceof DatabaseError) throw error;
      const userMsg = this.mapAddPunchError(error);
      const message = userMsg || (() => {
        const oraCode = (error.message || '').match(/ORA-\d{5}/)?.[0];
        return oraCode ? `Database error (${oraCode}): ${error.message || 'Unknown'}` : 'Failed to add HR manual punches.';
      })();
      throw new DatabaseError(message, error, userMsg || message);
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (_) {}
      }
    }
  }

  /**
   * After ADD_PUNCH, fetch updated day snapshot in 3 round-trips: day+actuals (1 query), punches, locations (parallel).
   */
  static async fetchDaySnapshotAfterPunch(connection, attendanceDayId) {
    const binds = { attendance_day_id: attendanceDayId };

    const dayAndActualsSql = `
      SELECT d.ATTENDANCE_STATUS, d.IN_STATE, d.OUT_STATE, d.LAST_UPDATE_DATE,
             a.CHECK_IN_TIME, a.CHECK_OUT_TIME, a.HOURS_WORKED, a.OVERTIME_HOURS,
             a.OT_CONFIG_ID, a.OT_RATE_TYPE_ID, a.OT_MULTIPLIER
      FROM TM.TM_ATTENDANCE_DAYS d
      LEFT JOIN TM.TM_ATTENDANCE_ACTUALS a ON a.ATTENDANCE_DAY_ID = d.ATTENDANCE_DAY_ID
      WHERE d.ATTENDANCE_DAY_ID = :attendance_day_id
    `;
    const punchesSql = `
      SELECT PUNCH_ID, PUNCH_TYPE, PUNCH_TIME
      FROM TM.TM_ATTENDANCE_PUNCHES
      WHERE ATTENDANCE_DAY_ID = :attendance_day_id
      ORDER BY PUNCH_TIME DESC
    `;
    const locationsSql = `
      SELECT l.LOG_TYPE, l.LOCATION_NAME, l.LATITUDE, l.LONGITUDE, l.CAPTURED_AT, l.PUNCH_ID
      FROM TM.TM_ATTENDANCE_LOCATIONS l
      JOIN TM.TM_ATTENDANCE_PUNCHES p ON p.PUNCH_ID = l.PUNCH_ID
      WHERE p.ATTENDANCE_DAY_ID = :attendance_day_id
      ORDER BY l.CAPTURED_AT DESC NULLS LAST
    `;

    try {
      const [dayActualsResult, punchesResult, locationsResult] = await Promise.all([
        connection.execute(dayAndActualsSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT }),
        connection.execute(punchesSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT }),
        connection.execute(locationsSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT })
      ]);

      const row = dayActualsResult.rows?.[0];
      const full = row ? this.convertRowToSnakeCase(row) : null;
      const day = full ? {
        attendance_status: full.attendance_status,
        in_state: full.in_state,
        out_state: full.out_state,
        last_update_date: full.last_update_date
      } : null;
      const actuals = full ? {
        check_in_time: full.check_in_time,
        check_out_time: full.check_out_time,
        hours_worked: full.hours_worked,
        overtime_hours: full.overtime_hours,
        ot_config_id: full.ot_config_id,
        ot_rate_type_id: full.ot_rate_type_id,
        ot_multiplier: full.ot_multiplier
      } : null;
      const punches = (punchesResult.rows || []).map(r => this.convertRowToSnakeCase(r));
      const locations = (locationsResult.rows || []).map(r => this.convertRowToSnakeCase(r));

      return { day, actuals, punches, locations };
    } catch (err) {
      console.error('[AttendanceModel.fetchDaySnapshotAfterPunch]', err?.message || err);
      return null;
    }
  }

  /**
   * Call TM.TM_ATTENDANCE_SYSTEM_PKG.RECOMPUTE_DAY. Uses bind variables, commits on success.
   */
  static async recomputeDay(payload) {
    let connection;

    try {
      connection = await db.getConnection();
      await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = ${this.SCHEMA}`, [], { autoCommit: false });

      const attendanceDayId = Number(payload.attendance_day_id);
      const actor = this.optStr(payload.actor) || 'ADMIN';

      const plsqlBlock = `
        BEGIN
          TM.TM_ATTENDANCE_SYSTEM_PKG.RECOMPUTE_DAY(
            p_attendance_day_id => :p_attendance_day_id,
            p_actor             => :p_actor
          );
        END;
      `;

      const binds = {
        p_attendance_day_id: attendanceDayId,
        p_actor: actor
      };

      await connection.execute(plsqlBlock, binds, { autoCommit: false });
      await connection.commit();

      return { attendance_day_id: attendanceDayId };
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (_) {}
      }
      if (error instanceof DatabaseError) throw error;
      const userMsg = this.mapAddPunchError(error);
      const message = userMsg || (() => {
        const oraCode = (error.message || '').match(/ORA-\d{5}/)?.[0];
        return oraCode ? `Database error (${oraCode}): ${error.message || 'Unknown'}` : 'Failed to recompute day.';
      })();
      throw new DatabaseError(message, error, userMsg || message);
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (_) {}
      }
    }
  }

  /**
   * Fetch day + actuals snapshot after RECOMPUTE_DAY (single query).
   */
  static async fetchRecomputeSnapshot(connection, attendanceDayId) {
    const sql = `
      SELECT d.ATTENDANCE_STATUS, d.IN_STATE, d.OUT_STATE, d.ATTENDANCE_DATE,
             a.CHECK_IN_TIME, a.CHECK_OUT_TIME, a.HOURS_WORKED, a.OVERTIME_HOURS,
             a.OT_CONFIG_ID, a.OT_RATE_TYPE_ID, a.OT_MULTIPLIER
      FROM TM.TM_ATTENDANCE_DAYS d
      LEFT JOIN TM.TM_ATTENDANCE_ACTUALS a ON a.ATTENDANCE_DAY_ID = d.ATTENDANCE_DAY_ID
      WHERE d.ATTENDANCE_DAY_ID = :attendance_day_id
    `;
    try {
      const result = await connection.execute(
        sql,
        { attendance_day_id: attendanceDayId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const row = result.rows?.[0];
      if (!row) return null;
      const full = this.convertRowToSnakeCase(row);
      return {
        day: {
          attendance_status: full.attendance_status,
          in_state: full.in_state,
          out_state: full.out_state,
          attendance_date: full.attendance_date
        },
        actuals: {
          check_in_time: full.check_in_time,
          check_out_time: full.check_out_time,
          hours_worked: full.hours_worked,
          overtime_hours: full.overtime_hours,
          ot_config_id: full.ot_config_id,
          ot_rate_type_id: full.ot_rate_type_id,
          ot_multiplier: full.ot_multiplier
        }
      };
    } catch (err) {
      console.error('[AttendanceModel.fetchRecomputeSnapshot]', err?.message || err);
      return null;
    }
  }

  /**
   * Fetch attendance by attendance_day_id from TM views/tables (days, schedules, actuals, locations, notes).
   */
  static async fetchAttendanceByDayId(connection, attendanceDayId) {
    const query = `
      SELECT
        d.ATTENDANCE_DAY_ID,
        d.ENTERPRISE_ID,
        d.EMPLOYEE_ID,
        d.ATTENDANCE_DATE,
        d.ATTENDANCE_STATUS,
        d.IS_WORKING_DAY,
        d.IS_ACTIVE AS IS_ACTIVE_DAY,
        d.SOURCE_TYPE,
        s.SCHEDULE_ID,
        s.WORK_SCHEDULE_ID,
        s.SCHEDULE_DATE,
        s.SCHEDULE_START_TIME,
        s.SCHEDULE_END_TIME,
        s.SCHEDULED_MINUTES,
        s.SCHEDULED_HOURS,
        s.GRACE_IN_MINUTES,
        s.GRACE_OUT_MINUTES,
        s.BREAK_MINUTES,
        s.SEGMENT_NO,
        s.SCHEDULE_SOURCE,
        s.TZ_REGION,
        s.IS_PUBLISHED,
        s.IS_ACTIVE AS SCHEDULE_IS_ACTIVE,
        a.CHECK_IN_TIME,
        a.CHECK_OUT_TIME,
        a.HOURS_WORKED,
        a.OVERTIME_HOURS,
        a.OT_CONFIG_ID,
        a.OT_RATE_TYPE_ID,
        n.NOTE_TEXT,
        l_in.LOCATION_NAME AS CHECK_IN_LOCATION_NAME,
        l_out.LOCATION_NAME AS CHECK_OUT_LOCATION_NAME
      FROM TM.TM_ATTENDANCE_DAYS d
      LEFT JOIN TM.TM_ATTENDANCE_SCHEDULES s
        ON s.ATTENDANCE_DAY_ID = d.ATTENDANCE_DAY_ID
      LEFT JOIN TM.TM_ATTENDANCE_ACTUALS a
        ON a.ATTENDANCE_DAY_ID = d.ATTENDANCE_DAY_ID
      LEFT JOIN TM.TM_ATTENDANCE_NOTES n
        ON n.ATTENDANCE_DAY_ID = d.ATTENDANCE_DAY_ID
      LEFT JOIN TM.TM_ATTENDANCE_LOCATIONS l_in
        ON l_in.ATTENDANCE_DAY_ID = d.ATTENDANCE_DAY_ID
       AND l_in.LOG_TYPE = 'CHECK_IN'
      LEFT JOIN TM.TM_ATTENDANCE_LOCATIONS l_out
        ON l_out.ATTENDANCE_DAY_ID = d.ATTENDANCE_DAY_ID
       AND l_out.LOG_TYPE = 'CHECK_OUT'
      WHERE d.ATTENDANCE_DAY_ID = :attendance_day_id
    `;
    const result = await connection.execute(
      query,
      { attendance_day_id: attendanceDayId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const rows = result.rows || [];
    if (rows.length === 0) return null;

    return this.convertRowToSnakeCase(rows[0]);
  }
}

export default AttendanceModel;
