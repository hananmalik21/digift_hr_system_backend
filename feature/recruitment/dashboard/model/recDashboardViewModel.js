import oracledb from 'oracledb';
import {
  rethrowUnlessOperational,
  ROW_OPTS,
  withConnection
} from '../../shared/recViewModelUtils.js';
import {
  DASHBOARD_SECTIONS,
  LOG_TAG,
  READ_ERROR_MESSAGE,
  selectSqlFromColumns
} from '../utils/recDashboardConstants.js';
import { mapStatsViewRow } from '../utils/recDashboardMapper.js';

const SECTION_BY_KEY = Object.fromEntries(DASHBOARD_SECTIONS.map((section) => [section.key, section]));

/**
 * @param {import('oracledb').Connection} connection
 * @param {string} view
 * @param {import('../utils/recDashboardConstants.js').StatsColumn[]} columns
 * @param {number} enterpriseId
 */
async function fetchStatsRow(connection, view, columns, enterpriseId) {
  const sql = `SELECT ${selectSqlFromColumns(columns)}
    FROM ${view} v
    WHERE v.ENTERPRISE_ID = :p_enterprise_id
    FETCH FIRST 1 ROWS ONLY`;

  const result = await connection.execute(
    sql,
    { p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER } },
    ROW_OPTS
  );
  return mapStatsViewRow(result.rows?.[0], columns, enterpriseId);
}

/**
 * @param {string} view
 * @param {import('../utils/recDashboardConstants.js').StatsColumn[]} columns
 * @param {number} enterpriseId
 */
async function getStatsFromView(view, columns, enterpriseId) {
  try {
    return await withConnection((connection) =>
      fetchStatsRow(connection, view, columns, enterpriseId)
    );
  } catch (err) {
    return rethrowUnlessOperational(err, `${LOG_TAG} ${view}`, READ_ERROR_MESSAGE);
  }
}

/**
 * @param {'candidates'|'applications'|'interviews'|'offers'} sectionKey
 * @param {number} enterpriseId
 */
export async function getDashboardSectionStats(sectionKey, enterpriseId) {
  const section = SECTION_BY_KEY[sectionKey];
  if (!section) {
    throw new Error(`Unknown recruitment dashboard section: ${sectionKey}`);
  }
  return getStatsFromView(section.view, section.columns, enterpriseId);
}

/** @param {number} enterpriseId */
export async function getCandidateStats(enterpriseId) {
  return getDashboardSectionStats('candidates', enterpriseId);
}

/** @param {number} enterpriseId */
export async function getApplicationStats(enterpriseId) {
  return getDashboardSectionStats('applications', enterpriseId);
}

/** @param {number} enterpriseId */
export async function getInterviewStats(enterpriseId) {
  return getDashboardSectionStats('interviews', enterpriseId);
}

/** @param {number} enterpriseId */
export async function getOfferStats(enterpriseId) {
  return getDashboardSectionStats('offers', enterpriseId);
}

/** @param {number} enterpriseId */
export async function getCombinedDashboardStats(enterpriseId) {
  try {
    return await withConnection(async (connection) => {
      const data = {};
      for (const section of DASHBOARD_SECTIONS) {
        data[section.key] = await fetchStatsRow(
          connection,
          section.view,
          section.columns,
          enterpriseId
        );
      }
      return data;
    });
  } catch (err) {
    return rethrowUnlessOperational(err, `${LOG_TAG} combined`, READ_ERROR_MESSAGE);
  }
}
