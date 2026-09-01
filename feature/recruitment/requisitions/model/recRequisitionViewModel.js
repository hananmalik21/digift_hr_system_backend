import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { hexToRawBuffer } from '@digifyhr/common';
import { DatabaseError, NotFoundError, ValidationError } from '../../../../utils/errors/index.js';
import { escapeLikePattern } from '@digifyhr/common';
import { mapViewRowToDetail, mapViewRowToListItem } from '../utils/recRequisitionViewMapper.js';
import { pickQueryFilterCode } from '../utils/recRequisitionListFilters.js';
import {
  parseEnterpriseIdFromQuery,
  parseOrgUnitHierarchyFilter,
  resolveStatusTabClause
} from '../utils/recRequisitionViewValidators.js';
import { paginateForExport } from '@digifyhr/common/excel';

const VIEW = process.env.REC_REQUISITION_LIST_V || 'REC.V_REQUISITION_LIST';
const LOG_TAG = 'recRequisitionViewModel';
const ROW_OPTS = { outFormat: oracledb.OUT_FORMAT_OBJECT };
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

function isNonEmptyTrimmed(raw) {
  return raw !== undefined && raw !== null && String(raw).trim() !== '';
}

function parsePagePageSize(query) {
  const rawPage = query?.page;
  const rawSize = query?.page_size ?? query?.pageSize;

  let page = DEFAULT_PAGE;
  if (isNonEmptyTrimmed(rawPage)) {
    const p = Number.parseInt(String(rawPage), 10);
    if (!Number.isFinite(p) || !Number.isInteger(p) || p < 1) {
      throw new ValidationError('Validation failed', ['page must be a positive integer']);
    }
    page = p;
  }

  let page_size = DEFAULT_PAGE_SIZE;
  if (isNonEmptyTrimmed(rawSize)) {
    const s = Number.parseInt(String(rawSize), 10);
    if (!Number.isFinite(s) || !Number.isInteger(s) || s < 1) {
      throw new ValidationError('Validation failed', ['page_size must be a positive integer']);
    }
    page_size = Math.min(s, MAX_PAGE_SIZE);
  }

  return { page, page_size };
}

function parseDateFilter(raw, fieldName) {
  if (!isNonEmptyTrimmed(raw)) return null;
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) {
    throw new ValidationError('Validation failed', [`${fieldName} must be a valid date`]);
  }
  return d;
}

function parsePositiveIntFilter(raw, fieldName) {
  if (!isNonEmptyTrimmed(raw)) return null;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1) {
    throw new ValidationError('Validation failed', [`${fieldName} must be a positive integer`]);
  }
  return n;
}

function parseGuidHexFilter(raw, fieldName) {
  if (!isNonEmptyTrimmed(raw)) return null;
  const compact = String(raw).trim().replace(/-/g, '').toUpperCase();
  if (!/^[0-9A-F]{32}$/.test(compact)) {
    throw new ValidationError('Validation failed', [`${fieldName} must be a 32-character hex GUID`]);
  }
  return compact;
}

/**
 * @param {Record<string, unknown>} query
 */
