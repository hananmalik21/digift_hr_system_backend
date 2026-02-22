import db from '../../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError } from '../../../../utils/errors/index.js';
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

  /**
   * Get attendance logs from TM.V_ATTENDANCE_FULL with filters and pagination.
   * Optional filters: employee_number, employee_id, attendance_status, from_date, to_date, org_unit_hex (single).
   * Org filter (node + all children): when org_unit_hex is provided, rows where org_structure_list contains that org_unit_id (hex string comparison).
   */
  static async getAttendanceLogs(filters) {
    const page = Math.max(1, parseInt(filters.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(filters.pageSize, 10) || 20));
    const offset = (page - 1) * pageSize;

    const orgUnitHex = filters.org_unit_hex != null && String(filters.org_unit_hex).trim() !== ''
      ? String(filters.org_unit_hex).trim()
      : null;

    const bindsCount = {
      enterprise_id: filters.enterprise_id,
      employee_number: filters.employee_number != null && String(filters.employee_number).trim() !== '' ? String(filters.employee_number).trim() : null,
      p_employee_id: filters.employee_id != null && filters.employee_id !== '' ? Number(filters.employee_id) : null,
      attendance_status: filters.attendance_status != null && String(filters.attendance_status).trim() !== '' ? String(filters.attendance_status).trim() : null,
      from_date: this.parseDateOnly(filters.from_date),
      to_date: this.parseDateOnly(filters.to_date)
    };
    if (orgUnitHex !== null) {
      bindsCount.org_unit_hex = orgUnitHex;
    }

    const orgClause = orgUnitHex === null
      ? ''
      : ` AND JSON_EXISTS(ORG_STRUCTURE_LIST, '$[*]?(@.org_unit_id == $ou)' PASSING :org_unit_hex AS "ou")`;

    const whereClause = `
      ENTERPRISE_ID = :enterprise_id
      AND (:employee_number IS NULL OR EMPLOYEE_NUMBER = :employee_number)
      AND (:p_employee_id IS NULL OR EMPLOYEE_ID = :p_employee_id)
      AND (:attendance_status IS NULL OR ATTENDANCE_STATUS = :attendance_status)
      AND (:from_date IS NULL OR ATTENDANCE_DATE >= :from_date)
      AND (:to_date IS NULL OR ATTENDANCE_DATE <= :to_date)
      ${orgClause}
    `.trim().replace(/\s+/g, ' ');

    const bindsData = {
      ...bindsCount,
      row_offset: offset,
      pageSize
    };

    const countSql = `SELECT COUNT(*) AS CNT FROM TM.V_ATTENDANCE_FULL WHERE ${whereClause}`;
    const dataSql = `SELECT * FROM TM.V_ATTENDANCE_FULL WHERE ${whereClause} ORDER BY ATTENDANCE_DATE DESC, ATTENDANCE_DAY_ID DESC OFFSET :row_offset ROWS FETCH NEXT :pageSize ROWS ONLY`;

    let connection;
    try {
      connection = await db.getConnection();
      await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = ${this.SCHEMA}`, [], { autoCommit: false });

      const [countResult, dataResult] = await Promise.all([
        connection.execute(countSql, bindsCount, { outFormat: oracledb.OUT_FORMAT_OBJECT }),
        connection.execute(dataSql, bindsData, { outFormat: oracledb.OUT_FORMAT_OBJECT })
      ]);

      const totalRecords = countResult.rows && countResult.rows[0] ? Number(countResult.rows[0].CNT) : 0;
      const rows = (dataResult.rows || []).map(r => this.convertRowToSnakeCase(r));

      return { rows, totalRecords, page, pageSize };
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to fetch attendance logs.', error);
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (_) {}
      }
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
