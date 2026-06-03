import oracledb from 'oracledb';
import {
  fetchPaginatedRows,
  rethrowUnlessOperational,
  ROW_OPTS,
  withConnection
} from '../../shared/recViewModelUtils.js';
import { parseListPagination } from '../../shared/recViewQueryValidators.js';
import { buildApplicationListFilters } from '../utils/recApplicationListFilters.js';
import {
  APPLICATION_SELECT_SQL,
  LOG_TAG,
  NOTES_DETAIL_MAX_ROWS,
  NOTES_JOIN_SQL,
  NOTE_SELECT_SQL,
  READ_ERROR_MESSAGE,
  REC_APPLICATIONS_VIEW,
  REC_APPLICATION_STAGE_HISTORY_VIEW,
  STAGE_HISTORY_DETAIL_MAX_ROWS,
  STAGE_HISTORY_READ_ERROR_MESSAGE,
  STAGE_HISTORY_SELECT_SQL
} from '../utils/recApplicationConstants.js';
import {
  mapApplicationDetailRow,
  mapApplicationListRow,
  mapApplicationNoteDetailEntry,
  mapStageHistoryDetailEntry,
  mapStageHistoryListRow
} from '../utils/recApplicationMappers.js';
import {
  APPLICATION_BY_GUID_WHERE,
  applicationGuidEnterpriseBinds,
  NOTES_BY_APPLICATION_WHERE
} from '../utils/recApplicationRowUtils.js';
import { parseApplicationSort, parseStageHistorySort } from '../utils/recApplicationViewValidators.js';

async function listApplicationNotesForDetail(applicationGuidHex, enterpriseId) {
  const sql = `SELECT ${NOTE_SELECT_SQL} FROM ${NOTES_JOIN_SQL}
    ${NOTES_BY_APPLICATION_WHERE}
    ORDER BY n.CREATION_DATE DESC NULLS LAST, n.NOTE_ID DESC
    FETCH FIRST :max_rows ROWS ONLY`;

  const binds = {
    ...applicationGuidEnterpriseBinds(applicationGuidHex, enterpriseId),
    max_rows: { val: NOTES_DETAIL_MAX_ROWS, dir: oracledb.BIND_IN, type: oracledb.NUMBER }
  };

  return await withConnection(async (connection) => {
    const r = await connection.execute(sql, binds, ROW_OPTS);
    return (r.rows || []).map((row) => mapApplicationNoteDetailEntry(row));
  });
}

async function listStageHistoryForApplicationDetail(applicationGuidHex, enterpriseId) {
  const sql = `SELECT ${STAGE_HISTORY_SELECT_SQL} FROM ${REC_APPLICATION_STAGE_HISTORY_VIEW} v
    ${APPLICATION_BY_GUID_WHERE}
    ORDER BY v.CREATION_DATE DESC NULLS LAST, v.STAGE_HISTORY_ID DESC
    FETCH FIRST :max_rows ROWS ONLY`;

  const binds = {
    ...applicationGuidEnterpriseBinds(applicationGuidHex, enterpriseId),
    max_rows: { val: STAGE_HISTORY_DETAIL_MAX_ROWS, dir: oracledb.BIND_IN, type: oracledb.NUMBER }
  };

  return await withConnection(async (connection) => {
    const r = await connection.execute(sql, binds, ROW_OPTS);
    return (r.rows || []).map((row) => mapStageHistoryDetailEntry(row));
  });
}

/**
 * @param {Record<string, unknown>|undefined} query
 */
export async function listApplicationsFromView(query) {
  try {
    const { page, limit } = parseListPagination(query);
    const { whereSql, binds } = buildApplicationListFilters(query);
    const selectSql = `SELECT ${APPLICATION_SELECT_SQL} FROM ${REC_APPLICATIONS_VIEW} v`;

    return await withConnection((connection) =>
      fetchPaginatedRows(connection, {
        view: REC_APPLICATIONS_VIEW,
        selectSql,
        whereSql,
        binds,
        orderSql: parseApplicationSort(query),
        page,
        limit,
        mapRow: mapApplicationListRow
      })
    );
  } catch (err) {
    rethrowUnlessOperational(err, `${LOG_TAG} listApplicationsFromView`, READ_ERROR_MESSAGE);
  }
}

/** @param {string} applicationGuidHex @param {number} enterpriseId */
export async function applicationExistsInApplicationsView(applicationGuidHex, enterpriseId) {
  const sql = `SELECT 1 AS FOUND FROM ${REC_APPLICATIONS_VIEW} v ${APPLICATION_BY_GUID_WHERE} FETCH FIRST 1 ROWS ONLY`;

  try {
    return await withConnection(async (connection) => {
      const r = await connection.execute(
        sql,
        applicationGuidEnterpriseBinds(applicationGuidHex, enterpriseId),
        ROW_OPTS
      );
      return Boolean(r.rows?.[0]);
    });
  } catch (err) {
    rethrowUnlessOperational(err, `${LOG_TAG} applicationExistsInApplicationsView`, READ_ERROR_MESSAGE);
  }
}

/**
 * @param {string} applicationGuidHex
 * @param {number} enterpriseId
 * @param {Record<string, unknown>|undefined} query
 */
export async function listApplicationStageHistoryFromView(applicationGuidHex, enterpriseId, query) {
  try {
    const { page, limit } = parseListPagination(query);
    const selectSql = `SELECT ${STAGE_HISTORY_SELECT_SQL} FROM ${REC_APPLICATION_STAGE_HISTORY_VIEW} v`;

    return await withConnection((connection) =>
      fetchPaginatedRows(connection, {
        view: REC_APPLICATION_STAGE_HISTORY_VIEW,
        selectSql,
        whereSql: APPLICATION_BY_GUID_WHERE,
        binds: applicationGuidEnterpriseBinds(applicationGuidHex, enterpriseId),
        orderSql: parseStageHistorySort(query),
        page,
        limit,
        mapRow: mapStageHistoryListRow
      })
    );
  } catch (err) {
    rethrowUnlessOperational(
      err,
      `${LOG_TAG} listApplicationStageHistoryFromView`,
      STAGE_HISTORY_READ_ERROR_MESSAGE
    );
  }
}

/** @param {string} applicationGuidHex @param {number} enterpriseId */
export async function getApplicationByGuidFromView(applicationGuidHex, enterpriseId) {
  const sql = `SELECT ${APPLICATION_SELECT_SQL} FROM ${REC_APPLICATIONS_VIEW} v
    ${APPLICATION_BY_GUID_WHERE} FETCH FIRST 1 ROWS ONLY`;

  try {
    const detail = await withConnection(async (connection) => {
      const r = await connection.execute(
        sql,
        applicationGuidEnterpriseBinds(applicationGuidHex, enterpriseId),
        ROW_OPTS
      );
      const row = r.rows?.[0];
      return row ? mapApplicationDetailRow(row) : null;
    });

    if (!detail) return null;

    const [stage_history, notes] = await Promise.all([
      listStageHistoryForApplicationDetail(applicationGuidHex, enterpriseId),
      listApplicationNotesForDetail(applicationGuidHex, enterpriseId)
    ]);
    detail.stage_history = stage_history;
    detail.notes = notes;
    return detail;
  } catch (err) {
    rethrowUnlessOperational(err, `${LOG_TAG} getApplicationByGuidFromView`, READ_ERROR_MESSAGE);
  }
}