function buildListFilters(query) {
  const enterprise_id = parseEnterpriseIdFromQuery(query);
  const binds = {
    enterprise_id: { val: enterprise_id, dir: oracledb.BIND_IN, type: oracledb.NUMBER }
  };
  const parts = ['v.ENTERPRISE_ID = :enterprise_id'];

  if (isNonEmptyTrimmed(query?.status)) {
    parts.push(resolveStatusTabClause(query.status));
  }

  if (isNonEmptyTrimmed(query?.approval_status_code)) {
    const code = String(query.approval_status_code).trim().toUpperCase();
    binds.approval_status_code = { val: code, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 50 };
    parts.push('v.APPROVAL_STATUS_CODE = :approval_status_code');
  }

  if (isNonEmptyTrimmed(query?.open_status_code)) {
    const code = String(query.open_status_code).trim().toUpperCase();
    binds.open_status_code = { val: code, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 50 };
    parts.push('v.OPEN_STATUS_CODE = :open_status_code');
  }

  if (isNonEmptyTrimmed(query?.search)) {
    const pat = `%${escapeLikePattern(String(query.search).trim())}%`;
    binds.search_pat = { val: pat, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 4000 };
    parts.push(
      `(LOWER(v.REQUISITION_NUMBER) LIKE LOWER(:search_pat) ESCAPE '\\' OR LOWER(v.REQUISITION_TITLE) LIKE LOWER(:search_pat) ESCAPE '\\')`
    );
  }

  const priorityCode = pickQueryFilterCode(query, 'priority_code', 'priority');
  if (priorityCode) {
    binds.priority_code = { val: priorityCode, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 50 };
    parts.push(
      `UPPER(JSON_VALUE(v.REQUISITION_DETAIL_OBJ, '$.priority_code' ERROR ON ERROR)) = :priority_code`
    );
  }

  const workModeCode = pickQueryFilterCode(query, 'work_mode_code', 'work_mode');
  if (workModeCode) {
    binds.work_mode_code = { val: workModeCode, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 50 };
    parts.push(
      `UPPER(JSON_VALUE(v.REQUISITION_DETAIL_OBJ, '$.work_mode_code' ERROR ON ERROR)) = :work_mode_code`
    );
  }

  const employmentTypeCode = pickQueryFilterCode(query, 'employment_type_code', 'employment_type');
  if (employmentTypeCode) {
    binds.employment_type_code = {
      val: employmentTypeCode,
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 50
    };
    parts.push(
      `UPPER(JSON_VALUE(v.REQUISITION_DETAIL_OBJ, '$.employment_type_code' ERROR ON ERROR)) = :employment_type_code`
    );
  }

  const positionHex = parseGuidHexFilter(query?.position_id, 'position_id');
  if (positionHex) {
    binds.position_id_hex = { val: positionHex, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 32 };
    parts.push(
      `(UPPER(JSON_VALUE(v.POSITION_OBJ, '$.position_id' ERROR ON ERROR)) = :position_id_hex OR UPPER(JSON_VALUE(v.POSITION_OBJ, '$.position_guid' ERROR ON ERROR)) = :position_id_hex)`
    );
  }

  const orgFilter = parseOrgUnitHierarchyFilter(query);
  if (orgFilter.org_unit_id_hex) {
    binds.org_unit_id_hex = {
      val: orgFilter.org_unit_id_hex,
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 32
    };
    if (orgFilter.level_code) {
      binds.level_code = {
        val: orgFilter.level_code,
        dir: oracledb.BIND_IN,
        type: oracledb.STRING,
        maxSize: 50
      };
      parts.push(
        `JSON_EXISTS(v.ORG_HIERARCHY_JSON, '$[*]?(@.level_code == $lvl && @.org_unit_id == $oid)' PASSING :org_unit_id_hex AS "oid", :level_code AS "lvl")`
      );
    } else {
      parts.push(
        `JSON_EXISTS(v.ORG_HIERARCHY_JSON, '$[*]?(@.org_unit_id == $oid)' PASSING :org_unit_id_hex AS "oid")`
      );
    }
  }

  const jobFamilyId = parsePositiveIntFilter(query?.job_family_id, 'job_family_id');
  if (jobFamilyId != null) {
    binds.job_family_id = { val: jobFamilyId, dir: oracledb.BIND_IN, type: oracledb.NUMBER };
    parts.push(`TO_NUMBER(JSON_VALUE(v.JOB_FAMILY_OBJ, '$.job_family_id' ERROR ON ERROR)) = :job_family_id`);
  }

  const gradeId = parsePositiveIntFilter(query?.grade_id, 'grade_id');
  if (gradeId != null) {
    binds.grade_id = { val: gradeId, dir: oracledb.BIND_IN, type: oracledb.NUMBER };
    parts.push(`TO_NUMBER(JSON_VALUE(v.GRADE_OBJ, '$.grade_id' ERROR ON ERROR)) = :grade_id`);
  }

  const targetStartFrom = parseDateFilter(query?.target_start_from, 'target_start_from');
  if (targetStartFrom) {
    binds.target_start_from = { val: targetStartFrom, dir: oracledb.BIND_IN, type: oracledb.DATE };
    parts.push(
      `TO_DATE(JSON_VALUE(v.REQUISITION_DETAIL_OBJ, '$.target_start_date' ERROR ON ERROR), 'YYYY-MM-DD') >= TRUNC(:target_start_from)`
    );
  }

  const targetStartTo = parseDateFilter(query?.target_start_to, 'target_start_to');
  if (targetStartTo) {
    binds.target_start_to = { val: targetStartTo, dir: oracledb.BIND_IN, type: oracledb.DATE };
    parts.push(
      `TO_DATE(JSON_VALUE(v.REQUISITION_DETAIL_OBJ, '$.target_start_date' ERROR ON ERROR), 'YYYY-MM-DD') <= TRUNC(:target_start_to)`
    );
  }

  const createdFrom = parseDateFilter(query?.created_from, 'created_from');
  if (createdFrom) {
    binds.created_from = { val: createdFrom, dir: oracledb.BIND_IN, type: oracledb.DATE };
    parts.push(
      `TO_TIMESTAMP(JSON_VALUE(v.AUDIT_OBJ, '$.creation_date' ERROR ON ERROR), 'YYYY-MM-DD HH24:MI:SS') >= :created_from`
    );
  }

  const createdTo = parseDateFilter(query?.created_to, 'created_to');
  if (createdTo) {
    binds.created_to = { val: createdTo, dir: oracledb.BIND_IN, type: oracledb.DATE };
    parts.push(
      `TO_TIMESTAMP(JSON_VALUE(v.AUDIT_OBJ, '$.creation_date' ERROR ON ERROR), 'YYYY-MM-DD HH24:MI:SS') <= :created_to`
    );
  }

  return { whereSql: `WHERE ${parts.join(' AND ')}`, binds, enterprise_id };
}

