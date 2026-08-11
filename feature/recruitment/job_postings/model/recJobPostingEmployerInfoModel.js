/**
 * Resolve employer info for a job posting.
 * Hierarchy / COMPANY / employer fallback run in Oracle (view or fallback SQL).
 */

import oracledb from 'oracledb';
import { DatabaseError, NotFoundError, ValidationError } from '../../../../utils/errors/index.js';
import { hexToRawBuffer } from '../../../../utils/guidUtils.js';
import { withConnection } from '../../../../utils/oraclePackageUtils.js';
import { MESSAGES } from '../utils/recJobPostingEmployerInfoConstants.js';
import {
  mapJobPostingEmployerInfoRow,
  toJobPostingEmployerInfoApiData
} from '../utils/recJobPostingEmployerInfoMapper.js';
import {
  FALLBACK_SELECT_BY_RAW,
  VIEW_SELECT_BY_HEX
} from '../utils/recJobPostingEmployerInfoSql.js';

const ROW_OPTS = { outFormat: oracledb.OUT_FORMAT_OBJECT };

function hexStringBind(hex32) {
  return {
    posting_guid: {
      val: hex32,
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 32
    }
  };
}

function raw16Bind(hex32) {
  return {
    posting_guid: {
      val: hexToRawBuffer(hex32),
      dir: oracledb.BIND_IN,
      type: oracledb.BUFFER,
      maxSize: 16
    }
  };
}

/**
 * @param {import('oracledb').Connection} connection
 * @param {string} hex32
 * @returns {Promise<Record<string, unknown>|null>}
 */
async function fetchRow(connection, hex32) {
  try {
    const viewResult = await connection.execute(
      VIEW_SELECT_BY_HEX,
      hexStringBind(hex32),
      ROW_OPTS
    );
    if (viewResult.rows?.[0]) return viewResult.rows[0];
    // View exists but no row → posting not found (do not run fallback as a second path).
    return null;
  } catch (_) {
    // View missing / invalid — resolve with inline hierarchical SQL.
  }

  const fallback = await connection.execute(
    FALLBACK_SELECT_BY_RAW,
    raw16Bind(hex32),
    ROW_OPTS
  );
  return fallback.rows?.[0] ?? null;
}

/**
 * @param {string} postingGuidHex — validated 32-char hex
 * @returns {Promise<{ message: string, data: Record<string, unknown> }>}
 */
export async function getJobPostingEmployerInfoByGuid(postingGuidHex) {
  const hex = String(postingGuidHex).trim().replace(/-/g, '').toUpperCase();

  try {
    return await withConnection(async (connection) => {
      const row = await fetchRow(connection, hex);
      if (!row) throw new NotFoundError(MESSAGES.POSTING_NOT_FOUND);

      const mapped = mapJobPostingEmployerInfoRow(row);
      if (String(mapped.requisition_found || '').toUpperCase() === 'N') {
        throw new NotFoundError(MESSAGES.REQUISITION_NOT_FOUND);
      }

      const data = toJobPostingEmployerInfoApiData(mapped);
      return {
        message: data.employer_info_guid ? MESSAGES.OK : MESSAGES.NONE,
        data
      };
    });
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof ValidationError) throw err;
    throw new DatabaseError(MESSAGES.READ_ERROR, err, MESSAGES.READ_ERROR);
  }
}
