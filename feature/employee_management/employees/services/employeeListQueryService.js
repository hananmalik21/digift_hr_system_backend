/**
 * Shared employee list query parsing and DB fetch (list + export).
 */
import oracledb from 'oracledb';
import {
  buildEmployeeAssignmentsListFromClause,
  buildSearchKeyCondition,
  normalizeEmployeeListRowWithPosition
} from '../../../../utils/employeeAssignmentViewUtils.js';
import {
  employeeAccessBypassBindClause,
  employeeAccessOptionsFromReq
} from '../../../../utils/userContext.js';
import { paginateForExport } from '@digifyhr/common/excel';

function hexToBuffer(hex) {
  if (hex == null || typeof hex !== 'string') return null;
  const value = hex.trim().replace(/-/g, '');
  if (!/^[0-9A-Fa-f]{32}$/.test(value)) return null;
  return Buffer.from(value, 'hex');
}

/**
 * @param {import('express').Request} req
 * @param {number} actingUserId
 * @returns {{ errors: string[], filters: Record<string, unknown>|null }}
 */
export function parseEmployeeListQuery(req, actingUserId) {
  const errors = [];
  const q = req.query;

  const enterpriseIdRaw = q.enterpriseId ?? q.enterprise_id;
  const enterpriseId = enterpriseIdRaw != null && enterpriseIdRaw !== '' ? Number(enterpriseIdRaw) : NaN;
  if (!Number.isFinite(enterpriseId) || enterpriseId < 1) {
    errors.push('enterpriseId (or enterprise_id) is required and must be a positive number');
  }

  const orgUnitIdHexRaw = (q.org_unit_id ?? q.orgUnitId) != null && String(q.org_unit_id ?? q.orgUnitId).trim() !== ''
    ? String(q.org_unit_id ?? q.orgUnitId).trim()
    : null;
  const levelCodeRaw = (q.level_code ?? q.levelCode) != null && String(q.level_code ?? q.levelCode).trim() !== ''
    ? String(q.level_code ?? q.levelCode).trim()
    : null;

  if (levelCodeRaw != null && (orgUnitIdHexRaw == null || orgUnitIdHexRaw === '')) {
    errors.push('level_code requires org_unit_id');
  }

  const orgUnitIdHexForJson = orgUnitIdHexRaw ? orgUnitIdHexRaw.replace(/-/g, '').trim().toUpperCase() : null;
  if (orgUnitIdHexRaw && (!/^[0-9A-Fa-f]{32}$/.test(orgUnitIdHexForJson))) {
    errors.push('org_unit_id must be a 32-character hex string');
  }

  const positionIdHex = (q.positionId ?? q.position_id) != null && String(q.positionId ?? q.position_id).trim() !== ''
    ? String(q.positionId ?? q.position_id).trim()
    : null;
  const jobFamilyIdRaw = q.jobFamilyId ?? q.job_family_id;
  const jobLevelIdRaw = q.jobLevelId ?? q.job_level_id;
  const gradeIdRaw = q.gradeId ?? q.grade_id;
  const jobFamilyId = jobFamilyIdRaw != null && jobFamilyIdRaw !== '' ? parseInt(jobFamilyIdRaw, 10) : null;
  const jobLevelId = jobLevelIdRaw != null && jobLevelIdRaw !== '' ? parseInt(jobLevelIdRaw, 10) : null;
  const gradeId = gradeIdRaw != null && gradeIdRaw !== '' ? parseInt(gradeIdRaw, 10) : null;

  const positionIdBuf = hexToBuffer(positionIdHex);
  if (positionIdHex != null && positionIdBuf == null) {
    errors.push('positionId must be a 32-character hex string');
  }

  const searchRaw = q.search != null && String(q.search).trim() !== '' ? String(q.search).trim() : null;
  const employeeStatusRaw = (q.employee_status ?? q.employeeStatus) != null && String(q.employee_status ?? q.employeeStatus).trim() !== ''
    ? String(q.employee_status ?? q.employeeStatus).trim()
    : null;

  if (errors.length) {
    return { errors, filters: null };
  }

  return {
    errors,
    filters: {
      userId: actingUserId,
      enterpriseId,
      bypassEmployeeAccess: employeeAccessOptionsFromReq(req).bypass,
      org_unit_id_hex: orgUnitIdHexForJson,
      level_code: levelCodeRaw ?? null,
      positionId: positionIdBuf,
      jobFamilyId: Number.isFinite(jobFamilyId) ? jobFamilyId : null,
      jobLevelId: Number.isFinite(jobLevelId) ? jobLevelId : null,
      gradeId: Number.isFinite(gradeId) ? gradeId : null,
      search: searchRaw,
      employee_status: employeeStatusRaw
    }
  };
}

/**
 * @param {Record<string, unknown>} filters
 */