async function withConnection(fn) {
  const connection = await db.getConnection();
  try {
    return await fn(connection);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

function rethrowUnlessOperational(err, context) {
  if (err instanceof ValidationError || err instanceof NotFoundError) throw err;
  console.error(`[${LOG_TAG}] ${context}`, err?.errorNum != null ? `ORA-${err.errorNum}` : '', '[redacted]');
  throw new DatabaseError('Unable to fetch requisitions. Please try again.', err);
}

/**
 * @param {Record<string, unknown>} query
 */
export async function listRequisitionsFromView(query) {
  try {
    const { page, page_size } = parsePagePageSize(query);
    const { whereSql, binds } = buildListFilters(query);

    const countSql = `SELECT COUNT(*) AS TOTAL_COUNT FROM ${VIEW} v ${whereSql}`;
    const dataSql = `SELECT v.* FROM ${VIEW} v ${whereSql} ORDER BY
      TO_TIMESTAMP(JSON_VALUE(v.AUDIT_OBJ, '$.last_update_date' ERROR ON ERROR), 'YYYY-MM-DD HH24:MI:SS') DESC NULLS LAST,
      v.REQUISITION_ID DESC`;

    return await withConnection(async (connection) => {
      const countResult = await connection.execute(countSql, binds, ROW_OPTS);
      const total =
        Number(countResult.rows?.[0]?.TOTAL_COUNT ?? countResult.rows?.[0]?.total_count ?? 0) || 0;

      const offset = (page - 1) * page_size;
      const dataResult = await connection.execute(
        `${dataSql} OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
        {
          ...binds,
          offset: { val: offset, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
          limit: { val: page_size, dir: oracledb.BIND_IN, type: oracledb.NUMBER }
        },
        ROW_OPTS
      );

      const rows = [];
      for (const row of dataResult.rows || []) {
        rows.push(await mapViewRowToListItem(row));
      }

      return { rows, total, page, pageSize: page_size };
    });
  } catch (err) {
    rethrowUnlessOperational(err, 'listRequisitionsFromView');
  }
}

/**
 * Fetch all requisitions matching filters for Excel export (paginates internally).
 * @param {Record<string, unknown>} query
 * @param {{ pageSize?: number, maxRows?: number }} [exportOptions]
 */
export async function listRequisitionsForExport(query, exportOptions = {}) {
  return paginateForExport({
    exportOptions,
    fetchPage: (page, pageSize) => listRequisitionsFromView({ ...query, page, page_size: pageSize })
  });
}

/**
 * @param {string} requisitionGuidHex
 * @param {number} enterpriseId
 */
export async function getRequisitionByGuidFromView(requisitionGuidHex, enterpriseId) {
  const guidBuf = hexToRawBuffer(requisitionGuidHex);
  const sql = `SELECT v.* FROM ${VIEW} v
    WHERE v.ENTERPRISE_ID = :enterprise_id AND v.REQUISITION_GUID = :guid_buf
    FETCH FIRST 1 ROWS ONLY`;

  try {
    return await withConnection(async (connection) => {
      const r = await connection.execute(
        sql,
        {
          enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
          guid_buf: { val: guidBuf, dir: oracledb.BIND_IN, type: oracledb.BUFFER, maxSize: 16 }
        },
        ROW_OPTS
      );
      const row = r.rows?.[0];
      if (!row) return null;
      return mapViewRowToDetail(row);
    });
  } catch (err) {
    rethrowUnlessOperational(err, 'getRequisitionByGuidFromView');
  }
}

/**
 * @param {Record<string, unknown>} query
 */
export async function getRequisitionSummaryCounts(query) {
  const enterprise_id = parseEnterpriseIdFromQuery(query);
  const sql = `
    SELECT
      COUNT(*) AS TOTAL,
      SUM(CASE WHEN v.APPROVAL_STATUS_CODE = 'DRAFT' THEN 1 ELSE 0 END) AS DRAFT,
      SUM(CASE WHEN v.APPROVAL_STATUS_CODE = 'PENDING_APPROVAL' THEN 1 ELSE 0 END) AS SUBMITTED,
      SUM(CASE WHEN v.APPROVAL_STATUS_CODE = 'APPROVED' THEN 1 ELSE 0 END) AS APPROVED,
      SUM(CASE WHEN v.APPROVAL_STATUS_CODE = 'APPROVED' AND v.OPEN_STATUS_CODE = 'OPEN' THEN 1 ELSE 0 END) AS OPEN,
      SUM(CASE WHEN v.APPROVAL_STATUS_CODE = 'APPROVED' AND v.OPEN_STATUS_CODE = 'CLOSED' THEN 1 ELSE 0 END) AS CLOSED
    FROM ${VIEW} v
    WHERE v.ENTERPRISE_ID = :enterprise_id`;

  try {
    return await withConnection(async (connection) => {
      const r = await connection.execute(
        sql,
        { enterprise_id: { val: enterprise_id, dir: oracledb.BIND_IN, type: oracledb.NUMBER } },
        ROW_OPTS
      );
      const row = r.rows?.[0] || {};
      return {
        total: Number(row.TOTAL ?? row.total ?? 0) || 0,
        draft: Number(row.DRAFT ?? row.draft ?? 0) || 0,
        submitted: Number(row.SUBMITTED ?? row.submitted ?? 0) || 0,
        approved: Number(row.APPROVED ?? row.approved ?? 0) || 0,
        open: Number(row.OPEN ?? row.open ?? 0) || 0,
        closed: Number(row.CLOSED ?? row.closed ?? 0) || 0
      };
    });
  } catch (err) {
    rethrowUnlessOperational(err, 'getRequisitionSummaryCounts');
  }
}
