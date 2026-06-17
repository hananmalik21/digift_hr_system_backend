/**
 * Attendance Logs Controller
 * GET /api/tm/attendance/logs - paginated list from TM.V_ATTENDANCE_FULL
 * GET /api/tm/attendance/logs/:attendance_day_id - single record by attendance_day_id
 */
import express from 'express';
import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { getAttendanceLogsList, getAttendanceLogById, getAttendanceLogsForExport } from '../model/attendanceLogsModel.js';
import { buildAttendanceLogsExcelBuffer } from '../services/attendanceLogsExportService.js';
import { sendExcelExport } from '../../../../utils/excel/index.js';
import { sendLogsListSuccess, sendLogDetailSuccess, sendValidationError, sendDatabaseError, sendError } from '../view/attendanceView.js';
import { ValidationError, DatabaseError } from '../../../../utils/errors/index.js';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';

const router = express.Router();

router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

function optNum(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function optStr(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function buildLogsFilters(q) {
  const enterpriseId = optNum(q.enterpriseId);
  return {
    enterpriseId,
    fromDate: optStr(q.fromDate),
    toDate: optStr(q.toDate),
    employeeNumber: optStr(q.employeeNumber),
    employeeId: optNum(q.employeeId),
    attendanceStatus: optStr(q.attendanceStatus),
    dayCategory: optStr(q.dayCategory),
    inState: optStr(q.inState),
    outState: optStr(q.outState),
    sourceType: optStr(q.sourceType),
    levelCode: optStr(q.levelCode ?? q.level_code),
    orgUnitId: optStr(q.orgUnitId ?? q.org_unit_id)
  };
}

function buildLogsSort(q) {
  return {
    sortBy: (q.sortBy === 'employee_number') ? 'employee_number' : 'attendance_date',
    sortDir: String(q.sortDir || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC'
  };
}

/**
 * @route   GET /api/tm/attendance/logs
 * @query   enterpriseId (required), fromDate, toDate, employeeNumber, employeeId,
 *          attendanceStatus, dayCategory, inState, outState, sourceType, levelCode, orgUnitId,
 *          page, pageSize, sortBy, sortDir
 */
router.get('/', asyncHandler(async (req, res) => {
  const q = req.query || {};
  const enterpriseId = optNum(q.enterpriseId);
  if (enterpriseId == null || enterpriseId <= 0) {
    return sendValidationError(res, req, new ValidationError('enterpriseId is required and must be a positive number', ['enterpriseId is required']));
  }

  const filters = buildLogsFilters(q);
  const page = Math.max(1, optNum(q.page) ?? 1);
  const pageSize = Math.min(100, Math.max(1, optNum(q.pageSize) ?? 25));
  const sort = buildLogsSort(q);

  try {
    const { rows, total } = await getAttendanceLogsList(filters, { page, pageSize }, sort);
    const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
    const pagination = {
      page,
      page_size: pageSize,
      total,
      total_pages: totalPages,
      has_next: page < totalPages,
      has_previous: page > 1
    };
    return sendLogsListSuccess(res, req, enterpriseId, pagination, rows);
  } catch (error) {
    if (error instanceof ValidationError) return sendValidationError(res, req, error);
    if (error instanceof DatabaseError) return sendDatabaseError(res, req, error);
    return sendError(res, req, error);
  }
}));

/**
 * @route   GET /api/tm/attendance/logs/export
 * @desc    Same filters as list. Returns all matching rows as Excel.
 */
router.get('/export', asyncHandler(async (req, res) => {
  const q = req.query || {};
  const enterpriseId = optNum(q.enterpriseId);
  if (enterpriseId == null || enterpriseId <= 0) {
    return sendValidationError(res, req, new ValidationError('enterpriseId is required and must be a positive number', ['enterpriseId is required']));
  }

  try {
    const { rows } = await getAttendanceLogsForExport(buildLogsFilters(q), buildLogsSort(q));
    const { buffer, filename, rowCount } = await buildAttendanceLogsExcelBuffer({
      rows,
      enterpriseId
    });

    if (rowCount === 0) {
      return res.status(404).json({ success: false, message: 'No attendance logs found to export' });
    }

    return sendExcelExport(res, buffer, filename);
  } catch (error) {
    if (error instanceof ValidationError) return sendValidationError(res, req, error);
    if (error instanceof DatabaseError) return sendDatabaseError(res, req, error);
    return sendError(res, req, error);
  }
}));

/**
 * @route   GET /api/tm/attendance/logs/by-date
 * @query   enterpriseId (required), employeeId (required), attendanceDate (required, YYYY-MM-DD)
 * @desc    Calls TM.GET_ATTENDANCE_DAYS; returns { attendance_day, schedule, actual }.
 */
router.get('/by-date', asyncHandler(async (req, res) => {
  const { enterpriseId, employeeId, attendanceDate } = req.query;

  const enterpriseIdNum = optNum(enterpriseId);
  const employeeIdNum = optNum(employeeId);

  if (enterpriseIdNum == null || enterpriseIdNum <= 0) {
    return sendValidationError(res, req, new ValidationError('enterpriseId is required and must be a positive number', ['enterpriseId is required']));
  }
  if (employeeIdNum == null || employeeIdNum <= 0) {
    return sendValidationError(res, req, new ValidationError('employeeId is required and must be a positive number', ['employeeId is required']));
  }
  if (attendanceDate == null || String(attendanceDate).trim() === '') {
    return sendValidationError(res, req, new ValidationError('attendanceDate is required (YYYY-MM-DD)', ['attendanceDate is required']));
  }

  const attendanceDateFormatted = new Date(attendanceDate).toISOString().slice(0, 10);

  let connection;
  try {
    connection = await db.getConnection();
    await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = TM`, [], { autoCommit: false });

    const plsql = `
      BEGIN
        TM.GET_ATTENDANCE_DAYS(
          :enterpriseId,
          :employeeId,
          :attendanceDate,
          :dayObj,
          :schedObj,
          :actualObj
        );
      END;
    `;

    const binds = {
      enterpriseId: Number(enterpriseIdNum),
      employeeId: Number(employeeIdNum),
      attendanceDate: attendanceDateFormatted,
      dayObj: { type: oracledb.DB_TYPE_CLOB, dir: oracledb.BIND_OUT },
      schedObj: { type: oracledb.DB_TYPE_CLOB, dir: oracledb.BIND_OUT },
      actualObj: { type: oracledb.DB_TYPE_CLOB, dir: oracledb.BIND_OUT }
    };

    const result = await connection.execute(plsql, binds, { autoCommit: false });

    const out = result.outBinds ?? binds;
    const dayObj = out.dayObj ?? out.dayobj;
    const schedObj = out.schedObj ?? out.schedobj;
    const actualObj = out.actualObj ?? out.actualobj;

    const readClob = (lob) => {
      const L = lob?.val ?? lob;
      if (L == null) return Promise.resolve(null);
      if (typeof L.getData === 'function') return L.getData();
      if (typeof L === 'string') return Promise.resolve(L);
      return Promise.resolve(L.val != null ? String(L.val) : null);
    };

    const [dayStr, schedStr, actualStr] = await Promise.all([
      readClob(dayObj),
      readClob(schedObj),
      readClob(actualObj)
    ]);

    const parseJson = (s) => (s != null && s !== '' ? JSON.parse(typeof s === 'string' ? s : s.toString()) : null);
    const day = parseJson(dayStr);
    const sched = parseJson(schedStr);
    const actual = parseJson(actualStr);

    return res.status(200).json({
      status: true,
      message: 'Fetched successfully',
      data: {
        attendance_day: day,
        schedule: sched,
        actual
      }
    });
  } catch (error) {
    if (error instanceof ValidationError) return sendValidationError(res, req, error);
    if (error instanceof DatabaseError) return sendDatabaseError(res, req, error);
    return sendError(res, req, error);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}));

/**
 * @route   GET /api/tm/attendance/logs/:attendance_day_id
 * @query   enterpriseId (required)
 */
router.get('/:attendance_day_id', asyncHandler(async (req, res) => {
  const q = req.query || {};
  const enterpriseId = optNum(q.enterpriseId);
  const rawId = req.params.attendance_day_id;
  const attendanceDayId = rawId != null && String(rawId).trim() !== ''
    ? (optNum(rawId) ?? String(rawId).trim())
    : null;

  if (enterpriseId == null || enterpriseId <= 0) {
    return sendValidationError(res, req, new ValidationError('enterpriseId is required and must be a positive number', ['enterpriseId is required']));
  }
  if (attendanceDayId == null || attendanceDayId === '') {
    return sendValidationError(res, req, new ValidationError('attendance_day_id is required', ['attendance_day_id is required']));
  }

  try {
    const record = await getAttendanceLogById(enterpriseId, attendanceDayId);
    if (!record) {
      return res.status(404).json({
        status: false,
        message: 'Attendance day not found',
        data: null
      });
    }
    return sendLogDetailSuccess(res, req, record);
  } catch (error) {
    if (error instanceof ValidationError) return sendValidationError(res, req, error);
    if (error instanceof DatabaseError) return sendDatabaseError(res, req, error);
    return sendError(res, req, error);
  }
}));

export default router;