export function buildEmployeeListWhereAndBinds(filters) {
  const hasJsonFilter = filters.org_unit_id_hex != null && filters.org_unit_id_hex !== '';
  const hasLevelCode = hasJsonFilter && filters.level_code != null && filters.level_code !== '';
  const employeeStatusTrimmed = filters.employee_status != null && String(filters.employee_status).trim() !== ''
    ? String(filters.employee_status).trim().toUpperCase()
    : null;
  const searchTrimmed = filters.search != null && String(filters.search).trim() !== ''
    ? String(filters.search).trim()
    : null;

  const conditions = [
    'v.ENTERPRISE_ID = :enterprise_id',
    '(:position_id IS NULL OR v.POSITION_ID = :position_id)',
    '(:job_family_id IS NULL OR v.JOB_FAMILY_ID = :job_family_id)',
    '(:job_level_id IS NULL OR v.JOB_LEVEL_ID = :job_level_id)',
    '(:grade_id IS NULL OR v.GRADE_ID = :grade_id)'
  ];

  const sharedBinds = {
    user_id: filters.userId,
    enterprise_id: filters.enterpriseId,
    position_id: {
      val: filters.positionId ?? null,
      dir: oracledb.BIND_IN,
      type: oracledb.DB_TYPE_RAW,
      maxSize: 16
    },
    job_family_id: filters.jobFamilyId ?? null,
    job_level_id: filters.jobLevelId ?? null,
    grade_id: filters.gradeId ?? null
  };

  if (hasJsonFilter) {
    if (hasLevelCode) {
      conditions.push(
        `JSON_EXISTS(v.ORG_STRUCTURE_LIST_JSON, '$[*]?(@.level_code == $lvl && @.org_unit_id == $oid)' PASSING :org_unit_id_hex AS "oid", :level_code AS "lvl")`
      );
      sharedBinds.org_unit_id_hex = filters.org_unit_id_hex;
      sharedBinds.level_code = filters.level_code;
    } else {
      conditions.push(
        `JSON_EXISTS(v.ORG_STRUCTURE_LIST_JSON, '$[*]?(@.org_unit_id == $oid)' PASSING :org_unit_id_hex AS "oid")`
      );
      sharedBinds.org_unit_id_hex = filters.org_unit_id_hex;
    }
  }

  if (employeeStatusTrimmed) {
    conditions.push('v.EMPLOYEE_STATUS = :employee_status');
    sharedBinds.employee_status = employeeStatusTrimmed;
  }

  if (searchTrimmed) {
    conditions.push(buildSearchKeyCondition('search_key'));
    sharedBinds.search_key = searchTrimmed;
  }

  const accessOptions = filters.bypassEmployeeAccess ? { bypass: true } : undefined;
  if (filters.bypassEmployeeAccess) {
    conditions.push(employeeAccessBypassBindClause(':user_id'));
  }

  const baseFrom = buildEmployeeAssignmentsListFromClause(accessOptions);
  const whereClause = conditions.join(' AND ');
  const countSql = `SELECT COUNT(*) AS total_records FROM ${baseFrom} WHERE ${whereClause}`;

  const dataBinds = {
    ...sharedBinds,
    offset: filters.offset,
    page_size: filters.pageSize
  };
  const dataSql = `SELECT v.* FROM ${baseFrom} WHERE ${whereClause}
  ORDER BY v.EMPLOYEE_ID NULLS LAST
  OFFSET :offset ROWS FETCH NEXT :page_size ROWS ONLY`;

  return { countSql, dataSql, countBinds: sharedBinds, dataBinds };
}

/**
 * @param {import('oracledb').Connection} connection
 * @param {Record<string, unknown>} filters
 * @returns {Promise<{ rows: object[], total: number }>}
 */
export async function fetchEmployeeListPage(connection, filters) {
  const { countSql, dataSql, countBinds, dataBinds } = buildEmployeeListWhereAndBinds(filters);

  const [countResult, dataResult] = await Promise.all([
    connection.execute(countSql, countBinds, { outFormat: oracledb.OUT_FORMAT_OBJECT }),
    connection.execute(dataSql, dataBinds, { outFormat: oracledb.OUT_FORMAT_OBJECT })
  ]);

  const total = countResult.rows?.[0] ? Number(countResult.rows[0].TOTAL_RECORDS) : 0;
  const rows = (dataResult.rows ?? []).map((row) => normalizeEmployeeListRowWithPosition(row));

  return { rows, total };
}

/**
 * @param {import('oracledb').Connection} connection
 * @param {Record<string, unknown>} filters
 * @param {{ pageSize?: number, maxRows?: number }} [options]
 * @returns {Promise<{ employees: object[], total: number }>}
 */
export async function fetchEmployeesForExport(connection, filters, options = {}) {
  const { rows, total } = await paginateForExport({
    exportOptions: options,
    fetchPage: (page, pageSize) => {
      const offset = (page - 1) * pageSize;
      return fetchEmployeeListPage(connection, { ...filters, offset, pageSize });
    },
    getRows: (result) => result.rows ?? []
  });

  return { employees: rows, total };
}
